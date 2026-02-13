import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../fonts'
import '../index.css'
import OverlayApp from './OverlayApp'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { WebviewWindow } from '@tauri-apps/api/window'

useHabitsStore.getState().hydrate()

createRoot(document.getElementById('overlay-root') as HTMLElement).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>,
)

requestAnimationFrame(() => {
  const overlayWindow = WebviewWindow.getByLabel('overlay')
  overlayWindow?.show().catch(() => {})
})
