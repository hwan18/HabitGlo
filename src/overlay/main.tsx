import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../fonts'
import '../index.css'
import OverlayApp from './OverlayApp'
import { dockOverlay, setOverlayVisible } from '@/lib/overlayWindow'
import { useHabitsStore } from '@/stores/useHabitsStore'
import '../lib/posthog'

// The overlay renders whatever the main window last saved; it never loads or writes data itself.

createRoot(document.getElementById('overlay-root') as HTMLElement).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>,
)

requestAnimationFrame(() => {
  const { position, reserveSpace } = useHabitsStore.getState().overlay
  void dockOverlay(position, reserveSpace).then(() => setOverlayVisible(true))
})
