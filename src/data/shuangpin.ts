import { plainPinyin, type CharacterLookup } from '../domain/dictionary'
import { explainSound } from '../domain/sound'
import type { CharacterEntry, DataProvenance } from '../domain/types'
import { LIBRARY_SOURCES, PRACTICE_ENTRIES, READING_RECORDS } from './library'
import soundMapping from './generated/sound-mapping.json'

function requiredSource(id: string): DataProvenance {
  const source = LIBRARY_SOURCES.find(item => item.id === id)
  if (!source) throw new Error(`Missing sound-learning source: ${id}`)
  return source
}

const readingSource = requiredSource('unicode-unihan-17.0.0')
const soundSource = requiredSource('shuangpin-practice-xiaohe-4927919')
const sources = [readingSource, soundSource]
const sounds = new Map<string, ReturnType<typeof explainSound>>()
const cache = new Map<string, CharacterLookup>()

function soundFor(reading: string) {
  if (!sounds.has(reading)) sounds.set(reading, explainSound(reading, soundMapping))
  return sounds.get(reading)!
}

function lookup(char: string): CharacterLookup {
  if (Array.from(char).length !== 1) return { char, readings: [], entries: [], status: 'missing', sources: [] }
  const cached = cache.get(char)
  if (cached) return cached
  const record = READING_RECORDS[char]
  const entries: CharacterEntry[] = []
  for (const pinyin of record?.readings ?? []) {
    const sound = soundFor(pinyin)
    if (!sound) continue
    entries.push({
      encoding: 'shuangpin', char, pronunciation: sound.pronunciation,
      fullCode: sound.code, shape: null, frequency: record.frequency,
      provenance: readingSource, sources,
      notes: [
        '双拼两码仅由已收录的本字读音与已核验声韵映射生成。',
        `读音来源属性：${record.readingSources?.[pinyin]?.join('、') ?? 'Unicode Unihan 现代读音资料'}。`,
        ...(sound.note ? [sound.note] : []),
      ],
    })
  }
  const result: CharacterLookup = {
    char, readings: record?.readings ?? [], entries,
    status: entries.length ? 'trainable' : record ? 'pronunciation-only' : 'missing',
    sources: record ? sources : [],
  }
  // Missing arbitrary input is not retained; real source records are bounded.
  if (record) cache.set(char, result)
  return result
}

function search(query: string, limit = 36): readonly CharacterLookup[] {
  const value = query.trim()
  if (!value || limit <= 0) return []
  const normalized = plainPinyin(value)
  if (!/^[a-z]+$/.test(normalized)) return [...new Set(Array.from(value))].slice(0, limit).map(lookup)
  const results: CharacterLookup[] = []
  for (const [char, record] of Object.entries(READING_RECORDS)) {
    // Filter first; searching must not construct tens of thousands of entries.
    if (!record.readings.some(reading => {
      const sound = soundFor(reading)
      return sound && (plainPinyin(reading) === normalized || sound.code.toLowerCase().startsWith(normalized))
    })) continue
    results.push(lookup(char))
    if (results.length >= limit) break
  }
  return results
}

export const SHUANGPIN_INDEX = { lookup, search }

/** Keep the established review order; use the source's first encodable modern reading. */
export const SHUANGPIN_PRACTICE_ENTRIES: readonly CharacterEntry[] = PRACTICE_ENTRIES.flatMap(entry => {
  const preferred = lookup(entry.char).entries[0]
  return preferred ? [preferred] : []
})

export const SHUANGPIN_STATS = {
  readingCharacters: Object.keys(READING_RECORDS).length,
  trainableCharacters: Object.values(READING_RECORDS).filter(record => record.readings.some(reading => soundFor(reading) !== null)).length,
  practiceCharacters: SHUANGPIN_PRACTICE_ENTRIES.length,
} as const
