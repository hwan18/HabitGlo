import { hasSupabase, supabase } from './supabaseClient'
import { isTauri } from './platform'

export type BillingPlan = 'monthly' | 'lifetime'

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

export const createStripeCheckoutSession = async (plan: BillingPlan): Promise<string> => {
  assertSupabase()
  const { data, error } = await supabase!.functions.invoke('create-stripe-checkout', {
    body: { plan },
  })
  if (error) {
    throw new Error(error.message || 'Failed to create checkout session')
  }
  return getUrlFromResponse(data)
}

export const createStripePortalSession = async (): Promise<string> => {
  assertSupabase()
  const { data, error } = await supabase!.functions.invoke('create-stripe-portal', {
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
