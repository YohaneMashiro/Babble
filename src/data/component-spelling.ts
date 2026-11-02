// Original loader code is MIT; generated component records retain their data notices.
import type { AuxiliaryTarget } from '../domain/auxiliary'
import { validateAuxiliaryTarget } from '../domain/auxiliary'
import { isHanCharacter } from '../domain/han'
import spellingLock from '../../data/component-spelling.lock.json'

// URLs only: JSON bodies are fetched on query/import, never in the initial free lesson.
const assets = import.meta.glob('./generated/component-spelling-*.json', { query: '?url', import: 'default', eager: true }) as Record<string, string>
interface Manifest {
  schemaVersion: number
  policyId: string
  components: readonly (readonly [string, string, string, string])[]
  shards: readonly { id: string; file: string; rowCount: number; bytes: number; sha256: string }[]
}
let manifest: Manifest | null = null
let pendingManifest: Promise<Manifest> | null = null
const chunks = new Map<string, ReadonlyMap<string, readonly AuxiliaryTarget[]>>()
const pending = new Map<string, Promise<ReadonlyMap<string, readonly AuxiliaryTarget[]>>>()

async function fetchBytes(name: string): Promise<ArrayBuffer> {
  const url = assets[`./generated/${name}`]
  if (!url) throw new Error('没有找到拼字资料文件。')
  const response = await fetch(url)
  if (!response.ok) throw new Error('拼字资料暂时无法加载。')
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > 4 * 1024 * 1024) throw new Error('拼字资料文件超限。')
  return bytes
}
function json(bytes: ArrayBuffer): unknown { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
async function verify(bytes: ArrayBuffer, expected: { bytes: number; sha256: string }): Promise<void> {
  if (bytes.byteLength !== expected.bytes) throw new Error('拼字资料长度校验失败。')
  if (!globalThis.crypto?.subtle) throw new Error('当前环境无法校验拼字资料，请使用 HTTPS 或本机预览。')
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(byte => byte.toString(16).padStart(2, '0')).join('')
  if (digest !== expected.sha256) throw new Error('拼字资料校验失败。')
}
async function loadManifest(): Promise<Manifest> {
  if (manifest) return manifest
  if (pendingManifest) return pendingManifest
  pendingManifest = (async () => {
    const bytes = await fetchBytes('component-spelling-manifest.json')
    const expected = spellingLock.generated.find(record => record.path.endsWith('/component-spelling-manifest.json'))
    if (!expected) throw new Error('拼字资料清单未锁定。')
    await verify(bytes, expected)
    const value = json(bytes) as Manifest
    if (value.schemaVersion !== 1 || !Array.isArray(value.components) || !Array.isArray(value.shards) || typeof value.policyId !== 'string') throw new Error('拼字资料格式不匹配。')
    for (const row of value.components) if (!Array.isArray(row) || row.length !== 4 || row.some(cell => typeof cell !== 'string')) throw new Error('拼字部件资料无效。')
    manifest = value
    return value
  })().finally(() => { pendingManifest = null })
  return pendingManifest
}
async function loadChunk(id: string): Promise<ReadonlyMap<string, readonly AuxiliaryTarget[]>> {
  if (chunks.has(id)) return chunks.get(id)!
  if (pending.has(id)) return pending.get(id)!
  const promise = (async () => {
    const data = await loadManifest(), info = data.shards.find(shard => shard.id === id)
    const result = new Map<string, AuxiliaryTarget[]>()
    if (!info) { chunks.set(id, result); return result }
    const bytes = await fetchBytes(info.file)
    await verify(bytes, info)
    const value = json(bytes) as { schemaVersion: number; policyId: string; shardId: string; rows: unknown[][] }
    if (value.schemaVersion !== 1 || value.policyId !== data.policyId || value.shardId !== id || !Array.isArray(value.rows) || value.rows.length !== info.rowCount) throw new Error('拼字分片格式不匹配。')
    const seen = new Set<string>()
    for (const row of value.rows) {
      if (!Array.isArray(row) || row.length !== 5) throw new Error('拼字条目格式无效。')
      const [char, code, ids, sourceLine, flag] = row
      if (typeof char !== 'string' || Array.from(char).length !== 1 || ((char.codePointAt(0)! >>> 10).toString(16).padStart(3, '0')) !== id || typeof code !== 'string' || !Array.isArray(ids) || !Number.isInteger(sourceLine) || Number(sourceLine) <= 0 || ![0, 1].includes(Number(flag)) || typeof flag !== 'number') throw new Error('拼字条目字段无效。')
      const parts = ids.map(component => {
        if (!Number.isInteger(component) || !data.components[Number(component)]) throw new Error('拼字部件编号无效。')
        const [part, pinyin, soundCode, source] = data.components[Number(component)]
        return { part, pinyin, code: soundCode, source }
      })
      const target: AuxiliaryTarget = { kind: 'component-spelling', char, code, parts, sourceLine: Number(sourceLine), confirmed: flag === 1, sourceLabel: flag === 1 ? '独立部件拼字 · 与固定参照一致' : '独立部件拼字候选 · 未通过此参照核对', sourceId: data.policyId }
      if (!validateAuxiliaryTarget(target) || seen.has(`${char}:${code}`)) throw new Error('拼字条目不能安全恢复。')
      seen.add(`${char}:${code}`)
      const records = result.get(char) ?? []; records.push(target); result.set(char, records)
    }
    chunks.set(id, result)
    return result
  })().finally(() => pending.delete(id))
  pending.set(id, promise)
  return promise
}

export async function loadComponentSpellings(characters: readonly string[]): Promise<ReadonlyMap<string, readonly AuxiliaryTarget[]>> {
  const chars = [...new Set(characters.filter(isHanCharacter))]
  const ids = [...new Set(chars.map(char => (char.codePointAt(0)! >>> 10).toString(16).padStart(3, '0')))]
  await Promise.all(ids.map(loadChunk))
  return new Map(chars.map(char => [char, chunks.get((char.codePointAt(0)! >>> 10).toString(16).padStart(3, '0'))?.get(char) ?? []]))
}
