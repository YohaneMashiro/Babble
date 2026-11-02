import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseUserLibrary, readUserLibraryFile, validateUserLibraryEntries,
  USER_LIBRARY_MAX_BYTES, USER_LIBRARY_MAX_LINES,
} from '../src/domain/user-library'
import { loadUserLibrary, saveUserLibrary, clearUserLibrary } from '../src/state/user-library-storage'
import { isHanCharacter } from '../src/domain/han'

const identity = { sourceLabel: '本地字库.txt', importId: 'fixture:v1' }
afterEach(() => vi.unstubAllGlobals())

describe('user-provided dictionary data', () => {
  it('separates word, short-code, unsupported and non-Han rows, deduplicating only identical character/code pairs', () => {
    const result = parseUserLibrary('# local data\n走\tzztr\n走\tzztr\n走\tABCD\n𠀂\tokhgyi\n𠁳\tokujfgfg\n你好\tnihk\n你\tni\n中\t1234\nA\tabcd\n', identity)
    expect(result.entries.map(row => [row.char, row.code])).toEqual([['走', 'ZZTR'], ['走', 'ABCD'], ['𠀂', 'OKHGYI'], ['𠁳', 'OKUJFGFG']])
    expect(result.counts).toMatchObject({ entries: 4, characters: 3, duplicates: 1, skippedWords: 1, skippedShortCodes: 1, skippedUnsupportedCodes: 1, skippedNonHan: 1 })
    expect(Object.keys(result.entries[0])).toEqual(['char', 'code', 'sourceLabel', 'importId'])
    expect(result.entries[0].sourceLabel).toBe(identity.sourceLabel)
    expect(result.entries[0]).not.toHaveProperty('pronunciation')
    expect(result.entries[0]).not.toHaveProperty('shape')
  })

  it('reads only Rime data rows; header tags and configuration are never evaluated', () => {
    const result = parseUserLibrary('---\nname: example\nversion: "1"\nunsafe: !!js/function () => globalThis.bad = true\n...\n走\tzztr\t100\n𠀂\tokhgyi\t1\n', identity)
    expect(result.format).toBe('rime')
    expect(result.entries).toHaveLength(2)
    expect(globalThis.bad).toBeUndefined()
    expect(() => parseUserLibrary('---\nname: example\n走\tzztr', identity)).toThrow(/数据段/)
    expect(() => parseUserLibrary('---\nname: example\n...\n走\tzztr\t!execute', identity)).toThrow(/第 4 行/)
  })

  it('reads official-style personal phrase INI, CRLF and BOM without treating sequence numbers as codes', () => {
    const result = parseUserLibrary('\uFEFF[CustomPhrase]\r\n; comment\r\nzztr=1,走\r\nokhgyi=2,𠀂\r\na=1,啊\r\nnihk=1,你好\r\n', identity)
    expect(result.format).toBe('ini')
    expect(result.entries.map(row => row.code)).toEqual(['ZZTR', 'OKHGYI'])
    expect(result.counts).toMatchObject({ skippedWords: 1, skippedShortCodes: 1 })
  })

  it('rejects malformed records atomically and never silently accepts a partial dictionary', () => {
    expect(() => parseUserLibrary('走\tzztr\nthis is not a data row', identity)).toThrow(/第 2 行/)
    expect(() => parseUserLibrary('走\tzztr\u0000', identity)).toThrow(/空字符/)
    expect(() => parseUserLibrary('a=1,啊', identity)).toThrow(/没有可导入/)
    expect(() => parseUserLibrary('走\tzztr', { ...identity, importId: '../bad id' })).toThrow(/标识/)
  })

  it('enforces the line limit without truncation, including a valid final row at the exact boundary', () => {
    const prefix = '#\n'.repeat(USER_LIBRARY_MAX_LINES - 1)
    expect(parseUserLibrary(prefix + '走\tzztr\n', identity).counts.lines).toBe(USER_LIBRARY_MAX_LINES)
    expect(() => parseUserLibrary(prefix + '#\n走\tzztr\n', identity)).toThrow(/200,000/)
  })

  it('recognizes encoded Extension J and the Unicode18 D addition independently of host regex version', () => {
    for (const point of [0x323b0, 0x33479, 0x2b81e]) {
      const char = String.fromCodePoint(point)
      expect(isHanCharacter(char)).toBe(true)
      expect(parseUserLibrary(`${char}\tabcd`, identity).entries[0].char).toBe(char)
    }
    for (const value of ['木木', '\ud800', '😀', 'A', String.fromCodePoint(0x3347a)]) expect(isHanCharacter(value)).toBe(false)
  })

  it('validates filename and reported bytes before reading, then validates actual bytes and UTF-8', async () => {
    const neverRead = vi.fn(() => { throw new Error('must not read') })
    await expect(readUserLibraryFile({ name: 'data.bin', size: 1, arrayBuffer: neverRead })).rejects.toThrow(/请选择/)
    await expect(readUserLibraryFile({ name: 'data.txt', size: USER_LIBRARY_MAX_BYTES + 1, arrayBuffer: neverRead })).rejects.toThrow(/16 MiB/)
    expect(neverRead).not.toHaveBeenCalled()
    await expect(readUserLibraryFile({ name: 'data.txt', size: 1, arrayBuffer: async () => new ArrayBuffer(USER_LIBRARY_MAX_BYTES + 1) })).rejects.toThrow(/实际字库/)
    await expect(readUserLibraryFile(new File([Uint8Array.of(0xff)], 'data.txt'))).rejects.toThrow(/UTF-8/)
  })

  it('gives identical file contents a stable import namespace and distinct contents a new namespace', async () => {
    const first = await readUserLibraryFile(new File(['走\tzztr'], 'a.txt'))
    const same = await readUserLibraryFile(new File(['走\tzztr'], 'b.txt'))
    const changed = await readUserLibraryFile(new File(['走\tabcd'], 'a.txt'))
    expect(first.entries[0].importId).toBe(same.entries[0].importId)
    expect(first.entries[0].importId).not.toBe(changed.entries[0].importId)
    expect(first.entries[0].sourceLabel).not.toBe(same.entries[0].sourceLabel)
  })

  it('rejects mixed revisions, duplicate or invalid saved rows while retaining explicit user source identity', () => {
    const row = parseUserLibrary('走\tzztr', identity).entries[0]
    expect(validateUserLibraryEntries([row])).toEqual([row])
    for (const value of [[], [row, row], [row, { ...row, code: 'ABCD', importId: 'fixture:v2' }], [{ ...row, code: 'x' }], [{ ...row, char: '你好' }], [{ ...row, sourceLabel: 'bad\nname' }]]) expect(() => validateUserLibraryEntries(value)).toThrow()
  })
})

describe('independent user dictionary storage', () => {
  it('reports unavailable storage without claiming persistence', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(loadUserLibrary()).rejects.toThrow(/不可用/)
    await expect(saveUserLibrary(parseUserLibrary('走\tzztr', identity).entries)).rejects.toThrow(/不可用/)
    await expect(clearUserLibrary()).rejects.toThrow(/不可用/)
  })

  it('does not delete or rewrite an invalid old snapshot during restore', async () => {
    const put = vi.fn(), remove = vi.fn(), close = vi.fn()
    const store = { get: () => ({ result: { schemaVersion: 99, entries: [] } }), put, delete: remove }
    vi.stubGlobal('indexedDB', { open: () => {
      const request = { result: { close, objectStoreNames: { contains: () => true }, transaction: () => {
        const transaction = { objectStore: () => store }
        queueMicrotask(() => transaction.oncomplete?.())
        return transaction
      } } }
      queueMicrotask(() => request.onsuccess?.())
      return request
    } })
    await expect(loadUserLibrary()).rejects.toThrow(/原记录仍保留/)
    expect(put).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled(); expect(close).toHaveBeenCalled()
  })
})
