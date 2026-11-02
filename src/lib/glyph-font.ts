// Babble original program: MIT. The separately supplied Jigmo outlines are CC0.
import manifestData from '../assets/glyph-font/manifest.json'

interface GlyphShard { id: string; file: string; bytes: number; sha256: string; characters: number; ranges: readonly (readonly number[])[] }
interface GlyphManifest { schemaVersion: number; family: string; shards: readonly GlyphShard[] }
const manifest = manifestData as GlyphManifest
const byId = new Map(manifest.shards.map(shard => [shard.id, shard]))
const assets = import.meta.glob('../assets/glyph-font/*.woff2', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const loaded = new Set<string>()
const pending = new Map<string, Promise<void>>()
const listeners = new Set<() => void>()
const waiting: (() => void)[] = []
let active = 0

/** Ordinary BMP characters retain their existing system fonts and startup path. */
export function needsGlyphFont(character: string): boolean {
  if (Array.from(character).length !== 1) return false
  const point = character.codePointAt(0)!
  return point >= 0x20000 && point <= 0x33479
    || point >= 0x3400 && point <= 0x4dbf
    || point >= 0xf900 && point <= 0xfaff
    || point >= 0x2e80 && point <= 0x2fff
    || point >= 0x31c0 && point <= 0x31ef
}

export function glyphFontRequirements(text: string): { shards: readonly GlyphShard[]; unavailable: readonly string[]; characters: readonly string[] } {
  const characters = [...new Set(Array.from(text).filter(needsGlyphFont))], ids = new Set<string>(), unavailable: string[] = []
  for (const char of characters) {
    const point = char.codePointAt(0)!, id = (point >>> 10).toString(16).padStart(3, '0'), shard = byId.get(id)
    if (shard?.ranges.some(([start, end]) => point >= start && point <= end)) ids.add(id)
    else unavailable.push(char)
  }
  return { shards: [...ids].map(id => byId.get(id)!), unavailable, characters }
}

export function glyphFontsReady(text: string): boolean { return glyphFontRequirements(text).shards.every(shard => loaded.has(shard.id)) }
export function subscribeGlyphFonts(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener) } }

function schedule(task: () => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const run = () => {
      active++
      void task().then(resolve, reject).finally(() => { active--; waiting.shift()?.() })
    }
    if (active < 4) run()
    else waiting.push(run)
  })
}

function unicodeRange(shard: GlyphShard): string {
  // Some 1,024-codepoint regions cross from Extension A into ordinary URO.
  // Register only rare ranges, so loading that region cannot change normal Han.
  const ranges: [number, number][] = []
  for (const [start, end] of shard.ranges) for (let point = start; point <= end; point++) {
    if (!needsGlyphFont(String.fromCodePoint(point))) continue
    const previous = ranges[ranges.length - 1]
    if (previous && previous[1] + 1 === point) previous[1] = point
    else ranges.push([point, point])
  }
  return ranges.map(([start, end]) => `U+${start.toString(16)}${start === end ? '' : `-${end.toString(16)}`}`).join(',')
}

function loadShard(shard: GlyphShard): Promise<void> {
  if (loaded.has(shard.id)) return Promise.resolve()
  if (pending.has(shard.id)) return pending.get(shard.id)!
  const promise = schedule(async () => {
    if (typeof FontFace === 'undefined' || !document.fonts || !globalThis.crypto?.subtle) throw new Error('当前环境无法加载并校验补充字形。')
    const path = assets[`../assets/glyph-font/${shard.file}`]
    if (!path) throw new Error('未找到对应字形分片。')
    const url = new URL(path, document.baseURI)
    if (url.origin !== location.origin) throw new Error('字形仅从当前网站加载。')
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('字形加载超时，请重试。')) }, 10000) })
    try {
      await Promise.race([timeout, (async () => {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) throw new Error('补充字形暂时无法加载。')
        const bytes = await response.arrayBuffer()
        if (bytes.byteLength !== shard.bytes || bytes.byteLength > 4 * 1024 * 1024) throw new Error('字形文件长度不匹配。')
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join('')
        if (digest !== shard.sha256) throw new Error('字形校验未通过。')
        const face = new FontFace(manifest.family, bytes, { unicodeRange: unicodeRange(shard), display: 'swap', weight: '400' })
        await face.load()
        if (controller.signal.aborted) throw new Error('字形加载已取消。')
        document.fonts.add(face)
        loaded.add(shard.id)
        for (const listener of listeners) listener()
      })()])
    } finally { clearTimeout(timer!) }
  }).finally(() => pending.delete(shard.id))
  pending.set(shard.id, promise)
  return promise
}

export async function ensureGlyphFont(text: string): Promise<{ unavailable: readonly string[] }> {
  const required = glyphFontRequirements(text)
  await Promise.all(required.shards.map(loadShard))
  return { unavailable: required.unavailable }
}

export function unicodeLabels(characters: readonly string[]): string {
  const labels = characters.slice(0, 6).map(char => `U+${char.codePointAt(0)!.toString(16).toUpperCase()}`)
  return labels.join('、') + (characters.length > labels.length ? ' 等' : '')
}
