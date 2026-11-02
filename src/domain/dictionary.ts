import { validateCharacterEntry } from './encoding'
import type { CharacterEntry, DataProvenance } from './types'
import type { AuxiliaryTarget } from './auxiliary'

export interface ReadingRecord {
  readings: readonly string[]
  readingSources?: Readonly<Record<string, readonly string[]>>
  frequency?: number
}

export interface CharacterLookup {
  char: string
  readings: readonly string[]
  entries: readonly CharacterEntry[]
  status: 'trainable' | 'pronunciation-only' | 'missing'
  sources: readonly DataProvenance[]
  /** Prepared local fallback; absent until its source data is ready. */
  auxiliary?: readonly AuxiliaryTarget[]
}

/** Tone removal matches two source readings; it never infers a pronunciation. */
export function plainPinyin(value: string): string {
  return value.toLowerCase().replace(/u:/g, 'v').normalize('NFD').replace(/u\u0308/g, 'v').replace(/[\u0300-\u036f1-5]/g, '').replace(/ü/g, 'v')
}

export function createCharacterIndex(entries: readonly CharacterEntry[], readings: Readonly<Record<string, ReadingRecord>>, readingSource: DataProvenance) {
  const byCharacter = new Map<string, CharacterEntry[]>()
  for (const entry of entries) {
    const issues = validateCharacterEntry(entry)
    if (issues.length) throw new Error(`Invalid dictionary entry ${entry.char}: ${issues.join('; ')}`)
    const group = byCharacter.get(entry.char) ?? []
    if (!group.some(item => item.fullCode === entry.fullCode && item.pronunciation.pinyin === entry.pronunciation.pinyin)) group.push(entry)
    byCharacter.set(entry.char, group)
  }

  function lookup(char: string): CharacterLookup {
    if (Array.from(char).length !== 1) return { char, readings: [], entries: [], status: 'missing', sources: [] }
    const choices = byCharacter.get(char) ?? []
    const record = readings[char]
    const sources = [...new Set(choices.flatMap(entry => entry.sources ?? [entry.provenance]))]
    if (record) sources.push(readingSource)
    return {
      char,
      readings: record?.readings ?? choices.map(entry => entry.pronunciation.pinyin),
      entries: choices,
      status: choices.length ? 'trainable' : record ? 'pronunciation-only' : 'missing',
      sources,
    }
  }

  function search(query: string, limit = 36): readonly CharacterLookup[] {
    const value = query.trim()
    if (!value) return []
    const normalized = plainPinyin(value)
    if (!/^[a-z]+$/.test(normalized)) return [...new Set(Array.from(value))].slice(0, limit).map(lookup)
    return [...byCharacter.keys()].filter(char => byCharacter.get(char)!.some(entry => entry.fullCode.toLowerCase().startsWith(normalized) || plainPinyin(entry.pronunciation.pinyin) === normalized)).slice(0, limit).map(lookup)
  }

  return { lookup, search, characterCount: byCharacter.size }
}

export function orderPracticeEntries(entries: readonly CharacterEntry[], readings: Readonly<Record<string, ReadingRecord>>): readonly CharacterEntry[] {
  return [...entries].sort((a, b) => (readings[b.char]?.frequency ?? 0) - (readings[a.char]?.frequency ?? 0) || a.char.codePointAt(0)! - b.char.codePointAt(0)!)
}
