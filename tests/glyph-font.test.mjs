import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import manifest from '../src/assets/glyph-font/manifest.json'

const char = '𠁳', other = '𠀂', unicode18Addition = String.fromCodePoint(0x2b81e)
const shard = manifest.shards.find(item => item.id === '080')
const bytes = await readFile(new URL(`../src/assets/glyph-font/${shard.file}`, import.meta.url))
// Transform the large asset URL glob once, outside per-test timeout budgets.
await import('../src/lib/glyph-font')
const arrayBuffer = buffer => Uint8Array.from(buffer).buffer
async function loader() { vi.resetModules(); return import('../src/lib/glyph-font') }
function browserBoundary(fetcher = async () => new Response(arrayBuffer(bytes))) {
  const added = [], faces = [], fetch = vi.fn(fetcher)
  vi.stubGlobal('location', { origin: 'https://babble.test' })
  vi.stubGlobal('document', { baseURI: 'https://babble.test/', fonts: { add: face => added.push(face) } })
  vi.stubGlobal('fetch', fetch)
  vi.stubGlobal('FontFace', class {
    constructor(family, data, descriptors) { this.family = family; this.data = data; this.descriptors = descriptors; faces.push(this) }
    async load() { return this }
  })
  return { added, faces, fetch }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('on-demand licensed glyph fallback', () => {
  it('uses exact cmap coverage, distinguishes Unicode18 gaps, and requests no ordinary startup characters', async () => {
    const boundary = browserBoundary(), api = await loader()
    expect(api.glyphFontRequirements(`某A${char}${char}${unicode18Addition}`)).toMatchObject({ characters: [char, unicode18Addition], unavailable: [unicode18Addition] })
    expect(api.glyphFontRequirements(char).shards.map(item => item.id)).toEqual(['080'])
    expect(api.glyphFontRequirements(unicode18Addition).shards).toHaveLength(0)
    expect((await api.ensureGlyphFont('某ABC123')).unavailable).toEqual([])
    expect(boundary.fetch).not.toHaveBeenCalled(); expect(boundary.faces).toHaveLength(0)
  })

  it('deduplicates shared chunks, verifies actual bytes and registers exact Unicode ranges before reporting ready', async () => {
    const boundary = browserBoundary(), api = await loader(), changed = vi.fn()
    const unsubscribe = api.subscribeGlyphFonts(changed)
    expect(api.glyphFontsReady(char)).toBe(false)
    await Promise.all([api.ensureGlyphFont(char), api.ensureGlyphFont(other)])
    expect(boundary.fetch).toHaveBeenCalledOnce(); expect(boundary.added).toHaveLength(1)
    expect(boundary.faces[0].family).toBe('Babble Glyphs')
    expect(boundary.faces[0].descriptors.unicodeRange).toContain('U+20000')
    expect(boundary.faces[0].data.byteLength).toBe(bytes.length)
    expect(api.glyphFontsReady(char)).toBe(true); expect(changed).toHaveBeenCalledOnce()
    const [url, options] = boundary.fetch.mock.calls[0]
    expect(url.origin).toBe('https://babble.test'); expect(url.search).toBe('')
    expect(options).not.toHaveProperty('body')
    await api.ensureGlyphFont(char)
    expect(boundary.fetch).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('rejects changed outlines before FontFace registration and allows a real retry', async () => {
    const wrong = Uint8Array.from(bytes); wrong[wrong.length - 1] ^= 1
    const boundary = browserBoundary(), api = await loader()
    boundary.fetch.mockResolvedValueOnce(new Response(wrong))
    await expect(api.ensureGlyphFont(char)).rejects.toThrow(/校验/)
    expect(boundary.faces).toHaveLength(0); expect(boundary.added).toHaveLength(0); expect(api.glyphFontsReady(char)).toBe(false)
    await api.ensureGlyphFont(char)
    expect(boundary.fetch).toHaveBeenCalledTimes(2); expect(boundary.added).toHaveLength(1)
  })

  it('rejects truncated files without claiming the character itself has no code', async () => {
    const boundary = browserBoundary(async () => new Response(new Uint8Array(4))), api = await loader()
    await expect(api.ensureGlyphFont(char)).rejects.toThrow(/长度/)
    expect(boundary.faces).toHaveLength(0)
    expect(api.glyphFontRequirements(char).unavailable).toEqual([])
  })

  it('limits a hung local font fetch and retries successfully afterward', async () => {
    vi.useFakeTimers()
    const boundary = browserBoundary(), api = await loader()
    boundary.fetch.mockImplementationOnce((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))))
    const loading = api.ensureGlyphFont(char)
    const rejected = expect(loading).rejects.toThrow(/超时|aborted/)
    await vi.advanceTimersByTimeAsync(10001)
    await rejected
    expect(boundary.added).toHaveLength(0)
    await api.ensureGlyphFont(char)
    expect(boundary.fetch).toHaveBeenCalledTimes(2); expect(api.glyphFontsReady(char)).toBe(true)
  })
})
