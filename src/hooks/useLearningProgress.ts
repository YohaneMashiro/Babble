import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyLearningSnapshot, type AttemptRecord, type LearningSnapshot } from '../domain/progress'
import { loadLearningProgress, saveLearningProgress } from '../state/learning-storage'

export type LearningStorageStatus = 'loading' | 'saved' | 'memory-only'

export function useLearningProgress() {
  const [snapshot, setSnapshot] = useState(emptyLearningSnapshot)
  const snapshotRef = useRef(snapshot)
  const [ready, setReady] = useState(false)
  const readyRef = useRef(false)
  const [storageStatus, setStorageStatus] = useState<LearningStorageStatus>('loading')
  const persistentRef = useRef(false)
  const mountedRef = useRef(false)
  const pendingWritesRef = useRef(0)
  const writesRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let active = true
    mountedRef.current = true
    loadLearningProgress().then(stored => {
      if (!active) return
      const current = stored ?? emptyLearningSnapshot()
      snapshotRef.current = current
      setSnapshot(current)
      persistentRef.current = true
      readyRef.current = true
      setReady(true)
      setStorageStatus('saved')
    }).catch(() => {
      if (!active) return
      // Keep existing on-disk data untouched when it cannot be loaded safely.
      persistentRef.current = false
      readyRef.current = true
      setReady(true)
      setStorageStatus('memory-only')
    })
    return () => { active = false; mountedRef.current = false; readyRef.current = false }
  }, [])

  const update = useCallback((operation: (current: LearningSnapshot) => LearningSnapshot, attempt?: AttemptRecord) => {
    if (!readyRef.current) return
    const current = snapshotRef.current
    const next = operation(current)
    if (next === current && !attempt) return
    // Ref updates are immediate, so consecutive operations compose before React renders.
    snapshotRef.current = next
    setSnapshot(next)
    if (!persistentRef.current) return

    pendingWritesRef.current++
    setStorageStatus('loading')
    writesRef.current = writesRef.current.then(async () => {
      if (persistentRef.current) await saveLearningProgress(next, attempt)
    }).catch(() => {
      persistentRef.current = false
      if (mountedRef.current) setStorageStatus('memory-only')
    }).then(() => {
      pendingWritesRef.current--
      if (mountedRef.current && persistentRef.current && pendingWritesRef.current === 0) setStorageStatus('saved')
    })
  }, [])

  return { snapshot, ready, storageStatus, update }
}
