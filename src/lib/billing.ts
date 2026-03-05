import { hasSupabase, supabase } from './supabaseClient'
import { isTauri } from './platform'
import { startPaddleCheckout } from './paddle'

export type BillingPlan = 'monthly' | 'lifetime'
export const billingProviderLabel = 'Paddle'
type CheckoutGateDecision =
  | { action: 'checkout' }
  | { action: 'portal'; url: string; reason: 'already_subscribed' }
  | { action: 'blocked'; reason: 'already_lifetime' }

export type CheckoutStartResult =
  | { action: 'checkout_opened' }
  | { action: 'portal_opened' }
  | { action: 'blocked'; reason: 'already_lifetime' }

const assertSupabase = () => {
  if (!hasSupabase || !supabase) {
    throw new Error('Supabase is not configured')
  }
}

const getSupabaseEnvValue = (value: unknown, name: string): string => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) {
    throw new Error(`Missing ${name}`)
  }
  return normalized
}

const getFunctionEndpoint = (functionName: string): { endpoint: string; anonKey: string } => {
  const supabaseUrl = getSupabaseEnvValue(import.meta.env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL')
  const anonKey = getSupabaseEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY, 'VITE_SUPABASE_ANON_KEY')
  const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/${functionName}`
  return { endpoint, anonKey }
}

const getWebsiteBaseUrl = (): string => {
  const raw = typeof import.meta.env.VITE_WEBSITE_BASE_URL === 'string'
    ? import.meta.env.VITE_WEBSITE_BASE_URL.trim()
    : ''
  const base = raw.length > 0 ? raw : 'https://habitglo.com'
  return base.replace(/\/+$/, '')
}

const getValidAccessToken = async (): Promise<string> => {
  assertSupabase()

  // Always refresh once for privileged billing actions to avoid stale JWT edge cases.
  const { data: refreshedData, error: refreshError } = await supabase!.auth.refreshSession()
  if (refreshError) {
    throw new Error(refreshError.message || 'Please sign in again.')
  }

  const refreshedToken = refreshedData.session?.access_token
  if (typeof refreshedToken === 'string' && refreshedToken.length > 0) {
    const { data: userData, error: userError } = await supabase!.auth.getUser(refreshedToken)
    if (userError || !userData.user) {
      throw new Error('Please sign in again.')
    }
    return refreshedToken
  }

  const { data: sessionData, error: sessionError } = await supabase!.auth.getSession()
  if (sessionError) {
    throw new Error(sessionError.message || 'Failed to read auth session')
  }

  const sessionToken = sessionData.session?.access_token
  if (!sessionToken) {
    throw new Error('Please sign in again.')
  }

  const { data: userData, error: userError } = await supabase!.auth.getUser(sessionToken)
  if (userError || !userData.user) {
    throw new Error('Please sign in again.')
  }

  return sessionToken
}

const getUrlFromResponse = (data: unknown): string => {
  const url = (data as { url?: unknown } | null | undefined)?.url
  if (typeof url !== 'string' || !url) {
    throw new Error('Billing URL was not returned')
  }
  return url
}

const callAuthedFunction = async (functionName: string, body: Record<string, unknown>): Promise<unknown> => {
  const { endpoint, anonKey } = getFunctionEndpoint(functionName)
  const accessToken = await getValidAccessToken()

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })

  const rawText = await response.text()
  let parsed: unknown = null
  if (rawText.trim().length > 0) {
    try {
      parsed = JSON.parse(rawText)
    } catch {
      parsed = rawText
    }
  }

  if (!response.ok) {
    const errorFromJson =
      (parsed as { error?: unknown; message?: unknown } | null)?.error ??
      (parsed as { error?: unknown; message?: unknown } | null)?.message
    const message =
      typeof errorFromJson === 'string' && errorFromJson.length > 0
        ? errorFromJson
        : typeof parsed === 'string' && parsed.length > 0
          ? parsed
          : `Edge function request failed (${response.status})`
    throw new Error(message)
  }

  return parsed
}

const createPaddlePortalSession = async (): Promise<string> => {
  const parsed = await callAuthedFunction('create-paddle-portal', {})
  return getUrlFromResponse(parsed)
}

const getCheckoutGateDecision = async (plan: BillingPlan): Promise<CheckoutGateDecision> => {
  const response = (await callAuthedFunction('create-paddle-checkout-gate', {
    plan,
  })) as
    | { action?: unknown; url?: unknown; reason?: unknown }
    | null
    | undefined

  const action = response?.action
  if (action === 'checkout') {
    return { action: 'checkout' }
  }
  if (
    action === 'portal' &&
    typeof response?.url === 'string' &&
    response.url.length > 0 &&
    response.reason === 'already_subscribed'
  ) {
    return { action: 'portal', url: response.url, reason: 'already_subscribed' }
  }
  if (action === 'blocked' && response?.reason === 'already_lifetime') {
    return { action: 'blocked', reason: 'already_lifetime' }
  }

  throw new Error('Invalid checkout gate response')
}

export const openExternalUrl = async (url: string) => {
  if (isTauri) {
    try {
      const { open } = await import('@tauri-apps/api/shell')
      await open(url)
      return
    } catch (err) {
      console.warn('Failed to open external URL in Tauri shell:', err)
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export const startCheckout = async (
  plan: BillingPlan,
  options: { email?: string | null; userId?: string | null },
): Promise<CheckoutStartResult> => {
  const decision = await getCheckoutGateDecision(plan)
  if (decision.action === 'portal') {
    await openExternalUrl(decision.url)
    return { action: 'portal_opened' }
  }
  if (decision.action === 'blocked') {
    return { action: 'blocked', reason: decision.reason }
  }

  await startPaddleCheckout({ plan, email: options.email, userId: options.userId })
  return { action: 'checkout_opened' }
}

export const openBillingPortal = async () => {
  const url = await createPaddlePortalSession()
  await openExternalUrl(url)
}

export const openWebsitePricing = async (plan?: BillingPlan) => {
  const base = getWebsiteBaseUrl()
  const params = new URLSearchParams({ source: 'desktop_app' })
  if (plan) {
    params.set('focus', plan)
  }
  await openExternalUrl(`${base}/pricing?${params.toString()}`)
}
