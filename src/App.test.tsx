import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { useHabitsStore } from './stores/useHabitsStore'

vi.mock('@/lib/supabaseClient', () => ({ hasSupabase: false, supabase: null }))

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

beforeEach(() => {
  useHabitsStore.setState({ habits: [], habitsOwner: null })
  useHabitsStore.getState().setOverlay({ speed: 'medium', color: 'classic', paused: false })
})

afterEach(cleanup)

const addReminder = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  await user.type(screen.getByRole('textbox', { name: 'Add a reminder' }), `${text}{Enter}`)
}

describe('main screen', () => {
  it('shows the empty state when there are no reminders', () => {
    render(<App />)
    expect(screen.getByText('Add something you want to see all day.')).toBeTruthy()
  })

  it('adds a reminder with Enter, clears the input and ignores blank input', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addReminder(user, '  Drink water  ')
    const input = screen.getByRole('textbox', { name: 'Add a reminder' }) as HTMLInputElement
    expect(input.value).toBe('')
    expect(useHabitsStore.getState().habits.map((h) => h.text)).toEqual(['Drink water'])
    expect(screen.getByRole('list', { name: 'Your reminders' })).toBeTruthy()

    await user.type(input, '   {Enter}')
    expect(useHabitsStore.getState().habits).toHaveLength(1)
  })

  it('handles non-Latin and very long text', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addReminder(user, '물 마시기 🚰 水を飲む')
    const input = screen.getByRole('textbox', { name: 'Add a reminder' }) as HTMLInputElement
    // maxLength stops typing at 220; paste-like input must be capped too.
    await user.click(input)
    await user.paste('x'.repeat(400))
    await user.keyboard('{Enter}')
    const texts = useHabitsStore.getState().habits.map((h) => h.text)
    expect(texts[0]).toBe('물 마시기 🚰 水を飲む')
    expect(texts[1].length).toBeLessThanOrEqual(220)
  })

  it('toggles a reminder off and deletes it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addReminder(user, 'Stand up')
    const toggle = screen.getByRole('switch', { name: 'Show "Stand up" on the LED' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    await user.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(useHabitsStore.getState().habits[0].is_active).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Delete "Stand up"' }))
    expect(useHabitsStore.getState().habits).toEqual([])
    expect(screen.getByText('Add something you want to see all day.')).toBeTruthy()
  })

  it('edits a reminder in place; Escape cancels', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addReminder(user, 'Breathe')
    await user.click(screen.getByRole('button', { name: 'Breathe' }))
    const editor = screen.getByRole('textbox', { name: 'Edit reminder' })
    await user.clear(editor)
    await user.type(editor, 'Breathe slowly{Enter}')
    expect(useHabitsStore.getState().habits[0].text).toBe('Breathe slowly')

    await user.click(screen.getByRole('button', { name: 'Breathe slowly' }))
    await user.type(screen.getByRole('textbox', { name: 'Edit reminder' }), ' nope{Escape}')
    expect(useHabitsStore.getState().habits[0].text).toBe('Breathe slowly')
  })

  it('Start/Pause toggles the LED', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(useHabitsStore.getState().overlay.paused).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(useHabitsStore.getState().overlay.paused).toBe(false)
  })

  it('settings change speed and color; desktop-only controls are disabled in the browser', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    await user.click(within(dialog).getByRole('radio', { name: 'Fast' }))
    await user.click(within(dialog).getByRole('radio', { name: 'Neon' }))
    expect(useHabitsStore.getState().overlay.speed).toBe('fast')
    expect(useHabitsStore.getState().overlay.color).toBe('neon')
    expect((within(dialog).getByRole('radio', { name: 'Bottom' }) as HTMLInputElement).disabled).toBe(true)
    expect(within(dialog).getByText('Position works in the desktop app.')).toBeTruthy()

    await user.click(within(dialog).getByRole('button', { name: 'Close settings' }))
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull()
  })
})
