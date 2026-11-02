import type { InferenceSession, Tensor } from 'onnxruntime-web'
import { G2PWTokenizer, g2pwPinyin, prepareG2PWInput } from '../lib/g2pw-preprocess'
import type { ContextualPinyinItem, G2PWManifest, G2PWMetadata, G2PWResource, G2PWWorkerCommand, G2PWWorkerResponse } from '../lib/g2pw-types'

const post = (message: G2PWWorkerResponse) => globalThis.postMessage(message)
let model: { session: InferenceSession; metadata: G2PWMetadata; tokenizer: G2PWTokenizer; version: string; ort: typeof import('onnxruntime-web/wasm') } | null = null
let loading: Promise<void> | null = null
let queue = Promise.resolve()
const cancelled = new Set<number>()
const pending = new Set<number>()
const hashPattern = /^[a-f0-9]{64}$/
const message = (error: unknown) => error instanceof Error ? error.message : '本地注音暂时无法运行，请重试。'

function resourceValid(value: G2PWResource, maximum: number): boolean {
  return !!value && typeof value.file === 'string' && /^[a-zA-Z0-9_./-]+$/.test(value.file) && !value.file.split('/').includes('..')
    && Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes <= maximum && hashPattern.test(value.sha256)
}

function resourceUrl(resource: G2PWResource, base: URL): string {
  const url = new URL(resource.file, base)
  if (url.origin !== globalThis.location.origin || !url.pathname.startsWith(base.pathname)) throw new Error('注音模型仅从当前网站加载。')
  return url.href
}

async function readResource(resource: G2PWResource, base: URL, retry: boolean, progress?: (bytes: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(resourceUrl(resource, base), { credentials: 'same-origin', redirect: 'error', cache: retry ? 'reload' : 'force-cache' })
  if (!response.ok) throw new Error('注音资料下载失败，请重试。')
  const bytes = new Uint8Array(resource.bytes)
  let received = 0
  if (response.body) {
    const reader = response.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (received + value.length > bytes.length) throw new Error('注音资料长度与清单不一致。')
        bytes.set(value, received); received += value.length; progress?.(value.length)
      }
    } finally { reader.releaseLock() }
  } else {
    const value = new Uint8Array(await response.arrayBuffer())
    if (value.length !== bytes.length) throw new Error('注音资料长度与清单不一致。')
    bytes.set(value); received = value.length; progress?.(value.length)
  }
  if (received !== resource.bytes) throw new Error('注音资料没有完整下载，请重试。')
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join('')
  if (digest !== resource.sha256) throw new Error('注音资料校验未通过，请重试。')
  return bytes
}

function validateMetadata(metadata: G2PWMetadata) {
  if (!metadata || !Array.isArray(metadata.vocab) || metadata.vocab.length > 100_000 || !metadata.vocab.every(token => typeof token === 'string')
    || !Array.isArray(metadata.labels) || metadata.labels.length < 1 || metadata.labels.length > 20_000
    || !Array.isArray(metadata.chars) || !metadata.chars.length || metadata.chars.some(char => typeof char !== 'string' || Array.from(char).length !== 1)
    || !metadata.config || !Number.isInteger(metadata.config.maxLength) || metadata.config.maxLength < 4 || metadata.config.maxLength > 512
    || metadata.config.windowSize !== null && (!Number.isInteger(metadata.config.windowSize) || metadata.config.windowSize < 2 || metadata.config.windowSize > 512)
    || !metadata.char2phonemes || !metadata.monophonic || !metadata.charBopomofo || !metadata.bopomofoToPinyin || !metadata.simplifiedToTraditional) throw new Error('注音配置格式不受支持。')
  for (const char of metadata.chars) {
    const labels = metadata.char2phonemes[char]
    if (!Array.isArray(labels) || !labels.length || labels.some(index => !Number.isInteger(index) || index < 0 || index >= metadata.labels.length)) throw new Error('注音候选字表不完整。')
  }
  if (Object.values(metadata.simplifiedToTraditional).some(char => typeof char !== 'string' || Array.from(char).length !== 1)) throw new Error('注音字形转换无法保持原文位置。')
}

