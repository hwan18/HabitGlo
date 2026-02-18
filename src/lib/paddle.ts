type PaddleEnvironment = 'sandbox' | 'production'
type BillingPlan = 'monthly' | 'lifetime'

type PaddleCheckoutOptions = {
  plan: BillingPlan
  email?: string | null
  userId?: string | null
}

type PaddleCheckoutOpenInput = {
  items: Array<{ priceId: string; quantity: number }>
  customer?: { email?: string | null }
  customData?: Record<string, unknown>
  settings?: {
    displayMode?: 'overlay'
    theme?: 'dark' | 'light'
    successUrl?: string
  }
}

type PaddleGlobal = {
  Environment?: {
    set: (environment: PaddleEnvironment) => void
  }
  Initialize: (input: { token: string }) => void
  Checkout: {
    open: (input: PaddleCheckoutOpenInput) => void
  }
}

declare global {
  interface Window {
    Paddle?: PaddleGlobal
  }
}

const scriptUrl = 'https://cdn.paddle.com/paddle/v2/paddle.js'
let paddleScriptPromise: Promise<void> | null = null
let initializedConfig: { token: string; environment: PaddleEnvironment } | null = null

const getEnvironment = (): PaddleEnvironment =>
  String(import.meta.env.VITE_PADDLE_ENVIRONMENT ?? 'production').toLowerCase() === 'sandbox'
    ? 'sandbox'
    : 'production'

const getClientToken = (): string =>
  typeof import.meta.env.VITE_PADDLE_CLIENT_TOKEN === 'string'
    ? import.meta.env.VITE_PADDLE_CLIENT_TOKEN.trim()
    : ''

const getPriceId = (plan: BillingPlan): string => {
  const value =
    plan === 'monthly'
      ? import.meta.env.VITE_PADDLE_PRICE_MONTHLY
      : import.meta.env.VITE_PADDLE_PRICE_LIFETIME
  return typeof value === 'string' ? value.trim() : ''
}

const loadPaddleScript = async (): Promise<void> => {
  if (window.Paddle) return
  if (paddleScriptPromise) return paddleScriptPromise

  paddleScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`)
    if (existing) {
      if (window.Paddle) {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load Paddle.js')), {
        once: true,
      })
      return
    }

    const script = document.createElement('script')
    script.src = scriptUrl
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Paddle.js'))
    document.head.appendChild(script)
  })

  await paddleScriptPromise
}

const ensureInitialized = async (): Promise<PaddleGlobal> => {
  const clientToken = getClientToken()
  if (!clientToken) {
    throw new Error('Missing VITE_PADDLE_CLIENT_TOKEN')
  }

  await loadPaddleScript()
  if (!window.Paddle) {
    throw new Error('Paddle.js was not initialized')
  }

  const environment = getEnvironment()
  const shouldInit =
    !initializedConfig ||
    initializedConfig.token !== clientToken ||
    initializedConfig.environment !== environment

  if (shouldInit) {
    if (environment === 'sandbox') {
      window.Paddle.Environment?.set('sandbox')
    }
    window.Paddle.Initialize({ token: clientToken })
    initializedConfig = { token: clientToken, environment }
  }

  return window.Paddle
}

export const startPaddleCheckout = async ({ plan, email, userId }: PaddleCheckoutOptions) => {
  const priceId = getPriceId(plan)
  if (!priceId) {
    throw new Error(
      plan === 'monthly'
        ? 'Missing VITE_PADDLE_PRICE_MONTHLY'
        : 'Missing VITE_PADDLE_PRICE_LIFETIME',
    )
  }

  const paddle = await ensureInitialized()
  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customer: email ? { email } : undefined,
    customData: {
      plan,
      supabase_user_id: userId ?? null,
    },
    settings: {
      displayMode: 'overlay',
      theme: 'dark',
      ...(window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1' && {
          successUrl: `${window.location.origin}/download/windows.html?plan=${plan}`,
        }),
    },
  })
}