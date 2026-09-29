import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'

export type OnboardingStep = {
  selector: string
  title: string
  description: string
}

type Props = {
  open: boolean
  steps: OnboardingStep[]
  onClose: (completed: boolean) => void
}

type HighlightRect = {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

const padding = 10

export function OnboardingTour({ open, steps, onClose }: Props) {
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<HighlightRect | null>(null)
  const step = steps[stepIndex]

  useLayoutEffect(() => {
    if (!open || !step) return

    const target = document.querySelector<HTMLElement>(step.selector)
    if (!target) {
      return
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' })

    const updateRect = () => {
      const next = target.getBoundingClientRect()
      setRect({
        top: Math.max(8, next.top - padding),
        left: Math.max(8, next.left - padding),
        right: Math.min(window.innerWidth - 8, next.right + padding),
        bottom: Math.min(window.innerHeight - 8, next.bottom + padding),
        width: Math.min(window.innerWidth - 16, next.width + padding * 2),
        height: Math.min(window.innerHeight - 16, next.height + padding * 2),
      })
    }

    const timer = window.setTimeout(updateRect, 350)
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [open, step])

  if (!open || !step) return null

  const finish = () => onClose(true)
  const close = () => onClose(false)
  const isLast = stepIndex === steps.length - 1

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="HabitGlo quick tour">
      {rect ? (
        <>
          <div className="fixed left-0 right-0 top-0 bg-black/75 backdrop-blur-[1px]" style={{ height: rect.top }} />
          <div className="fixed bottom-0 left-0 right-0 bg-black/75 backdrop-blur-[1px]" style={{ top: rect.bottom }} />
          <div className="fixed left-0 bg-black/75 backdrop-blur-[1px]" style={{ top: rect.top, width: rect.left, height: rect.height }} />
          <div className="fixed right-0 bg-black/75 backdrop-blur-[1px]" style={{ top: rect.top, left: rect.right, height: rect.height }} />
          <div
            className="pointer-events-none fixed rounded-2xl border-2 border-glow-blue shadow-[0_0_0_4px_rgba(54,210,255,0.16),0_0_36px_rgba(54,210,255,0.45)]"
            style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-[1px]" />
      )}

      <section className="fixed bottom-5 left-1/2 w-[min(92vw,430px)] -translate-x-1/2 rounded-2xl border border-white/15 bg-[#090b13] p-5 text-white shadow-2xl shadow-black/70">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-glow-blue">Step {stepIndex + 1} of {steps.length}</p>
            <h2 className="mt-2 text-lg font-semibold">{step.title}</h2>
          </div>
          <button type="button" onClick={close} className="rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white" aria-label="Close tour">
            <X size={18} />
          </button>
        </div>
        <p className="mt-2 text-sm leading-6 text-white/65">{step.description}</p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button type="button" onClick={close} className="text-xs text-white/45 hover:text-white/75">Skip tour</button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button type="button" onClick={() => setStepIndex((index) => index - 1)} className="flex items-center gap-1 rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/10">
                <ArrowLeft size={14} /> Back
              </button>
            )}
            <button
              type="button"
              onClick={() => isLast ? finish() : setStepIndex((index) => index + 1)}
              className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-glow-pink/90 to-glow-blue/75 px-4 py-2 text-xs font-semibold shadow-glow"
            >
              {isLast ? <><Check size={14} /> Finish</> : <>Next <ArrowRight size={14} /></>}
            </button>
          </div>
        </div>
        <div className="mt-4 flex gap-1.5" aria-hidden>
          {steps.map((_, index) => <span key={index} className={`h-1 flex-1 rounded-full ${index <= stepIndex ? 'bg-glow-blue' : 'bg-white/10'}`} />)}
        </div>
      </section>
    </div>,
    document.body,
  )
}
