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
        'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        variant === 'primary'
          ? 'border-transparent bg-app-accent text-app-accent-text hover:bg-[#ffc23d]'
          : 'border-app-border bg-app-raised text-app-text hover:border-app-muted/60',
        className,
      )}
      type="button"
      {...props}
    />
  )
}
