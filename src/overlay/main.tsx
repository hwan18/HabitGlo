import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import OverlayApp from './OverlayApp'
import { useHabitsStore } from '@/stores/useHabitsStore'

useHabitsStore.getState().hydrate()

createRoot(document.getElementById('overlay-root') as HTMLElement).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>,
)
