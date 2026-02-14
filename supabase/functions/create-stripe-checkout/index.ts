import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.25.0?target=denonext'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

type CheckoutPlan = 'monthly' | 'lifetime'

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
const monthlyPriceId = Deno.env.get('STRIPE_PRICE_MONTHLY')
const lifetimePriceId = Deno.env.get('STRIPE_PRICE_LIFETIME')
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? 'http://localhost:4173'
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!stripeSecretKey) throw new Error('Missing STRIPE_SECRET_KEY')
if (!supabaseUrl) throw new Error('Missing SUPABASE_URL')
if (!supabaseAnonKey) throw new Error('Missing SUPABASE_ANON_KEY')
if (!supabaseServiceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })

const resolvePriceId = (plan: CheckoutPlan): string | null => {
  if (plan === 'monthly') return monthlyPriceId ?? null
  if (plan === 'lifetime') return lifetimePriceId ?? null
  return null
}

const isUuid = (value: string | null | undefined) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

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
  const user = authData.user

  let plan: CheckoutPlan | null = null
  try {
    const body = await req.json()
    if (body?.plan === 'monthly' || body?.plan === 'lifetime') {
      plan = body.plan
    }
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }
  if (!plan) {
    return jsonResponse({ error: 'Missing or invalid plan' }, 400)
  }

  const priceId = resolvePriceId(plan)
  if (!priceId) {
    return jsonResponse({ error: `Missing Stripe price for plan "${plan}"` }, 500)
  }

  const { data: profile } = await adminClient
    .from('profiles')
    .select('email, stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  let customerId = (profile?.stripe_customer_id as string | null | undefined) ?? null
  if (!customerId) {
    const createdCustomer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    })
    customerId = createdCustomer.id
  }

  const updates: Record<string, string> = {
    stripe_customer_id: customerId,
  }
  if (typeof user.email === 'string' && user.email.length > 0) {
    updates.email = user.email
  }
  await adminClient
    .from('profiles')
    .update(updates)
    .eq('user_id', user.id)

  const successUrl = `${siteUrl}/download/windows.html?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl = `${siteUrl}/landing.html#pricing`

  const metadata = {
    plan,
    supabase_user_id: user.id,
  }

  const createParams: Stripe.Checkout.SessionCreateParams = {
    mode: plan === 'monthly' ? 'subscription' : 'payment',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    metadata,
    success_url: successUrl,
    cancel_url: cancelUrl,
  }

  if (isUuid(user.id)) {
    createParams.client_reference_id = user.id
  }
  if (plan === 'monthly') {
    createParams.subscription_data = { metadata }
  } else {
    createParams.payment_intent_data = { metadata }
  }

  try {
    const session = await stripe.checkout.sessions.create(createParams)
    if (!session.url) {
      return jsonResponse({ error: 'Stripe did not return a checkout URL' }, 500)
    }
    return jsonResponse({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create checkout session'
    return jsonResponse({ error: message }, 500)
  }
})
