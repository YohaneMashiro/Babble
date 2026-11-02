import { validateUserLibraryEntries, type UserCodeTarget } from '../domain/user-library'

const databaseName = 'babble-user-library-v1'
const key = 'active'
let writeQueue: Promise<unknown> = Promise.resolve()

function orderedWrite(operation: () => Promise<unknown>): Promise<void> {
  const result = writeQueue.then(operation)
  writeQueue = result.catch(() => undefined)
  return result.then(() => undefined)
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('本机存储不可用。')); return }
    let settled = false
    const timer = setTimeout(() => fail(new Error('打开本机字库存储超时。')), 2500)
    function fail(error: Error) { if (!settled) { settled = true; clearTimeout(timer); reject(error) } }
    let request: IDBOpenDBRequest
    try { request = indexedDB.open(databaseName, 1) } catch { fail(new Error('浏览器拒绝本机字库存储。')); return }
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('libraries')) request.result.createObjectStore('libraries') }
    request.onerror = () => fail(new Error('无法打开本机字库存储。'))
    request.onblocked = () => fail(new Error('其他页面正占用本机字库存储。'))
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      if (settled) { database.close(); return }
      settled = true; clearTimeout(timer); resolve(database)
    }
  })
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    let work: IDBTransaction
    try { work = database.transaction('libraries', mode) } catch { database.close(); reject(new Error('无法访问本机字库。')); return }
    let finished = false
    const finish = (error?: Error) => {
      if (finished) return
      finished = true; clearTimeout(timer); database.close()
      if (error) reject(error)
      else resolve(request.result)
    }
    const timer = setTimeout(() => { try { work.abort() } catch { /* already finished */ } finish(new Error('本机字库操作超时。')) }, 5000)
    let request: IDBRequest<T>
    try { request = action(work.objectStore('libraries')) }
    catch { try { work.abort() } catch { /* already inactive */ } finish(new Error('本机字库操作失败。')); return }
    work.oncomplete = () => finish()
    work.onerror = () => finish(new Error('无法保存或读取本机字库。'))
    work.onabort = () => finish(new Error('本机字库操作未完成。'))
  })
}

export async function loadUserLibrary(): Promise<readonly UserCodeTarget[] | null> {
  await writeQueue
  const record: unknown = await transaction('readonly', store => store.get(key))
  if (record === undefined) return null
  if (!record || typeof record !== 'object' || !('schemaVersion' in record) || record.schemaVersion !== 1 || !('entries' in record)) throw new Error('保存的本机字库格式无法恢复；原记录仍保留。')
  return validateUserLibraryEntries(record.entries)
}

export async function saveUserLibrary(entries: readonly UserCodeTarget[]): Promise<void> {
  const validated = validateUserLibraryEntries(entries)
  await orderedWrite(() => transaction('readwrite', store => store.put({ schemaVersion: 1, entries: validated }, key)))
}

export async function clearUserLibrary(): Promise<void> {
  await orderedWrite(() => transaction('readwrite', store => store.delete(key)))
}
