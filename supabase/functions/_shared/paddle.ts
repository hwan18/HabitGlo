const encoder = new TextEncoder()

const toHex = (input: Uint8Array): string =>
  Array.from(input)
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')

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
  const parts = input.signatureHeader.split(';').map((part) => part.trim())
  const tsPart = parts.find((part) => part.startsWith('ts='))
  const hmacParts = parts.filter((part) => part.startsWith('h1='))

  if (!tsPart || hmacParts.length === 0) return false

  const tsValue = Number.parseInt(tsPart.slice(3), 10)
  if (!Number.isFinite(tsValue)) return false

  const maxAge = input.maxAgeSeconds ?? 300
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSeconds - tsValue) > maxAge) return false

  const payload = `${tsValue}:${input.rawBody}`
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(input.secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const expected = fromHex(toHex(new Uint8Array(signed)))
  if (!expected) return false

  for (const part of hmacParts) {
    const provided = fromHex(part.slice(3).trim())
    if (!provided) continue
    if (timingSafeEqual(expected, provided)) return true
  }
  return false
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
