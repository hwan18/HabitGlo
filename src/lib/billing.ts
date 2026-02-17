import { hasSupabase, supabase } from './supabaseClient'
import { isTauri } from './platform'
import { startPaddleCheckout } from './paddle'

export type BillingPlan = 'monthly' | 'lifetime'
export const billingProviderLabel = 'Paddle'

const assertSupabase = () => {
  if (!hasSupabase || !supabase) {
    throw new Error('Supabase is not configured')
  }
}

const getUrlFromResponse = (data: unknown): string => {
  const url = (data as { url?: unknown } | null | undefined)?.url
  if (typeof url !== 'string' || !url) {
    throw new Error('Billing URL was not returned')
  }
  return url
}

const createPaddlePortalSession = async (): Promise<string> => {
  assertSupabase()
  const { data, error } = await supabase!.functions.invoke('create-paddle-portal', {
    body: {},
  })
  if (error) {
    throw new Error(error.message || 'Failed to create billing portal session')
  }
  return getUrlFromResponse(data)
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

export const startCheckout = async (plan: BillingPlan, options: { email?: string | null; userId?: string | null }) => {
  await startPaddleCheckout({ plan, email: options.email, userId: options.userId })
}

export const openBillingPortal = async () => {
  const url = await createPaddlePortalSession()
  await openExternalUrl(url)
}
