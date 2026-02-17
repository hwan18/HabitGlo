import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { paddleApiRequest } from '../_shared/paddle.ts'

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
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

  const { data: profile } = await adminClient
    .from('profiles')
    .select('paddle_customer_id, paddle_subscription_id')
    .eq('user_id', authData.user.id)
    .maybeSingle()

  const customerId = (profile?.paddle_customer_id as string | null | undefined) ?? null
  if (!customerId) {
    return jsonResponse(
      { error: 'No Paddle customer is associated with this account yet. Complete checkout first.' },
      400,
    )
  }

  const subscriptionId = (profile?.paddle_subscription_id as string | null | undefined) ?? null

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
    return jsonResponse({ url })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to create Paddle customer portal session'
    return jsonResponse({ error: message }, 500)
  }
})
