import type { ContextualPinyinResult, ContextualPinyinStatus, G2PWWorkerResponse } from './g2pw-types'
export type { ContextualPinyinItem, ContextualPinyinResult, ContextualPinyinStatus } from './g2pw-types'

let status: ContextualPinyinStatus = { phase: 'idle' }
const listeners = new Set<() => void>()
let worker: Worker | null = null
let loading: Promise<void> | null = null
let rejectLoading: ((error: Error) => void) | null = null
let nextRequest = 0
let loadAttempts = 0
const jobs = new Map<number, { resolve: (result: ContextualPinyinResult) => void; reject: (error: Error) => void; cleanup: () => void; text: string }>()

export function getContextualPinyinStatus(): ContextualPinyinStatus { return status }
export function subscribeContextualPinyin(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener) } }

function publish(next: ContextualPinyinStatus) {
  status = next
  for (const listener of listeners) listener()
}

function abortError(): Error { return new DOMException('已取消本次注音。', 'AbortError') }
function errorMessage(value: unknown): string { return value instanceof Error ? value.message : '本地注音暂时无法运行，请重试。' }

function destroy(error: Error) {
  worker?.terminate(); worker = null
  rejectLoading?.(error); rejectLoading = null; loading = null
  for (const job of jobs.values()) { job.cleanup(); job.reject(error) }
  jobs.clear()
  publish({ phase: 'error', error: error.message })
}

/** Importing this module performs no fetch, Worker creation, or runtime import. */
export function loadContextualPinyin(): Promise<void> {
  if (worker && status.phase === 'ready') return Promise.resolve()
  if (loading) return loading
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
    const error = new Error('当前浏览器不支持本地模型注音，仍可手动选择读音。')
    publish({ phase: 'error', error: error.message }); return Promise.reject(error)
  }
  publish({ phase: 'loading', stage: 'starting', loadedBytes: 0 })
  const retry = loadAttempts++ > 0
  const promise = new Promise<void>((resolve, reject) => {
    rejectLoading = reject
    try {
      const created = new Worker(new URL('../workers/g2pw.worker.ts', import.meta.url), { type: 'module', name: 'babble-g2pw' })
      worker = created
      created.onmessage = (event: MessageEvent<G2PWWorkerResponse>) => {
        if (worker !== created) return
        const message = event.data
        if (message.type === 'status') publish(message.status)
        else if (message.type === 'loaded') {
          rejectLoading = null
          publish({ phase: 'ready', stage: 'ready', modelVersion: message.modelVersion })
          resolve()
        } else if (message.type === 'result') {
          const job = jobs.get(message.requestId)
          if (!job) return
          jobs.delete(message.requestId); job.cleanup()
          const original = Array.from(job.text)
          if (message.result.text !== job.text || message.result.items.length !== original.length || message.result.items.some((item, index) => item.index !== index || item.char !== original[index])) {
            job.reject(new Error('注音结果与原文字位不一致，已保留手动选择。')); return
          }
          job.resolve(message.result)
        } else if (message.type === 'error') {
          const error = new Error(message.message)
          if (message.requestId === undefined) destroy(error)
          else {
            const job = jobs.get(message.requestId)
            if (job) { jobs.delete(message.requestId); job.cleanup(); job.reject(error) }
          }
        }
      }
      created.onerror = event => { event.preventDefault(); if (worker === created) destroy(new Error('本地注音模型运行中断，请重试；原文和手动选读仍保留。')) }
      created.onmessageerror = () => { if (worker === created) destroy(new Error('本地注音消息无法读取，请重试。')) }
      const baseUrl = new URL(import.meta.env.BASE_URL, document.baseURI).href
      created.postMessage({ type: 'load', baseUrl, retry })
    } catch (error) { destroy(new Error(errorMessage(error))) }
  })
  loading = promise
  void promise.finally(() => { if (loading === promise) loading = null }).catch(() => { /* Callers receive the original rejection. */ })
  return promise
}

async function waitForModel(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError()
  const promise = loadContextualPinyin()
  if (!signal) { await promise; return }
  await new Promise<void>((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(abortError()) }
    signal.addEventListener('abort', abort, { once: true })
    void promise.then(() => { signal.removeEventListener('abort', abort); resolve() }, error => { signal.removeEventListener('abort', abort); reject(error) })
  })
}

/** Plain text is kept only until this request finishes; it is never persisted. */
export async function annotateContextualPinyin(text: string, { signal }: { signal?: AbortSignal } = {}): Promise<ContextualPinyinResult> {
  if (typeof text !== 'string' || Array.from(text).length > 20_000) throw new Error('注音文本不能超过 20,000 字符。')
  await waitForModel(signal)
  if (signal?.aborted) throw abortError()
  const active = worker
  if (!active) throw new Error('本地注音模型尚未就绪。')
  const requestId = ++nextRequest
  return new Promise<ContextualPinyinResult>((resolve, reject) => {
    const abort = () => {
      const job = jobs.get(requestId)
      if (!job) return
      jobs.delete(requestId); job.cleanup()
      active.postMessage({ type: 'cancel', requestId }); reject(abortError())
    }
    jobs.set(requestId, { resolve, reject, text, cleanup: () => signal?.removeEventListener('abort', abort) })
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) { abort(); return }
    try { active.postMessage({ type: 'annotate', requestId, text }) }
    catch (error) { jobs.delete(requestId); signal?.removeEventListener('abort', abort); reject(new Error(errorMessage(error))) }
  })
}
