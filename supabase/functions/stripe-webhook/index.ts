import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.25.0?target=denonext'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
const monthlyPriceId = Deno.env.get('STRIPE_PRICE_MONTHLY') ?? ''
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!stripeSecretKey) throw new Error('Missing STRIPE_SECRET_KEY')
if (!stripeWebhookSecret) throw new Error('Missing STRIPE_WEBHOOK_SECRET')
if (!supabaseUrl) throw new Error('Missing SUPABASE_URL')
if (!supabaseServiceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })
const cryptoProvider = Stripe.createSubtleCryptoProvider()
const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey)

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const mapStripeSubscriptionStatus = (status: string) => {
  switch (status) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
      return 'past_due'
    case 'canceled':
      return 'canceled'
    default:
      return 'free'
  }
}

const resolveUserId = async (input: {
  metadataUserId?: unknown
  clientReferenceId?: unknown
  customerId?: unknown
  email?: unknown
}): Promise<string | null> => {
  if (isUuid(input.metadataUserId)) return input.metadataUserId
  if (isUuid(input.clientReferenceId)) return input.clientReferenceId

  if (typeof input.customerId === 'string' && input.customerId.length > 0) {
    const { data } = await adminClient
      .from('profiles')
      .select('user_id')
      .eq('stripe_customer_id', input.customerId)
      .maybeSingle()
    if (isUuid(data?.user_id)) return data.user_id
  }

  if (typeof input.email === 'string' && input.email.length > 0) {
    const { data } = await adminClient
      .from('profiles')
      .select('user_id')
      .ilike('email', input.email)
      .maybeSingle()
    if (isUuid(data?.user_id)) return data.user_id
  }

  return null
}

const updateProfileBilling = async (userId: string, updates: Record<string, unknown>) => {
  await adminClient
    .from('profiles')
    .update({
      ...updates,
      subscription_updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return jsonResponse({ error: 'Missing stripe-signature header' }, 400)
  }

  const rawBody = await req.text()
  let event: Stripe.Event

  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      stripeWebhookSecret,
      undefined,
      cryptoProvider,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid webhook signature'
    return jsonResponse({ error: message }, 400)
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const metadataUserId = session.metadata?.supabase_user_id
        const plan = session.metadata?.plan
        const customerId = typeof session.customer === 'string' ? session.customer : undefined
        const email = session.customer_details?.email ?? undefined
        const userId = await resolveUserId({
          metadataUserId,
          clientReferenceId: session.client_reference_id,
          customerId,
          email,
        })
        if (!userId) break

        if (plan === 'lifetime' && session.payment_status === 'paid') {
          await updateProfileBilling(userId, {
            subscription_status: 'lifetime',
            subscription_plan: 'lifetime',
            stripe_customer_id: customerId ?? null,
            stripe_subscription_id: null,
            subscription_current_period_end: null,
          })
        } else if (session.mode === 'subscription') {
          await updateProfileBilling(userId, {
            subscription_status: 'active',
            subscription_plan: 'monthly',
            stripe_customer_id: customerId ?? null,
            stripe_subscription_id:
              typeof session.subscription === 'string' ? session.subscription : null,
          })
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId =
          typeof subscription.customer === 'string' ? subscription.customer : undefined
        const userId = await resolveUserId({
          metadataUserId: subscription.metadata?.supabase_user_id,
          customerId,
        })
        if (!userId) break

        const currentPeriodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null
        const firstPriceId = subscription.items.data[0]?.price?.id
        const plan =
          subscription.metadata?.plan ??
          (firstPriceId && firstPriceId === monthlyPriceId ? 'monthly' : 'monthly')

        await updateProfileBilling(userId, {
          subscription_status: mapStripeSubscriptionStatus(subscription.status),
          subscription_plan: plan,
          stripe_customer_id: customerId ?? null,
          stripe_subscription_id: subscription.id,
          subscription_current_period_end: currentPeriodEnd,
        })
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : undefined
        const userId = await resolveUserId({
          metadataUserId: invoice.parent?.subscription_details?.metadata?.supabase_user_id,
          customerId,
        })
        if (!userId) break

        await updateProfileBilling(userId, {
          subscription_status: 'active',
          stripe_customer_id: customerId ?? null,
        })
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : undefined
        const userId = await resolveUserId({
          metadataUserId: invoice.parent?.subscription_details?.metadata?.supabase_user_id,
          customerId,
        })
        if (!userId) break

        await updateProfileBilling(userId, {
          subscription_status: 'past_due',
          stripe_customer_id: customerId ?? null,
        })
        break
      }

      default:
        break
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook handler failed'
    return jsonResponse({ error: message }, 500)
  }

  return jsonResponse({ received: true })
})
