import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { isUuid, verifyPaddleSignature } from '../_shared/paddle.ts'

type PaddleNotification = {
  event_type?: unknown
  data?: unknown
}

const paddleWebhookSecret = Deno.env.get('PADDLE_NOTIFICATION_WEBHOOK_SECRET')
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!paddleWebhookSecret) throw new Error('Missing PADDLE_NOTIFICATION_WEBHOOK_SECRET')
if (!supabaseUrl) throw new Error('Missing SUPABASE_URL')
if (!supabaseServiceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey)

const readObject = (input: unknown): Record<string, unknown> | null =>
  typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : null

const readString = (input: unknown, key: string): string | null => {
  const object = readObject(input)
  if (!object) return null
  const value = object[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

const normalizePlan = (value: unknown): 'monthly' | 'lifetime' => {
  if (String(value ?? '').toLowerCase() === 'lifetime') return 'lifetime'
  return 'monthly'
}

const mapSubscriptionStatus = (value: unknown): 'trialing' | 'active' | 'past_due' | 'canceled' | 'free' => {
  const normalized = String(value ?? '').toLowerCase()
  switch (normalized) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'paused':
      return 'past_due'
    case 'canceled':
      return 'canceled'
    default:
      return 'free'
  }
}

const resolveUserId = async (input: {
  customData?: unknown
  customerId?: string | null
  email?: string | null
}): Promise<string | null> => {
  const customData = readObject(input.customData)
  const metadataUserId = customData?.supabase_user_id
  if (isUuid(metadataUserId)) return metadataUserId

  if (input.customerId) {
    const { data } = await adminClient
      .from('profiles')
      .select('user_id')
      .eq('paddle_customer_id', input.customerId)
      .maybeSingle()
    if (isUuid(data?.user_id)) return data.user_id
  }

  if (input.email) {
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

const handleTransactionCompleted = async (data: unknown) => {
  const payload = readObject(data)
  if (!payload) return

  const customData = payload.custom_data
  const customerId = readString(payload, 'customer_id')
  const subscriptionId = readString(payload, 'subscription_id')
  const customer = readObject(payload.customer)
  const customerEmail = customer ? readString(customer, 'email') : null
  const userId = await resolveUserId({ customData, customerId, email: customerEmail })
  if (!userId) return

  const customDataObj = readObject(customData)
  const plan = normalizePlan(customDataObj?.plan)

  if (!subscriptionId && plan === 'lifetime') {
    await updateProfileBilling(userId, {
      subscription_status: 'lifetime',
      subscription_plan: 'lifetime',
      paddle_customer_id: customerId,
      paddle_subscription_id: null,
      subscription_current_period_end: null,
    })
    return
  }

  // Fallback for recurring transactions before subscription webhook arrives.
  await updateProfileBilling(userId, {
    subscription_status: 'active',
    subscription_plan: plan,
    paddle_customer_id: customerId,
    paddle_subscription_id: subscriptionId,
  })
}

const handleSubscriptionEvent = async (data: unknown) => {
  const payload = readObject(data)
  if (!payload) return

  const customData = payload.custom_data
  const customerId = readString(payload, 'customer_id')
  const customer = readObject(payload.customer)
  const customerEmail = customer ? readString(customer, 'email') : null
  const userId = await resolveUserId({ customData, customerId, email: customerEmail })
  if (!userId) return

  const customDataObj = readObject(customData)
  const plan = normalizePlan(customDataObj?.plan)
  const subscriptionId = readString(payload, 'id')
  const status = mapSubscriptionStatus(readString(payload, 'status'))
  const currentBillingPeriod = readObject(payload.current_billing_period)
  const periodEnd = currentBillingPeriod ? readString(currentBillingPeriod, 'ends_at') : null

  await updateProfileBilling(userId, {
    subscription_status: status,
    subscription_plan: plan,
    paddle_customer_id: customerId,
    paddle_subscription_id: subscriptionId,
    subscription_current_period_end: periodEnd,
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const signature = req.headers.get('paddle-signature')
  if (!signature) {
    return jsonResponse({ error: 'Missing paddle-signature header' }, 400)
  }

  const rawBody = await req.text()
  const isValid = await verifyPaddleSignature({
    signatureHeader: signature,
    rawBody,
    secretKey: paddleWebhookSecret,
  })
  if (!isValid) {
    return jsonResponse({ error: 'Invalid Paddle signature' }, 400)
  }

  let event: PaddleNotification
  try {
    event = JSON.parse(rawBody) as PaddleNotification
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const eventType = typeof event.event_type === 'string' ? event.event_type : null
  if (!eventType) {
    return jsonResponse({ error: 'Missing event_type' }, 400)
  }

  try {
    if (eventType === 'transaction.completed') {
      await handleTransactionCompleted(event.data)
    } else if (eventType.startsWith('subscription.')) {
      await handleSubscriptionEvent(event.data)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook handler failed'
    return jsonResponse({ error: message }, 500)
  }

  return jsonResponse({ received: true })
})
