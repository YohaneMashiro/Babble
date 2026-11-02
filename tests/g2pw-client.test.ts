import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { G2PWWorkerResponse } from '../src/lib/g2pw-types'

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent<G2PWWorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  sent: Array<{ type: string; requestId?: number; text?: string; retry?: boolean }> = []
  terminated = false
  constructor() { FakeWorker.instances.push(this) }
  postMessage(value: FakeWorker['sent'][number]) { this.sent.push(value) }
  terminate() { this.terminated = true }
  emit(data: G2PWWorkerResponse) { this.onmessage?.({ data } as MessageEvent<G2PWWorkerResponse>) }
}

beforeEach(() => {
  vi.resetModules()
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('document', { baseURI: 'https://babble.test/app/' })
})
afterEach(() => vi.unstubAllGlobals())

const loadClient = () => import('../src/lib/contextual-pinyin')
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
const resultFor = (text: string) => ({ text, modelVersion: 'test-model', items: Array.from(text, (char, index) => ({ char, index, pinyin: char === '行' ? 'xing2' : null, source: 'model' as const })) })

describe('g2pW browser client lifecycle', () => {
  it('does no work on import and shares one explicit load across subscribers and requests', async () => {
    const client = await loadClient()
    expect(client.getContextualPinyinStatus()).toEqual({ phase: 'idle' })
    expect(FakeWorker.instances).toHaveLength(0)
    const listener = vi.fn()
    const unsubscribe = client.subscribeContextualPinyin(listener)
    const loading = client.loadContextualPinyin()
    expect(client.loadContextualPinyin()).toBe(loading)
    const worker = FakeWorker.instances[0]
    expect(worker.sent).toEqual([expect.objectContaining({ type: 'load', retry: false })])
    worker.emit({ type: 'status', status: { phase: 'loading', stage: 'downloading', loadedBytes: 12, totalBytes: 30 } })
    expect(client.getContextualPinyinStatus().loadedBytes).toBe(12)
    worker.emit({ type: 'loaded', modelVersion: 'test-model' })
    await loading
    await client.loadContextualPinyin()
    expect(FakeWorker.instances).toHaveLength(1)
    expect(listener).toHaveBeenCalledTimes(3)
    unsubscribe()
  })

  it('recreates a failed worker on retry and ignores late messages from the failed instance', async () => {
    const client = await loadClient()
    const first = client.loadContextualPinyin()
    const rejected = expect(first).rejects.toThrow('download failed')
    const old = FakeWorker.instances[0]
    old.emit({ type: 'error', message: 'download failed' })
    await rejected
    expect(old.terminated).toBe(true)
    expect(client.getContextualPinyinStatus().phase).toBe('error')
    const second = client.loadContextualPinyin()
    const fresh = FakeWorker.instances[1]
    expect(fresh.sent[0]).toMatchObject({ type: 'load', retry: true })
    old.emit({ type: 'loaded', modelVersion: 'stale-model' })
    expect(client.getContextualPinyinStatus().phase).toBe('loading')
    fresh.emit({ type: 'loaded', modelVersion: 'test-model' })
    await second
    expect(client.getContextualPinyinStatus().modelVersion).toBe('test-model')
  })

  it('can abandon a pending load for one edit without cancelling the shared model', async () => {
    const client = await loadClient()
    const controller = new AbortController()
    const annotation = client.annotateContextualPinyin('旧文本', { signal: controller.signal })
    const rejected = expect(annotation).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejected
    const worker = FakeWorker.instances[0]
    expect(worker.terminated).toBe(false)
    worker.emit({ type: 'loaded', modelVersion: 'test-model' })
    await flush()
    expect(client.getContextualPinyinStatus().phase).toBe('ready')
    expect(worker.sent.filter(value => value.type === 'annotate')).toHaveLength(0)
  })

  it('cancels stale text, ignores its late result, and keeps original Unicode positions on the next request', async () => {
    const client = await loadClient()
    const loading = client.loadContextualPinyin()
    const worker = FakeWorker.instances[0]
    worker.emit({ type: 'loaded', modelVersion: 'test-model' }); await loading
    const controller = new AbortController()
    const oldJob = client.annotateContextualPinyin('旧行', { signal: controller.signal })
    const rejected = expect(oldJob).rejects.toMatchObject({ name: 'AbortError' })
    await flush()
    const oldRequest = worker.sent.find(value => value.type === 'annotate')!
    controller.abort(); await rejected
    expect(worker.sent.at(-1)).toEqual({ type: 'cancel', requestId: oldRequest.requestId })
    worker.emit({ type: 'result', requestId: oldRequest.requestId!, result: resultFor('旧行') })
    const text = '🙂行\nA'
    const fresh = client.annotateContextualPinyin(text)
    await flush()
    const request = worker.sent.at(-1)!
    worker.emit({ type: 'result', requestId: request.requestId!, result: resultFor(text) })
    expect((await fresh).items.map(item => item.char)).toEqual(['🙂', '行', '\n', 'A'])
  })

  it('rejects malformed or mismatched results without losing the loaded session', async () => {
    const client = await loadClient()
    const loading = client.loadContextualPinyin()
    const worker = FakeWorker.instances[0]
    worker.emit({ type: 'loaded', modelVersion: 'test-model' }); await loading
    const annotation = client.annotateContextualPinyin('行')
    const rejected = expect(annotation).rejects.toThrow('字位不一致')
    await flush()
    worker.emit({ type: 'result', requestId: worker.sent.at(-1)!.requestId!, result: resultFor('走') })
    await rejected
    expect(client.getContextualPinyinStatus().phase).toBe('ready')
    expect(worker.terminated).toBe(false)
  })

  it('rejects active work when the worker crashes and permits a fresh model retry', async () => {
    const client = await loadClient()
    const loading = client.loadContextualPinyin()
    const worker = FakeWorker.instances[0]
    worker.emit({ type: 'loaded', modelVersion: 'test-model' }); await loading
    const annotation = client.annotateContextualPinyin('行')
    const rejected = expect(annotation).rejects.toThrow('运行中断')
    await flush()
    worker.onerror?.({ preventDefault() {} } as ErrorEvent)
    await rejected
    expect(worker.terminated).toBe(true)
    const retry = client.loadContextualPinyin()
    FakeWorker.instances[1].emit({ type: 'loaded', modelVersion: 'retry-model' })
    await retry
    expect(client.getContextualPinyinStatus()).toMatchObject({ phase: 'ready', modelVersion: 'retry-model' })
  })

  it('rejects oversized or already-aborted text before creating a worker', async () => {
    const client = await loadClient()
    await expect(client.annotateContextualPinyin('行'.repeat(20_001))).rejects.toThrow('20,000')
    await expect(client.annotateContextualPinyin('行', { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' })
    expect(FakeWorker.instances).toHaveLength(0)
  })
})
