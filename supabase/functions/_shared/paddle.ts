const encoder = new TextEncoder()

const fromHex = (input: string): Uint8Array | null => {
  if (!/^[0-9a-f]+$/i.test(input) || input.length % 2 !== 0) return null
  const bytes = new Uint8Array(input.length / 2)
  for (let i = 0; i < input.length; i += 2) {
    bytes[i / 2] = Number.parseInt(input.slice(i, i + 2), 16)
  }
  return bytes
}

const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a[i] ^ b[i]
  }
  return mismatch === 0
}

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export const verifyPaddleSignature = async (input: {
  signatureHeader: string
  rawBody: string
  secretKey: string
  maxAgeSeconds?: number
}): Promise<boolean> => {
  const result = await verifyPaddleSignatureDetailed(input)
  return result.ok
}

type VerifyPaddleSignatureResult = {
  ok: boolean
  reason:
    | 'missing_ts'
    | 'missing_h1'
    | 'invalid_ts'
    | 'expired_ts'
    | 'invalid_secret'
    | 'invalid_h1_format'
    | 'mismatch'
    | 'internal_error'
    | 'ok'
  now: number
  ts: number | null
  skewSeconds: number | null
}

const normalizeSecretKey = (input: string): string => {
  const trimmed = input.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

export const verifyPaddleSignatureDetailed = async (input: {
  signatureHeader: string
  rawBody: string
  secretKey: string
  maxAgeSeconds?: number
}): Promise<VerifyPaddleSignatureResult> => {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const parts = input.signatureHeader.trim().split(';').map((part) => part.trim())
  const tsPart = parts.find((part) => part.startsWith('ts='))
  const hmacParts = parts.filter((part) => part.startsWith('h1='))

  if (!tsPart) {
    return { ok: false, reason: 'missing_ts', now: nowSeconds, ts: null, skewSeconds: null }
  }
  if (hmacParts.length === 0) {
    return { ok: false, reason: 'missing_h1', now: nowSeconds, ts: null, skewSeconds: null }
  }

  const tsValue = Number.parseInt(tsPart.slice(3), 10)
  if (!Number.isFinite(tsValue)) {
    return { ok: false, reason: 'invalid_ts', now: nowSeconds, ts: null, skewSeconds: null }
  }

  const maxAge = input.maxAgeSeconds ?? 300
  const skewSeconds = nowSeconds - tsValue
  if (Math.abs(skewSeconds) > maxAge) {
    return { ok: false, reason: 'expired_ts', now: nowSeconds, ts: tsValue, skewSeconds }
  }

  const payload = `${tsValue}:${input.rawBody}`
  const normalizedSecret = normalizeSecretKey(input.secretKey)
  if (!normalizedSecret) {
    return { ok: false, reason: 'invalid_secret', now: nowSeconds, ts: tsValue, skewSeconds }
  }

  let expected: Uint8Array
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(normalizedSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
    expected = new Uint8Array(signed)
  } catch {
    return { ok: false, reason: 'internal_error', now: nowSeconds, ts: tsValue, skewSeconds }
  }

  let sawValidHmac = false
  for (const part of hmacParts) {
    const provided = fromHex(part.slice(3).trim())
    if (!provided) continue
    sawValidHmac = true
    if (timingSafeEqual(expected, provided)) {
      return { ok: true, reason: 'ok', now: nowSeconds, ts: tsValue, skewSeconds }
    }
  }
  if (!sawValidHmac) {
    return { ok: false, reason: 'invalid_h1_format', now: nowSeconds, ts: tsValue, skewSeconds }
  }

  return { ok: false, reason: 'mismatch', now: nowSeconds, ts: tsValue, skewSeconds }
}

export const paddleApiRequest = async <T>(
  path: string,
  init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> },
): Promise<T> => {
  const apiKey = Deno.env.get('PADDLE_API_KEY')
  if (!apiKey) throw new Error('Missing PADDLE_API_KEY')

  const baseUrl = Deno.env.get('PADDLE_API_BASE_URL')?.trim() || 'https://api.paddle.com'
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  const text = await response.text()
  const parsed = text ? tryParseJson(text) : null

  if (!response.ok) {
    const detail =
      readString(parsed, ['error', 'detail']) ??
      readString(parsed, ['error', 'type']) ??
      response.statusText
    throw new Error(`Paddle API error (${response.status}): ${detail}`)
  }

  return parsed as T
}

const tryParseJson = (input: string): unknown => {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

const readString = (input: unknown, path: string[]): string | null => {
  let cursor: unknown = input
  for (const key of path) {
    if (typeof cursor !== 'object' || cursor === null || !(key in cursor)) return null
    cursor = (cursor as Record<string, unknown>)[key]
  }
  return typeof cursor === 'string' && cursor.length > 0 ? cursor : null
}
