import type { ReactNode } from 'react'
import { needsGlyphFont, unicodeLabels } from '../lib/glyph-font'
import type { GlyphFontState } from '../hooks/useGlyphFont'
import '../styles/glyph-font.css'

/** Pure inline glyph span, safe inside buttons; loading controls live separately. */
export function GlyphText({ text, children }: { text: string; children?: ReactNode }) {
  if (!Array.from(text).some(needsGlyphFont)) return <>{children ?? text}</>
  return <span className="glyph-font-text">{children ?? text}</span>
}

export function GlyphStatus({ state, label = '当前字' }: { state: GlyphFontState; label?: string }) {
  if (state.status === 'idle') return null
  return <div className="glyph-font-status" data-status={state.status} role="status" aria-live="polite">
    {state.status === 'loading' ? <p>{label}的补充字形正在加载（{unicodeLabels(state.characters)}）…</p>
      : state.status === 'error' ? <><p>{label}的补充字形未能加载（{unicodeLabels(state.characters)}）。编码和当前输入保留。</p><button className="subtle-button" onClick={state.retry}>重试加载字形</button></>
      : state.status === 'unavailable' ? <p>此版本尚无部分字形（{unicodeLabels(state.unavailable)}）；字符按原码点保留，不以缺字框判断编码是否可用。</p>
      : null}
  </div>
}
