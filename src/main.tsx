import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts'
import './index.css'
import App from './App'
import { applyUiTheme } from './lib/uiThemes'
import { emitOverlaySync } from './lib/overlaySync'
import { isTauri } from './lib/platform'
import { useHabitsStore } from './stores/useHabitsStore'

const DEMO_RESET_QUERY_PARAM = 'demoReset'
const LOCAL_HABITS_KEY = 'habitglo_local_habits'
const PERSISTED_STORE_KEY = 'habitglo-store'

const shouldResetBrowserDemo = () => {
  if (typeof window === 'undefined') return false
  const path = window.location.pathname
  if (path !== '/' && path !== '/app' && path !== '/index.html') return false
  const params = new URLSearchParams(window.location.search)
  return params.get(DEMO_RESET_QUERY_PARAM) === '1'
}

const consumeDemoResetQueryParam = () => {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(DEMO_RESET_QUERY_PARAM)) return
  url.searchParams.delete(DEMO_RESET_QUERY_PARAM)
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, '', next)
}

const clearBrowserDemoHabits = () => {
  window.localStorage.removeItem(LOCAL_HABITS_KEY)

  const rawStore = window.localStorage.getItem(PERSISTED_STORE_KEY)
  if (!rawStore) {
    useHabitsStore.setState({ habits: [], completedToday: [] })
    return
  }

  try {
    const parsed = JSON.parse(rawStore) as { state?: Record<string, unknown> }
    if (parsed && parsed.state) {
      parsed.state = {
        ...parsed.state,
        habits: [],
        completedToday: [],
      }
      window.localStorage.setItem(PERSISTED_STORE_KEY, JSON.stringify(parsed))
    } else {
      window.localStorage.removeItem(PERSISTED_STORE_KEY)
    }
  } catch {
    window.localStorage.removeItem(PERSISTED_STORE_KEY)
  }

  useHabitsStore.setState({ habits: [], completedToday: [] })
}

if (shouldResetBrowserDemo()) {
  clearBrowserDemoHabits()
  consumeDemoResetQueryParam()
}

applyUiTheme(useHabitsStore.getState().theme.uiThemeId)

void useHabitsStore.getState().initializeAuth()

if (isTauri) {
  let lastOverlaySync = ''
  const syncOverlay = () => {
    const state = useHabitsStore.getState()
    const payload = {
      theme: state.theme,
      overlay: state.overlay,
      habits: state.habits,
    }
    const nextSerialized = JSON.stringify(payload)
    if (nextSerialized === lastOverlaySync) return
    lastOverlaySync = nextSerialized
    void emitOverlaySync(payload)
  }

  syncOverlay()
  useHabitsStore.subscribe(syncOverlay)
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
