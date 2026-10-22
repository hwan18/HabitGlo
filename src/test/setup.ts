import { afterEach, vi } from 'vitest'

// posthog.ts throws in dev mode when keys are missing; tests never send analytics.
vi.mock('@/lib/posthog', () => ({
  default: { capture: vi.fn() },
  isPostHogConfigured: false,
  identifyPostHogUser: vi.fn(),
  resetPostHogUser: vi.fn(),
}))

afterEach(() => {
  window.localStorage.clear()
})
