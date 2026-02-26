import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { paddleApiRequest } from '../_shared/paddle.ts'

type BillingPlan = 'monthly' | 'lifetime'

type PaddlePortalSessionResponse = {
  data?: {
    urls?: {
      general?: {
        overview?: string
      }
    }
  }
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl) throw new Error('Missing SUPABASE_URL')
if (!supabaseAnonKey) throw new Error('Missing SUPABASE_ANON_KEY')
if (!supabaseServiceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

const readPlan = (value: unknown): BillingPlan | null => {
  const normalized = String(value ?? '').toLowerCase()
  if (normalized === 'monthly' || normalized === 'lifetime') return normalized
  return null
}

const isPaidRecurring = (status: unknown): boolean => {
  const normalized = String(status ?? '').toLowerCase()
  return normalized === 'active' || normalized === 'trialing' || normalized === 'past_due'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const requestedPlan = readPlan(body.plan)
  if (!requestedPlan) {
    return jsonResponse({ error: 'Invalid plan' }, 400)
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: req.headers.get('Authorization') ?? '' },
    },
  })
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey)

  const { data: authData, error: authError } = await authClient.auth.getUser()
  if (authError || !authData.user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('subscription_status, subscription_plan, paddle_customer_id, paddle_subscription_id')
    .eq('user_id', authData.user.id)
    .maybeSingle()

  if (profileError) {
    return jsonResponse({ error: profileError.message || 'Failed to load profile' }, 500)
  }

  const subscriptionStatus = String(profile?.subscription_status ?? '').toLowerCase()
  const subscriptionPlan = String(profile?.subscription_plan ?? '').toLowerCase()
  const customerId = typeof profile?.paddle_customer_id === 'string' ? profile.paddle_customer_id : null
  const subscriptionId =
    typeof profile?.paddle_subscription_id === 'string' ? profile.paddle_subscription_id : null

  if (subscriptionStatus === 'lifetime' || subscriptionPlan === 'lifetime') {
    return jsonResponse({ action: 'blocked', reason: 'already_lifetime' })
  }

  if (requestedPlan !== 'monthly') {
    return jsonResponse({ action: 'checkout' })
  }

  if (!isPaidRecurring(subscriptionStatus)) {
    return jsonResponse({ action: 'checkout' })
  }

  if (!customerId) {
    return jsonResponse({ action: 'checkout' })
  }

  try {
    const payload: Record<string, unknown> = {}
    if (subscriptionId) {
      payload.subscription_ids = [subscriptionId]
    }

    const response = await paddleApiRequest<PaddlePortalSessionResponse>(
      `/customers/${customerId}/portal-sessions`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )

    const url = response?.data?.urls?.general?.overview
    if (typeof url !== 'string' || !url.length) {
      return jsonResponse({ error: 'Paddle did not return a portal URL' }, 500)
    }

    return jsonResponse({ action: 'portal', reason: 'already_subscribed', url })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to create Paddle customer portal session'
    return jsonResponse({ error: message }, 500)
  }
})
