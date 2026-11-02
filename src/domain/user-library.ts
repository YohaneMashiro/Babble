import { isHanCharacter } from './han'

export const USER_LIBRARY_MAX_BYTES = 16 * 1024 * 1024
export const USER_LIBRARY_MAX_LINES = 200_000

/** User-supplied keys are neither a pronunciation nor independently audited roots. */
export interface UserCodeTarget {
  char: string
  code: string
  sourceLabel: string
  importId: string
}

export interface UserLibraryCounts {
  lines: number
  entries: number
  characters: number
  duplicates: number
  skippedWords: number
  skippedShortCodes: number
  skippedUnsupportedCodes: number
  skippedNonHan: number
}

export interface UserLibraryParseResult {
  entries: readonly UserCodeTarget[]
  counts: UserLibraryCounts
  format: 'text' | 'rime' | 'ini'
}

export function isUserLibraryHan(value: string): boolean {
  return isHanCharacter(value)
}

export function isUserLibraryCode(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[A-Z]{4}|OK[A-Z]{4}(?:[A-Z]{2})?)$/.test(value)
}

function validateIdentity(sourceLabel: string, importId: string) {
  if (!sourceLabel.trim() || sourceLabel.length > 240 || /[\u0000-\u001f\u007f]/.test(sourceLabel)) throw new Error('字库文件名无效。')
  if (!/^[a-zA-Z0-9:._-]{1,160}$/.test(importId)) throw new Error('字库标识无效。')
}

/** Parse data rows only; no YAML object, code, template or plugin is executed. */
export function parseUserLibrary(text: string, identity: { sourceLabel: string; importId: string }): UserLibraryParseResult {
  validateIdentity(identity.sourceLabel, identity.importId)
  if (new TextEncoder().encode(text).byteLength > USER_LIBRARY_MAX_BYTES) throw new Error('字库超过 16 MiB，当前字库保持不变。')
  if (/[\u0000]/.test(text)) throw new Error('字库含有无效的空字符，请使用 UTF-8 明文。')
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
  const lineCount = lines.length - (lines.at(-1) === '' ? 1 : 0)
  if (lineCount > USER_LIBRARY_MAX_LINES) throw new Error('字库超过 200,000 行，文件没有被截断。')
  const first = lines.find(line => line.trim() && !/^\s*[#;]/.test(line))?.trim()
  const isRime = first === '---' || /^(?:name|version|sort|columns|use_preset_vocabulary)\s*:/.test(first ?? '')
  const headerEnd = isRime ? lines.findIndex(line => line.trim() === '...') : -1
  if (isRime && headerEnd < 0) throw new Error('Rime 字库缺少数据段标记「...」，未应用任何条目。')
  const counts: UserLibraryCounts = { lines: lineCount, entries: 0, characters: 0, duplicates: 0, skippedWords: 0, skippedShortCodes: 0, skippedUnsupportedCodes: 0, skippedNonHan: 0 }
  const entries: UserCodeTarget[] = []
  const seen = new Set<string>(), characters = new Set<string>()
  let sawIni = false
  for (let index = isRime ? headerEnd + 1 : 0; index < lines.length; index++) {
    const line = lines[index].trim()
    if (!line || /^[#;]/.test(line) || /^\[[^\]\r\n]+\]$/.test(line)) continue
    let char: string, code: string
    const ini = /^([^\s=]+)\s*=\s*(\d+)\s*,\s*(.*)$/.exec(line)
    if (ini) {
      sawIni = true
      code = ini[1]; char = ini[3].trim()
    } else {
      const fields = line.includes('\t') ? line.split('\t').map(field => field.trim()) : line.split(/\s+/)
      if (fields.length < 2 || fields.length > 3 || (fields.length === 3 && !/^\d+(?:\.\d+)?$/.test(fields[2]))) {
        throw new Error(`第 ${index + 1} 行不是支持的字码记录，当前字库保持不变。`)
      }
      ;[char, code] = fields
    }
    if (!char || !code) throw new Error(`第 ${index + 1} 行缺少汉字或编码。`)
    if (Array.from(char).length > 1) { counts.skippedWords++; continue }
    if (!isUserLibraryHan(char)) { counts.skippedNonHan++; continue }
    code = code.toUpperCase()
    if (/^[A-Z]{1,3}$/.test(code)) { counts.skippedShortCodes++; continue }
    if (!isUserLibraryCode(code)) { counts.skippedUnsupportedCodes++; continue }
    const key = `${char}\0${code}`
    if (seen.has(key)) { counts.duplicates++; continue }
    seen.add(key); characters.add(char)
    entries.push({ char, code, sourceLabel: identity.sourceLabel, importId: identity.importId })
  }
  if (!entries.length) throw new Error('没有可导入的单字四码或 OK 六／八码记录。原字库保持不变。')
  counts.entries = entries.length; counts.characters = characters.size
  return { entries, counts, format: isRime ? 'rime' : sawIni ? 'ini' : 'text' }
}

/** Also validates records read back from local storage; invalid old data stays intact. */
export function validateUserLibraryEntries(value: unknown): readonly UserCodeTarget[] {
  if (!Array.isArray(value) || !value.length || value.length > USER_LIBRARY_MAX_LINES) throw new Error('保存的本地字库格式无法安全恢复。')
  const seen = new Set<string>()
  let importId: string | undefined
  const result = value.map(row => {
    if (!row || typeof row !== 'object' || typeof row.char !== 'string' || !isUserLibraryHan(row.char) || !isUserLibraryCode(row.code) || typeof row.sourceLabel !== 'string' || typeof row.importId !== 'string') throw new Error('保存的本地字库含有无效记录。')
    validateIdentity(row.sourceLabel, row.importId)
    importId ??= row.importId
    if (row.importId !== importId) throw new Error('保存的本地字库混合了不同导入版本。')
    const key = `${row.char}\0${row.code}`
    if (seen.has(key)) throw new Error('保存的本地字库含重复记录。')
    seen.add(key)
    return { char: row.char, code: row.code, sourceLabel: row.sourceLabel, importId: row.importId }
  })
  if (new TextEncoder().encode(JSON.stringify(result)).length > USER_LIBRARY_MAX_BYTES * 5) throw new Error('保存的本地字库超过恢复上限。')
  return result
}

async function contentId(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)
    return `sha256:${Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')}`
  }
  // Stable namespace only, never a signature or an assertion of source trust.
  let first = 0x811c9dc5, second = 0x9e3779b9
  for (const byte of bytes) { first = Math.imul(first ^ byte, 0x01000193); second = Math.imul(second ^ byte, 0x85ebca6b) }
  return `content:${(first >>> 0).toString(16)}.${(second >>> 0).toString(16)}.${bytes.length}`
}

export async function readUserLibraryFile(file: Pick<File, 'name' | 'size' | 'arrayBuffer'>): Promise<UserLibraryParseResult> {
  if (!/\.(?:txt|tsv|ini|ya?ml)$/i.test(file.name)) throw new Error('请选择 UTF-8 TXT、TSV、INI 或 Rime YAML 字库。')
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > USER_LIBRARY_MAX_BYTES) throw new Error('字库文件超过 16 MiB，原字库保持不变。')
  const buffer = await file.arrayBuffer()
  if (buffer.byteLength > USER_LIBRARY_MAX_BYTES) throw new Error('实际字库文件超过 16 MiB，原字库保持不变。')
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer) }
  catch { throw new Error('字库不是有效 UTF-8 文本，原字库保持不变。') }
  return parseUserLibrary(text, { sourceLabel: file.name, importId: await contentId(new Uint8Array(buffer)) })
}