async function load(baseUrl: string, retry: boolean) {
  if (model) { post({ type: 'loaded', modelVersion: model.version }); return }
  const base = new URL('models/g2pw/', baseUrl)
  if (base.origin !== globalThis.location.origin) throw new Error('注音模型仅从当前网站加载。')
  post({ type: 'status', status: { phase: 'loading', stage: 'manifest', loadedBytes: 0 } })
  const manifestResponse = await fetch(new URL('manifest.json', base), { cache: retry ? 'reload' : 'no-cache', credentials: 'same-origin', redirect: 'error' })
  if (!manifestResponse.ok) throw new Error('本站注音模型尚未准备好，请稍后重试。')
  const manifestText = await manifestResponse.text()
  if (manifestText.length > 100_000) throw new Error('注音清单格式不受支持。')
  const manifest = JSON.parse(manifestText) as G2PWManifest
  if (manifest.schemaVersion !== 1 || manifest.provider !== 'g2pw' || typeof manifest.version !== 'string' || !manifest.version
    || !resourceValid(manifest.metadata, 10 * 1024 * 1024) || !manifest.model || !Number.isSafeInteger(manifest.model.bytes) || manifest.model.bytes < 1 || manifest.model.bytes > 1024 * 1024 * 1024 || !hashPattern.test(manifest.model.sha256)
    || !Array.isArray(manifest.model.shards) || !manifest.model.shards.length || manifest.model.shards.some(resource => !resourceValid(resource, 20 * 1024 * 1024))
    || manifest.model.shards.reduce((total, resource) => total + resource.bytes, 0) !== manifest.model.bytes
    || !manifest.runtime || manifest.runtime.version !== '1.31.1' || !resourceValid(manifest.runtime.mjs, 2 * 1024 * 1024) || !resourceValid(manifest.runtime.wasm, 50 * 1024 * 1024)) throw new Error('注音模型清单不受支持。')
  const totalBytes = manifest.metadata.bytes + manifest.model.bytes + manifest.runtime.mjs.bytes + manifest.runtime.wasm.bytes
  let loadedBytes = 0
  const progress = (bytes: number) => { loadedBytes += bytes; post({ type: 'status', status: { phase: 'loading', stage: 'downloading', loadedBytes, totalBytes, modelVersion: manifest.version } }) }
  const metadataBytes = await readResource(manifest.metadata, base, retry, progress)
  const metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(metadataBytes)) as G2PWMetadata
  validateMetadata(metadata)
  const tokenizer = new G2PWTokenizer(metadata)
  const modelBytes = new Uint8Array(manifest.model.bytes)
  let offset = 0
  for (const shard of manifest.model.shards) {
    const bytes = await readResource(shard, base, retry, progress)
    modelBytes.set(bytes, offset); offset += bytes.length
  }
  // Each bounded shard was independently hashed. Avoid another whole-model
  // WebCrypto copy: the aggregate byte count is already checked above.
  await readResource(manifest.runtime.mjs, base, retry, progress)
  const wasmBytes = await readResource(manifest.runtime.wasm, base, retry, progress)
  post({ type: 'status', status: { phase: 'loading', stage: 'initializing', loadedBytes, totalBytes, modelVersion: manifest.version } })
  const ort = await import('onnxruntime-web/wasm')
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  ort.env.wasm.initTimeout = 120_000
  ort.env.wasm.wasmBinary = wasmBytes
  ort.env.wasm.wasmPaths = { mjs: resourceUrl(manifest.runtime.mjs, base) }
  const session = await ort.InferenceSession.create(modelBytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all', executionMode: 'sequential' })
  model = { session, metadata, tokenizer, version: manifest.version, ort }
  post({ type: 'loaded', modelVersion: manifest.version })
}

function tensorInteger(type: string | undefined, values: readonly number[], dimensions: readonly number[]): Tensor {
  if (!model) throw new Error('本地注音模型尚未就绪。')
  return type === 'int32' ? new model.ort.Tensor('int32', Int32Array.from(values), dimensions) : new model.ort.Tensor('int64', BigInt64Array.from(values, BigInt), dimensions)
}

