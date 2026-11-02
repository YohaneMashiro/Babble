import type { CharacterPronunciation } from './types'
import { plainPinyin } from './dictionary'

export interface SoundMapping {
  initials: Readonly<Record<string, string>>
  finals: Readonly<Record<string, string>>
  zeroInitials: Readonly<Record<string, string>>
}

/** Applies an audited sound scheme to a supplied reading. Shapes are never generated. */
export function explainSound(pinyin: string, scheme: SoundMapping): { pronunciation: CharacterPronunciation; code: string; note?: string } | null {
  const plain = plainPinyin(pinyin)
  if (!/^[a-z]+$/.test(plain)) return null
  const zeroCode = scheme.zeroInitials[plain]
  if (zeroCode) {
    const code = zeroCode.toUpperCase()
    return {
      pronunciation: {
        pinyin,
        initial: { value: plain[0], key: code[0], label: '零声母起始', explanation: `零声母音节 ${plain}，起始字母 ${plain[0]} → ${code[0]}` },
        final: { value: plain, key: code[1], label: '零声母收尾', explanation: `零声母 ${plain} 使用完整双拼 ${code}，第二键 → ${code[1]}` },
      },
      code,
      note: `「${pinyin}」是零声母音节，按小鹤零声母表输入 ${code}；这两键不表示两个声母。`,
    }
  }
  const initial = Object.keys(scheme.initials).sort((a, b) => b.length - a.length).find(value => plain.startsWith(value))
  if (!initial) return null
  const spelledFinal = plain.slice(initial.length)
  // In standard pinyin j/q/x/y + üe is written ue; this alias has the same scheme key.
  const final = spelledFinal === 'ue' ? 've' : spelledFinal
  const initialKey = scheme.initials[initial]
  const finalKey = scheme.finals[final]
  if (!finalKey) return null
  const note = final === 've' ? 'ü 在键位数据中记为 v；üe 在 j/q/x/y 后的拼音中省略两点，仍用 T 键。' : /^[jqxy]$/.test(initial) && ['u', 'uan', 'un'].includes(final) ? 'j/q/x/y 后的 u 按拼音拼写编码；这里省略了 ü 的两点。' : undefined
  return {
    pronunciation: { pinyin, initial: { value: initial, key: initialKey.toUpperCase() }, final: { value: final.replace(/v/g, 'ü'), key: finalKey.toUpperCase() } },
    code: (initialKey + finalKey).toUpperCase(),
    note,
  }
}
