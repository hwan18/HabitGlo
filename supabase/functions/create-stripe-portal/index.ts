import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.25.0?target=denonext'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? 'http://localhost:4173'
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!stripeSecretKey) throw new Error('Missing STRIPE_SECRET_KEY')
if (!supabaseUrl) throw new Error('Missing SUPABASE_URL')
if (!supabaseAnonKey) throw new Error('Missing SUPABASE_ANON_KEY')
if (!supabaseServiceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })

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
    .select('stripe_customer_id')
    .eq('user_id', authData.user.id)
    .maybeSingle()

  const customerId = (profile?.stripe_customer_id as string | null | undefined) ?? null
  if (!customerId) {
    return jsonResponse({ error: 'No Stripe customer is associated with this account yet' }, 400)
  }

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/landing.html#pricing`,
    })
    return jsonResponse({ url: portal.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create billing portal session'
    return jsonResponse({ error: message }, 500)
  }
})
