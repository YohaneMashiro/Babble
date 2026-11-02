import { auxiliaryTargetKey, type AuxiliaryState, type AuxiliaryTarget } from '../domain/auxiliary'

export interface AuxiliaryRecord { key: string; attempts: number; streak: number; everMastered: boolean }
const memory = new Map<string, AuxiliaryRecord>()
let queue: Promise<unknown> = Promise.resolve()
let database: Promise<IDBDatabase> | null = null
let memoryOnly = false
export type AuxiliaryStorageStatus = 'saved' | 'loading' | 'memory-only'
function open(): Promise<IDBDatabase> {
  if (database) return database
  database = new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => fail(new Error('Opening auxiliary storage timed out')), 2500)
    function fail(error: unknown) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    }
    let request: IDBOpenDBRequest
    try { request = indexedDB.open('babble-auxiliary-learning-v1', 1) }
    catch (error) { fail(error); return }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('targets')) request.result.createObjectStore('targets', { keyPath: 'key' })
      if (!request.result.objectStoreNames.contains('attempts')) request.result.createObjectStore('attempts', { autoIncrement: true })
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      // A timed-out or blocked request can succeed later. Never resume writes
      // after the page has already fallen back to memory-only practice.
      if (settled) { db.close(); return }
      settled = true
      clearTimeout(timer)
      resolve(db)
    }
    request.onerror = () => fail(request.error)
    request.onblocked = () => fail(new Error('Local auxiliary storage is blocked'))
  })
  return database
}

function transaction<T>(db: IDBDatabase, stores: string | string[], mode: IDBTransactionMode, action: (tx: IDBTransaction) => () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction
    try { tx = db.transaction(stores, mode) } catch (error) { reject(error); return }
    let finished = false
    const finish = (error?: unknown) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      if (error) reject(error)
      else { try { resolve(result()) } catch (failure) { reject(failure) } }
    }
    const timer = setTimeout(() => {
      try { tx.abort() } catch { /* The transaction may already be inactive. */ }
      finish(new Error('Auxiliary storage transaction timed out'))
    }, 5000)
    let result: () => T
    tx.oncomplete = () => finish()
    tx.onerror = () => finish(tx.error ?? new Error('Auxiliary storage transaction failed'))
    tx.onabort = () => finish(tx.error ?? new Error('Auxiliary storage transaction was aborted'))
    try { result = action(tx) }
    catch (error) { try { tx.abort() } catch { /* already inactive */ } finish(error) }
  })
}
const empty = (key: string): AuxiliaryRecord => ({ key, attempts: 0, streak: 0, everMastered: false })
function valid(value: unknown, key: string): value is AuxiliaryRecord {
  const r = value as AuxiliaryRecord | undefined
  return !!r && r.key === key && Number.isSafeInteger(r.attempts) && r.attempts >= 0 && Number.isSafeInteger(r.streak) && r.streak >= 0 && r.streak <= r.attempts && typeof r.everMastered === 'boolean'
}
async function readBase(target: AuxiliaryTarget): Promise<{ record: AuxiliaryRecord; status: AuxiliaryStorageStatus }> {
  const key = auxiliaryTargetKey(target)
  if (memory.has(key)) return { record: memory.get(key)!, status: memoryOnly ? 'memory-only' : 'saved' }
  try {
    const db = await open()
    const result = await transaction<unknown>(db, 'targets', 'readonly', tx => {
      const request = tx.objectStore('targets').get(key)
      return () => request.result
    })
    if (result !== undefined && !valid(result, key)) throw new Error('Invalid stored auxiliary record')
    const record = (result as AuxiliaryRecord | undefined) ?? empty(key)
    if (!memory.has(key)) memory.set(key, record)
    if (memoryOnly) return { record, status: 'memory-only' as const }
    return { record: memory.get(key)!, status: 'saved' }
  } catch { memoryOnly = true; return { record: memory.get(key) ?? empty(key), status: 'memory-only' } }
}
export async function readAuxiliaryRecord(target: AuxiliaryTarget): Promise<{ record: AuxiliaryRecord; status: AuxiliaryStorageStatus }> {
  await queue
  return readBase(target)
}

export function saveAuxiliaryAttempt(target: AuxiliaryTarget, state: AuxiliaryState, completed: boolean): Promise<{ record: AuxiliaryRecord; status: AuxiliaryStorageStatus }> {
  const key = auxiliaryTargetKey(target)
  const task = queue.then(async () => {
    // A disclosure can be finalized while its initial read is pending. Always
    // obtain that baseline before computing a replacement; never overwrite it
    // with an empty default simply because the UI changed quickly.
    const previous = (await readBase(target)).record
    const independent = completed && !state.assisted && state.typed === target.code
    const record = { key, attempts: previous.attempts + 1, streak: independent ? previous.streak + 1 : 0, everMastered: previous.everMastered || (independent && previous.streak + 1 >= 2) }
    memory.set(key, record)
    if (memoryOnly) return { record, status: 'memory-only' as const }
    try {
      const db = await open()
      await transaction<void>(db, ['targets', 'attempts'], 'readwrite', tx => {
        tx.objectStore('targets').put(record)
        tx.objectStore('attempts').add({ targetKey: key, kind: target.kind, char: target.char, code: target.code, completed, independent, assisted: state.assisted, typed: state.typed, at: Date.now() })
        return () => undefined
      })
      return { record, status: 'saved' as const }
    } catch { memoryOnly = true; return { record, status: 'memory-only' as const } }
  })
  queue = task.catch(() => undefined)
  return task
}
