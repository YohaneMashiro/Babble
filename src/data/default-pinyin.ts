import annotation from './generated/default-pinyin.json'
import { DEFAULT_PRACTICE_TEXT } from './practice-text'
import type { ReadingAnnotation } from '../domain/automatic-reading'

/** The built-in article was annotated locally at build time, without a web model download. */
export function getPreprocessedPinyin(text: string): ReadingAnnotation | null {
  if (text !== DEFAULT_PRACTICE_TEXT.text) return null
  const chars = Array.from(text)
  if (annotation.codepoints !== chars.length || annotation.readings.length !== chars.length) return null
  const modelIndices = new Set(annotation.modelIndices)
  return {
    text,
    modelVersion: annotation.modelVersion,
    items: chars.map((char, index) => ({ index, char, pinyin: annotation.readings[index], source: annotation.readings[index] ? modelIndices.has(index) ? 'model' as const : 'dictionary' as const : 'unavailable' as const })),
  }
}
