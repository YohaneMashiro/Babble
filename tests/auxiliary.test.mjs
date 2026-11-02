import { afterEach, describe, expect, it, vi } from 'vitest'
import { auxiliaryTargetKey, initialAuxiliaryState, typeAuxiliary, validateAuxiliaryTarget } from '../src/domain/auxiliary'

const target = {
  kind: 'component-spelling', char: '𠀂', code: 'OKHGYI', sourceLabel: 'independent fixture', sourceId: 'fixture:policy:v1', confirmed: true,
  parts: [{ part: '一', pinyin: 'héng', code: 'HG', source: 'fixture:rule' }, { part: '乙', pinyin: 'yǐ', code: 'YI', source: 'fixture:reading' }],
}
function complete(item = target, assisted = false) {
  let state = { ...initialAuxiliaryState(), assisted }
  for (const letter of item.code) state = typeAuxiliary(state, item, letter)
  return state
}

/** Minimal asynchronous IDB boundary: writes commit together or abort together. */
function fakeDatabase({ stored, holdReads = false, hangRead = false, failAdd = false, hangWrite = false } = {}) {
  const records = new Map(stored), attempts = [], pendingReads = [], writes = [], close = vi.fn(), abort = vi.fn()
  const db = {
    close,
    transaction: (_stores, mode) => {
      let aborted = false
      const requests = [], operations = []
      const tx = {
        abort: () => { abort(); aborted = true; queueMicrotask(() => tx.onabort?.()) },
        objectStore: name => ({
          get: key => { const request = {}; requests.push(() => { request.result = structuredClone(records.get(key)) }); return request },
          put: record => { writes.push(record); operations.push(() => records.set(record.key, structuredClone(record))); return {} },
          add: attempt => { if (failAdd) throw new Error('quota'); operations.push(() => attempts.push(structuredClone(attempt))); return {} },
          name,
        }),
      }
      const finish = () => {
        if (aborted) return
        for (const read of requests) read()
        for (const operation of operations) operation()
        tx.oncomplete?.()
      }
      if (mode === 'readonly' && (holdReads || hangRead)) pendingReads.push(finish)
      else if (!(mode === 'readwrite' && hangWrite)) queueMicrotask(finish)
      return tx
    },
  }
  vi.stubGlobal('indexedDB', { open: () => {
    const request = { result: db }
    queueMicrotask(() => request.onsuccess?.())
    return request
  } })
  return { records, attempts, writes, close, abort, releaseReads: () => { for (const finish of pendingReads.splice(0)) finish() } }
}
async function storage() { vi.resetModules(); return import('../src/state/auxiliary-storage') }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('component and user-code targets', () => {
  it('accepts six and eight keys, retaining the correct prefix after a wrong key', () => {
    const eight = { ...target, code: 'OKHGYIYI', parts: [...target.parts, target.parts[1]] }
    for (const item of [target, eight]) {
      expect(validateAuxiliaryTarget(item)).toBe(true)
      let state = typeAuxiliary(initialAuxiliaryState(), item, 'o')
      state = typeAuxiliary(state, item, 'x')
      expect(state.accepted).toBe('O'); expect(state.error).toEqual({ input: 'X', expected: 'K', position: 1 })
      for (const letter of item.code.slice(1)) state = typeAuxiliary(state, item, letter)
      expect(state.completed).toBe(true); expect(state.accepted).toBe(item.code)
      expect(state.typed).toBe('OX' + item.code.slice(1))
      expect(typeAuxiliary(state, item, 'a')).toBe(state)
    }
  })

  it('keeps user schemes, source revisions and complete codes in distinct target keys', () => {
    const alternatives = [target, { ...target, code: 'OKHGYIYI' }, { ...target, sourceId: 'fixture:policy:v2' }, { ...target, kind: 'user-code' }]
    expect(new Set(alternatives.map(auxiliaryTargetKey)).size).toBe(4)
    expect(validateAuxiliaryTarget({ ...target, parts: target.parts.slice(0, 1) })).toBe(false)
    expect(validateAuxiliaryTarget({ ...target, code: 'HGYI' })).toBe(false)
    expect(validateAuxiliaryTarget({ ...target, kind: 'user-code', code: 'ABCD', parts: [] })).toBe(true)
    expect(validateAuxiliaryTarget({ ...target, char: '木木' })).toBe(false)
  })
})

