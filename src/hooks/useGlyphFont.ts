import { useEffect, useMemo, useState } from 'react'
import { ensureGlyphFont, glyphFontRequirements, glyphFontsReady, subscribeGlyphFonts } from '../lib/glyph-font'

export interface GlyphFontState {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'unavailable'
  characters: readonly string[]
  unavailable: readonly string[]
  retry(): void
}

export function useGlyphFont(text: string): GlyphFontState {
  const required = useMemo(() => glyphFontRequirements(text), [text])
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{ text: string; status: GlyphFontState['status']; unavailable: readonly string[] }>({ text: '', status: 'idle', unavailable: [] })
  useEffect(() => {
    if (!required.characters.length) return
    let alive = true
    setResult({ text, status: 'loading', unavailable: required.unavailable })
    const unsubscribe = subscribeGlyphFonts(() => {
      if (!alive || !glyphFontsReady(text)) return
      const status = required.unavailable.length ? 'unavailable' as const : 'ready' as const
      setResult(previous => previous.text === text && previous.status === status ? previous : { text, status, unavailable: required.unavailable })
    })
    void ensureGlyphFont(text).then(value => {
      if (alive) setResult({ text, status: value.unavailable.length ? 'unavailable' : 'ready', unavailable: value.unavailable })
    }).catch(() => { if (alive) setResult({ text, status: 'error', unavailable: required.unavailable }) })
    return () => { alive = false; unsubscribe() }
  }, [text, required, retry])
  return {
    status: !required.characters.length ? 'idle' : result.text === text ? result.status : 'loading',
    characters: required.characters,
    unavailable: result.text === text ? result.unavailable : required.unavailable,
    retry: () => setRetry(value => value + 1),
  }
}
