// Babble original adapter: MIT. g2pW and its data retain their separate notices.
export interface ContextualPinyinItem {
  /** Index in Array.from(text), never an offset in UTF-16 code units. */
  index: number
  char: string
  pinyin: string | null
  source: 'model' | 'dictionary' | 'unavailable'
  /** Raw model softmax probability; not a calibrated correctness guarantee. */
  probability?: number
}

export interface ContextualPinyinResult {
  text: string
  modelVersion: string
  items: readonly ContextualPinyinItem[]
}

export interface ContextualPinyinStatus {
  phase: 'idle' | 'loading' | 'ready' | 'error'
  stage?: string
  loadedBytes?: number
  totalBytes?: number
  completed?: number
  total?: number
  error?: string
  modelVersion?: string
}

export interface G2PWResource {
  file: string
  bytes: number
  sha256: string
}

export interface G2PWManifest {
  schemaVersion: 1
  provider: 'g2pw'
  version: string
  metadata: G2PWResource
  model: { bytes: number; sha256: string; shards: readonly G2PWResource[] }
  runtime: { version: string; mjs: G2PWResource; wasm: G2PWResource }
}

export interface G2PWMetadata {
  config: { windowSize: number | null; useMask: boolean; useCharPhoneme: boolean; maxLength: number }
  tokenizer?: { doLowerCase: boolean; stripAccents: boolean; tokenizeChineseChars: boolean; cleanText: boolean }
  vocab: readonly string[]
  labels: readonly string[]
  chars: readonly string[]
  char2phonemes: Readonly<Record<string, readonly number[]>>
  monophonic: Readonly<Record<string, string>>
  charBopomofo: Readonly<Record<string, readonly string[]>>
  bopomofoToPinyin: Readonly<Record<string, string>>
  simplifiedToTraditional: Readonly<Record<string, string>>
  inputTypes?: Readonly<Record<string, string>>
  outputName?: string
}

export type G2PWWorkerCommand =
  | { type: 'load'; baseUrl: string; retry: boolean }
  | { type: 'annotate'; requestId: number; text: string }
  | { type: 'cancel'; requestId: number }

export type G2PWWorkerResponse =
  | { type: 'status'; status: ContextualPinyinStatus }
  | { type: 'loaded'; modelVersion: string }
  | { type: 'result'; requestId: number; result: ContextualPinyinResult }
  | { type: 'error'; requestId?: number; message: string }
