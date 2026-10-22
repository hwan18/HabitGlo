import type { KeyboardEvent } from 'react'

/** Enter while an IME (Korean, Japanese, Chinese) is still composing must not submit half a word. */
export const isComposingEnter = (event: KeyboardEvent<HTMLElement>) =>
  event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)