describe('isolated auxiliary learning storage', () => {
  it('requires two adjacent independent successes and preserves historical mastery after assisted or wrong attempts', async () => {
    const db = fakeDatabase(), api = await storage()
    let saved = await api.saveAuxiliaryAttempt(target, complete(), true)
    expect(saved.record).toMatchObject({ attempts: 1, streak: 1, everMastered: false })
    saved = await api.saveAuxiliaryAttempt(target, complete(target, true), true)
    expect(saved.record).toMatchObject({ attempts: 2, streak: 0, everMastered: false })
    saved = await api.saveAuxiliaryAttempt(target, complete(), true)
    expect(saved.record.everMastered).toBe(false)
    saved = await api.saveAuxiliaryAttempt(target, complete(), true)
    expect(saved.record).toMatchObject({ attempts: 4, streak: 2, everMastered: true })
    const wrong = typeAuxiliary(initialAuxiliaryState(), target, 'X')
    saved = await api.saveAuxiliaryAttempt(target, wrong, false)
    expect(saved.record).toMatchObject({ attempts: 5, streak: 0, everMastered: true })
    const user = { ...target, kind: 'user-code' }
    expect((await api.readAuxiliaryRecord(user)).record.attempts).toBe(0)
    expect(db.attempts.map(attempt => attempt.independent)).toEqual([true, false, true, true, false])
  })

  it('awaits a pending baseline before saving a quickly finalized attempt and serializes rapid saves', async () => {
    const key = auxiliaryTargetKey(target), previous = { key, attempts: 7, streak: 1, everMastered: false }
    const db = fakeDatabase({ stored: [[key, previous]], holdReads: true }), api = await storage()
    const reading = api.readAuxiliaryRecord(target)
    const saving = api.saveAuxiliaryAttempt(target, complete(), true)
    // Let both the initial UI read and the queued save reach their IDB boundary.
    await new Promise(resolve => setTimeout(resolve, 0))
    db.releaseReads()
    await reading
    expect((await saving).record).toMatchObject({ attempts: 8, streak: 2, everMastered: true })
    const results = await Promise.all([api.saveAuxiliaryAttempt(target, complete(), true), api.saveAuxiliaryAttempt(target, complete(), true)])
    expect(results.map(result => result.record.attempts)).toEqual([9, 10])
    expect(db.records.get(key).attempts).toBe(10)
  })

  it('keeps an invalid old record untouched and uses only memory for subsequent attempts', async () => {
    const key = auxiliaryTargetKey(target), invalid = { key, attempts: 'old-format', streak: 0, everMastered: false }
    const db = fakeDatabase({ stored: [[key, invalid]] }), api = await storage()
    expect((await api.readAuxiliaryRecord(target)).status).toBe('memory-only')
    expect((await api.saveAuxiliaryAttempt(target, complete(), true)).record.attempts).toBe(1)
    expect((await api.saveAuxiliaryAttempt(target, complete(), true)).record.everMastered).toBe(true)
    expect(db.records.get(key)).toEqual(invalid); expect(db.writes).toHaveLength(0); expect(db.attempts).toHaveLength(0)
  })

  it('does not commit only half an attempt if its atomic write fails, then continues in memory', async () => {
    const key = auxiliaryTargetKey(target), previous = { key, attempts: 3, streak: 0, everMastered: false }
    const db = fakeDatabase({ stored: [[key, previous]], failAdd: true }), api = await storage()
    const saved = await api.saveAuxiliaryAttempt(target, complete(), true)
    expect(saved.status).toBe('memory-only'); expect(saved.record.attempts).toBe(4)
    expect(db.records.get(key)).toEqual(previous); expect(db.attempts).toHaveLength(0); expect(db.abort).toHaveBeenCalled()
    expect((await api.saveAuxiliaryAttempt(target, complete(), true)).record.attempts).toBe(5)
    expect(db.writes).toHaveLength(1)
  })

  it('falls back after an open timeout and closes late success without writing', async () => {
    vi.useFakeTimers()
    const close = vi.fn(), transaction = vi.fn(), request = { result: { close, transaction } }
    vi.stubGlobal('indexedDB', { open: () => request })
    const api = await storage(), reading = api.readAuxiliaryRecord(target)
    await vi.advanceTimersByTimeAsync(2501)
    expect((await reading).status).toBe('memory-only')
    request.onsuccess()
    expect(close).toHaveBeenCalledOnce()
    expect((await api.saveAuxiliaryAttempt(target, complete(), true)).status).toBe('memory-only')
    expect(transaction).not.toHaveBeenCalled()
  })

  it('aborts a hung read rather than overwriting an unread old baseline', async () => {
    vi.useFakeTimers()
    const key = auxiliaryTargetKey(target), previous = { key, attempts: 10, streak: 1, everMastered: false }
    const db = fakeDatabase({ stored: [[key, previous]], hangRead: true }), api = await storage()
    const saving = api.saveAuxiliaryAttempt(target, complete(), true)
    await vi.advanceTimersByTimeAsync(5001)
    expect((await saving).status).toBe('memory-only')
    expect(db.abort).toHaveBeenCalledOnce(); expect(db.writes).toHaveLength(0)
    expect(db.records.get(key)).toEqual(previous)
  })

  it('aborts a hung atomic write and never replaces the committed snapshot with its memory result', async () => {
    vi.useFakeTimers()
    const key = auxiliaryTargetKey(target), previous = { key, attempts: 10, streak: 1, everMastered: false }
    const db = fakeDatabase({ stored: [[key, previous]], hangWrite: true }), api = await storage()
    const saving = api.saveAuxiliaryAttempt(target, complete(), true)
    await vi.advanceTimersByTimeAsync(5001)
    const result = await saving
    expect(result.status).toBe('memory-only'); expect(result.record.attempts).toBe(11)
    expect(db.abort).toHaveBeenCalledOnce(); expect(db.records.get(key)).toEqual(previous); expect(db.attempts).toHaveLength(0)
  })
})
