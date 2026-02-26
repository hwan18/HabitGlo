import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { isUuid, paddleApiRequest, verifyPaddleSignatureDetailed } from '../_shared/paddle.ts'

type PaddleNotification = {
  event_type?: unknown
  data?: unknown
}

type ProfileBilling = {
  user_id: string
  subscription_status: string | null
  subscription_plan: string | null
  paddle_customer_id: string | null
  paddle_subscription_id: string | null
}

const paddleWebhookSecret = Deno.env.get('PADDLE_NOTIFICATION_WEBHOOK_SECRET')?.trim()
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const signatureMaxAgeSeconds = (() => {
  const raw = Deno.env.get('PADDLE_SIGNATURE_MAX_AGE_SECONDS')?.trim()
  if (!raw) return 300
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 300
  return parsed
})()

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

const isPaidRecurringStatus = (value: unknown): boolean => {
  const normalized = String(value ?? '').toLowerCase()
  return normalized === 'active' || normalized === 'trialing' || normalized === 'past_due'
}

const isLifetimeProfile = (profile: ProfileBilling | null): boolean => {
  if (!profile) return false
  return (
    String(profile.subscription_status ?? '').toLowerCase() === 'lifetime' ||
    String(profile.subscription_plan ?? '').toLowerCase() === 'lifetime'
  )
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
  subscriptionId?: string | null
}): Promise<string | null> => {
  const customData = readObject(input.customData)
  const metadataUserId = customData?.supabase_user_id
  if (isUuid(metadataUserId)) return metadataUserId

  if (input.subscriptionId) {
    const { data } = await adminClient
      .from('profiles')
      .select('user_id')
      .eq('paddle_subscription_id', input.subscriptionId)
      .maybeSingle()
    if (isUuid(data?.user_id)) return data.user_id
  }

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

const getProfileForUser = async (userId: string): Promise<ProfileBilling | null> => {
  const { data, error } = await adminClient
    .from('profiles')
    .select('user_id, subscription_status, subscription_plan, paddle_customer_id, paddle_subscription_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    throw new Error(error.message || 'Failed to load billing profile')
  }
  return (data as ProfileBilling | null) ?? null
}

const cancelPaddleSubscriptionImmediately = async (
  subscriptionId: string,
  reason:
    | 'duplicate_monthly_transaction'
    | 'duplicate_monthly_subscription_event'
    | 'upgrade_to_lifetime'
    | 'monthly_transaction_after_lifetime'
    | 'monthly_subscription_event_after_lifetime',
) => {
  try {
    await paddleApiRequest(`/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ effective_from: 'immediately' }),
    })
    console.log('Canceled Paddle subscription', { subscriptionId, reason })
  } catch (err) {
    console.error('Failed to cancel Paddle subscription', {
      subscriptionId,
      reason,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

const updateProfileBilling = async (userId: string, updates: Record<string, unknown>) => {
  const { error } = await adminClient
    .from('profiles')
    .update({
      ...updates,
      subscription_updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
  if (error) {
    throw new Error(error.message || 'Failed to update billing profile')
  }
}

const handleTransactionCompleted = async (data: unknown) => {
  const payload = readObject(data)
  if (!payload) return

  const customData = payload.custom_data
  const customerId = readString(payload, 'customer_id')
  const subscriptionId = readString(payload, 'subscription_id')
  const customer = readObject(payload.customer)
  const customerEmail = customer ? readString(customer, 'email') : null
  const userId = await resolveUserId({
    customData,
    customerId,
    email: customerEmail,
    subscriptionId,
  })
  if (!userId) return

  const customDataObj = readObject(customData)
  const plan = normalizePlan(customDataObj?.plan)
  const currentProfile = await getProfileForUser(userId)
  const resolvedCustomerId =
    customerId ??
    (typeof currentProfile?.paddle_customer_id === 'string' ? currentProfile.paddle_customer_id : null)
  const currentSubscriptionId =
    typeof currentProfile?.paddle_subscription_id === 'string' ? currentProfile.paddle_subscription_id : null
  const hasPaidRecurringMonthly =
    !!currentSubscriptionId &&
    isPaidRecurringStatus(currentProfile?.subscription_status) &&
    !isLifetimeProfile(currentProfile)

  if (plan === 'lifetime') {
    if (hasPaidRecurringMonthly) {
      await cancelPaddleSubscriptionImmediately(currentSubscriptionId, 'upgrade_to_lifetime')
    }
    await updateProfileBilling(userId, {
      subscription_status: 'lifetime',
      subscription_plan: 'lifetime',
      paddle_customer_id: resolvedCustomerId,
      paddle_subscription_id: null,
      subscription_current_period_end: null,
    })
    return
  }

  if (isLifetimeProfile(currentProfile)) {
    if (subscriptionId) {
      await cancelPaddleSubscriptionImmediately(subscriptionId, 'monthly_transaction_after_lifetime')
    }
    console.log('Ignoring monthly transaction for lifetime account', { userId, subscriptionId })
    return
  }

  if (subscriptionId && hasPaidRecurringMonthly && currentSubscriptionId !== subscriptionId) {
    await cancelPaddleSubscriptionImmediately(subscriptionId, 'duplicate_monthly_transaction')
    console.log('Ignored duplicate monthly transaction', {
      userId,
      canonicalSubscriptionId: currentSubscriptionId,
      incomingSubscriptionId: subscriptionId,
    })
    return
  }

  // Fallback for recurring transactions before subscription webhook arrives.
  await updateProfileBilling(userId, {
    subscription_status: 'active',
    subscription_plan: 'monthly',
    paddle_customer_id: resolvedCustomerId,
    paddle_subscription_id: subscriptionId,
  })
}

const handleSubscriptionEvent = async (data: unknown) => {
  const payload = readObject(data)
  if (!payload) return

  const customData = payload.custom_data
  const customerId = readString(payload, 'customer_id')
  const subscriptionId = readString(payload, 'id')
  const customer = readObject(payload.customer)
  const customerEmail = customer ? readString(customer, 'email') : null
  const userId = await resolveUserId({
    customData,
    customerId,
    email: customerEmail,
    subscriptionId,
  })
  if (!userId) return

  const customDataObj = readObject(customData)
  const plan = normalizePlan(customDataObj?.plan)
  const status = mapSubscriptionStatus(readString(payload, 'status'))
  const currentBillingPeriod = readObject(payload.current_billing_period)
  const periodEnd = currentBillingPeriod ? readString(currentBillingPeriod, 'ends_at') : null
  const currentProfile = await getProfileForUser(userId)
  const resolvedCustomerId =
    customerId ??
    (typeof currentProfile?.paddle_customer_id === 'string' ? currentProfile.paddle_customer_id : null)
  const currentSubscriptionId =
    typeof currentProfile?.paddle_subscription_id === 'string' ? currentProfile.paddle_subscription_id : null
  const hasPaidRecurringMonthly =
    !!currentSubscriptionId &&
    isPaidRecurringStatus(currentProfile?.subscription_status) &&
    !isLifetimeProfile(currentProfile)

  if (plan === 'monthly' && isLifetimeProfile(currentProfile)) {
    if (subscriptionId && status !== 'canceled') {
      await cancelPaddleSubscriptionImmediately(subscriptionId, 'monthly_subscription_event_after_lifetime')
    }
    console.log('Ignoring monthly subscription event for lifetime account', {
      userId,
      incomingSubscriptionId: subscriptionId,
      status,
    })
    return
  }

  if (plan === 'monthly' && subscriptionId && hasPaidRecurringMonthly && currentSubscriptionId !== subscriptionId) {
    if (status === 'active' || status === 'trialing' || status === 'past_due') {
      await cancelPaddleSubscriptionImmediately(subscriptionId, 'duplicate_monthly_subscription_event')
    }
    console.log('Ignoring non-canonical monthly subscription event', {
      userId,
      canonicalSubscriptionId: currentSubscriptionId,
      incomingSubscriptionId: subscriptionId,
      status,
    })
    return
  }

  await updateProfileBilling(userId, {
    subscription_status: status,
    subscription_plan: plan,
    paddle_customer_id: resolvedCustomerId,
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
  const verification = await verifyPaddleSignatureDetailed({
    signatureHeader: signature,
    rawBody,
    secretKey: paddleWebhookSecret,
    maxAgeSeconds: signatureMaxAgeSeconds,
  })
  if (!verification.ok) {
    console.warn('Paddle signature verification failed', {
      reason: verification.reason,
      ts: verification.ts,
      now: verification.now,
      skewSeconds: verification.skewSeconds,
      maxAgeSeconds: signatureMaxAgeSeconds,
    })
    return jsonResponse({ error: `Invalid Paddle signature (${verification.reason})` }, 400)
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
