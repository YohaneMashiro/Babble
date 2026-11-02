import { useEffect, useState } from 'react'
import { shouldHandleTrainingKey } from '../domain/keyboard'

export function useTrainingKeyboard(onKey: (key: string) => void, blocked: boolean) {
  const [pressedKey, setPressedKey] = useState<string | null>(null)

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target
      const editable = target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest('input, textarea, select')))
      // Native button activation must not also trigger the global Space/Enter shortcuts.
      const nativeActivation = target instanceof HTMLElement && Boolean(target.closest('button, a, summary')) && [' ', 'Enter'].includes(event.key)
      if (nativeActivation || !shouldHandleTrainingKey(event, editable, blocked)) return
      event.preventDefault()
      setPressedKey(event.key.toUpperCase())
      onKey(/^[a-z]$/i.test(event.key) ? event.key.toLowerCase() : event.key)
    }
    const up = () => setPressedKey(null)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', up)
    }
  }, [onKey, blocked])

  return pressedKey
}