async function annotate(requestId: number, text: string) {
  if (!model) throw new Error('本地注音模型尚未就绪。')
  const active = model, { metadata, tokenizer } = active
  const original = Array.from(text)
  if (original.length > 20_000) throw new Error('注音文本不能超过 20,000 字符。')
  const translated = original.map(char => metadata.simplifiedToTraditional[char] ?? char)
  const queries: number[] = []
  const items: ContextualPinyinItem[] = original.map((char, index) => {
    const target = translated[index]
    if (Object.hasOwn(metadata.char2phonemes, target)) { queries.push(index); return { index, char, pinyin: null, source: 'unavailable' } }
    const pinyin = g2pwPinyin(metadata.monophonic[target] ?? metadata.charBopomofo[target]?.[0], metadata)
    return { index, char, pinyin, source: pinyin ? 'dictionary' : 'unavailable' }
  })
  const batchSize = 4
  for (let start = 0; start < queries.length; start += batchSize) {
    if (cancelled.has(requestId)) return
    const indices = queries.slice(start, start + batchSize)
    const prepared = indices.map(index => prepareG2PWInput(translated, index, metadata, tokenizer))
    const width = Math.max(...prepared.map(input => input.inputIds.length))
    const inputIds = Array<number>(indices.length * width).fill(tokenizer.id('[PAD]'))
    const tokenTypes = Array<number>(indices.length * width).fill(0)
    const attention = Array<number>(indices.length * width).fill(0)
    for (let row = 0; row < prepared.length; row++) for (let column = 0; column < prepared[row].inputIds.length; column++) {
      inputIds[row * width + column] = prepared[row].inputIds[column]
      attention[row * width + column] = 1
    }
    const feeds: Record<string, Tensor> = {
      input_ids: tensorInteger(metadata.inputTypes?.input_ids, inputIds, [indices.length, width]),
      token_type_ids: tensorInteger(metadata.inputTypes?.token_type_ids, tokenTypes, [indices.length, width]),
      attention_mask: tensorInteger(metadata.inputTypes?.attention_mask, attention, [indices.length, width]),
      phoneme_mask: new active.ort.Tensor('float32', Float32Array.from(prepared.flatMap(input => input.phonemeMask)), [indices.length, metadata.labels.length]),
      char_ids: tensorInteger(metadata.inputTypes?.char_ids, prepared.map(input => input.charId), [indices.length]),
      position_ids: tensorInteger(metadata.inputTypes?.position_ids, prepared.map(input => input.positionId), [indices.length]),
    }
    let outputs: Record<string, Tensor> | undefined
    try {
      outputs = await active.session.run(feeds)
      const output = outputs[metadata.outputName ?? active.session.outputNames[0]]
      if (!output || output.data.length !== indices.length * metadata.labels.length) throw new Error('注音模型输出维度不匹配。')
      for (let row = 0; row < indices.length; row++) {
        let winner = -1, probability = -Infinity
        for (let column = 0; column < metadata.labels.length; column++) {
          const value = Number(output.data[row * metadata.labels.length + column])
          if (!Number.isFinite(value)) throw new Error('注音模型输出了无效结果。')
          if (value > probability) { winner = column; probability = value }
        }
        if (winner < 0 || probability < 0 || probability > 1.0001 || metadata.config.useMask && !metadata.char2phonemes[translated[indices[row]]].includes(winner)) throw new Error('注音模型输出无法匹配候选字表。')
        const label = metadata.labels[winner]
        const phoneme = metadata.config.useCharPhoneme ? label.slice(label.indexOf(' ') + 1) : label
        const pinyin = g2pwPinyin(phoneme, metadata)
        items[indices[row]] = { index: indices[row], char: original[indices[row]], pinyin, source: pinyin ? 'model' : 'unavailable', probability }
      }
    } finally {
      for (const tensor of Object.values(feeds)) tensor.dispose()
      if (outputs) for (const tensor of Object.values(outputs)) tensor.dispose()
    }
    post({ type: 'status', status: { phase: 'ready', stage: 'annotating', completed: Math.min(start + indices.length, queries.length), total: queries.length, modelVersion: active.version } })
    // Let cancellation and newer requests enter the worker between batches.
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
  if (!cancelled.has(requestId)) post({ type: 'result', requestId, result: { text, modelVersion: active.version, items } })
}

globalThis.onmessage = (event: MessageEvent<G2PWWorkerCommand>) => {
  const command = event.data
  // Ignore late cancellation after a result has left the worker, rather than
  // retaining an unbounded set of completed request IDs.
  if (command.type === 'cancel') { if (pending.has(command.requestId)) cancelled.add(command.requestId); return }
  if (command.type === 'load') {
    if (!loading) loading = load(command.baseUrl, command.retry)
    void loading.catch(error => post({ type: 'error', message: message(error) }))
    return
  }
  if (command.type === 'annotate') {
    pending.add(command.requestId)
    queue = queue.then(async () => {
      try { if (!cancelled.has(command.requestId)) await annotate(command.requestId, command.text) }
      catch (error) { post({ type: 'error', requestId: command.requestId, message: message(error) }) }
      finally {
        cancelled.delete(command.requestId); pending.delete(command.requestId)
        if (model) post({ type: 'status', status: { phase: 'ready', stage: 'ready', modelVersion: model.version } })
      }
    })
  }
}
