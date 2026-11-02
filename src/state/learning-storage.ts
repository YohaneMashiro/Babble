import { restoreLearningSnapshot, type AttemptRecord, type LearningSnapshot } from '../domain/progress'

const databaseName = 'babble-learning-v1'
const databaseVersion = 1
const snapshotKey = 'snapshot'

function openLearningDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'))
      return
    }
    let settled = false
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      reject(error instanceof Error ? error : new Error('Unable to open learning records'))
    }
    let request: IDBOpenDBRequest
    try { request = indexedDB.open(databaseName, databaseVersion) } catch (error) { fail(error); return }
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('state')) database.createObjectStore('state')
      if (!database.objectStoreNames.contains('attempts')) database.createObjectStore('attempts', { autoIncrement: true })
    }
    request.onblocked = () => fail(new Error('Learning records are blocked by another open database connection'))
    request.onerror = () => fail(request.error ?? new Error('Unable to open learning records'))
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      // A blocked request may eventually succeed after callers have fallen back.
      if (settled) { database.close(); return }
      settled = true
      resolve(database)
    }
  })
}

export async function loadLearningProgress(): Promise<LearningSnapshot | null> {
  const database = await openLearningDatabase()
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction
    try { transaction = database.transaction('state', 'readonly') } catch (error) { database.close(); reject(error); return }
    const request = transaction.objectStore('state').get(snapshotKey)
    transaction.oncomplete = () => {
      database.close()
      try {
        // Validate only after the read transaction completes; invalid records stay intact.
        resolve(request.result === undefined ? null : restoreLearningSnapshot(request.result))
      } catch (error) { reject(error) }
    }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? request.error ?? new Error('Unable to read learning records')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('Learning record read was aborted')) }
  })
}

export async function saveLearningProgress(snapshot: LearningSnapshot, attempt?: AttemptRecord): Promise<void> {
  const database = await openLearningDatabase()
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction
    try { transaction = database.transaction(attempt ? ['state', 'attempts'] : ['state'], 'readwrite') } catch (error) { database.close(); reject(error); return }
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('Unable to save learning records')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('Learning record save was aborted')) }
    try {
      transaction.objectStore('state').put(snapshot, snapshotKey)
      if (attempt) transaction.objectStore('attempts').add(attempt)
    } catch (error) {
      transaction.abort()
      database.close()
      reject(error)
    }
  })
}
