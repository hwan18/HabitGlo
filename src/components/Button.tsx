import clsx from 'clsx'
import { type ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost'
  size?: 'sm' | 'md'
}

export function Button({ className, variant = 'primary', size = 'md', ...props }: Props) {
  return (
    <button
      className={clsx(
        'rounded-lg border transition-all duration-150',
        size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-2 text-sm',
        variant === 'primary'
          ? 'border-glow-pink/40 bg-gradient-to-r from-glow-pink/70 to-glow-blue/60 text-white shadow-[0_0_24px_rgba(255,90,217,0.3)]'
          : 'border-white/10 bg-white/5 text-white hover:border-white/30',
        className,
      )}
      type="button"
      {...props}
    />
  )
}
