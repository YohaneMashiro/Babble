import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// Offline validation. --source-only checks the source package without model binaries.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = resolve(root, 'public/models/g2pw')
const sourceOnly = process.argv.includes('--source-only')
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex')
const json = async (path) => JSON.parse(await readFile(path, 'utf8'))
const within = (base, file) => {
  assert.equal(typeof file, 'string')
  const path = resolve(base, file)
  assert.ok(path.startsWith(`${base}${sep}`), `Unsafe resource path: ${file}`)
  return path
}
const resource = async (base, descriptor, combined) => {
  const path = within(base, descriptor.file ?? descriptor.path)
  assert.equal((await stat(path)).size, descriptor.bytes, `Wrong byte length: ${path}`)
  const hash = createHash('sha256')
  for await (const block of createReadStream(path)) {
    hash.update(block)
    combined?.update(block)
  }
  assert.equal(hash.digest('hex'), descriptor.sha256, `Wrong SHA-256: ${path}`)
}

try {
  const lock = await json(resolve(root, 'data/g2pw-model.lock.json'))
  const manifest = await json(resolve(publicDir, 'manifest.json'))
  assert.deepEqual(manifest, lock.deployment, 'Manifest differs from reviewed source lock')
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.provider, 'g2pw')
  assert.equal(manifest.version, lock.version)
  assert.equal(manifest.model.shards.reduce((sum, part) => sum + part.bytes, 0), manifest.model.bytes)
  await resource(publicDir, manifest.metadata)
  const metadata = await json(within(publicDir, manifest.metadata.file))
  assert.equal(metadata.version, manifest.version)
  assert.equal(metadata.labels.length, 1305)
  assert.equal(metadata.vocab.length, 21128, 'BERT vocabulary lines were split incorrectly')
  assert.equal(metadata.vocab.indexOf('我'), 2769, 'BERT token IDs shifted')
  assert.equal(metadata.chars.length, Object.keys(metadata.char2phonemes).length)
  assert.deepEqual(metadata.chars, Object.keys(metadata.char2phonemes).sort())
  assert.equal(metadata.config.windowSize, 32)
  assert.equal(metadata.config.useMask, true)
  assert.deepEqual(metadata.inputTypes, { input_ids: 'int64', token_type_ids: 'int64', attention_mask: 'int64',
    phoneme_mask: 'float32', char_ids: 'int64', position_ids: 'int64' })
  assert.equal(metadata.outputName, 'probs')
  for (const ids of Object.values(metadata.char2phonemes)) {
    assert.ok(ids.length > 0 && ids.every((id) => Number.isInteger(id) && id >= 0 && id < metadata.labels.length))
  }
  for (const [from, to] of Object.entries(metadata.simplifiedToTraditional)) {
    assert.equal(Array.from(from).length, 1)
    assert.equal(Array.from(to).length, 1)
  }
  const originalLicense = lock.upstream.files.find((item) => item.path === 'LICENCE')
  assert.equal(sha(await readFile(resolve(publicDir, 'LICENSE.txt'))), originalLicense.sha256)
  assert.equal(sha(await readFile(resolve(root, 'tools/g2pw/Apache-2.0.txt'))), originalLicense.sha256)
  assert.match(await readFile(resolve(publicDir, 'NOTICE.txt'), 'utf8'), /Modified by Babble/)
  await resource(publicDir, manifest.runtime.license)
  await resource(publicDir, manifest.runtime.notices)
  for (const program of lock.programs) {
    assert.equal(sha(await readFile(within(root, program.path))), program.sha256, `Changed program: ${program.path}`)
  }
  await resource(root, lock.defaultAnnotation)
  const annotation = await json(within(root, lock.defaultAnnotation.path))
  const sourceBytes = await readFile(resolve(root, 'the_Tower_of_Babel.txt'))
  const chars = Array.from(sourceBytes.toString('utf8'))
  assert.equal(annotation.sourceSha256, sha(sourceBytes))
  assert.equal(annotation.modelSha256, manifest.model.sha256)
  assert.equal(annotation.modelVersion, manifest.version)
  assert.equal(annotation.codepoints, chars.length)
  assert.equal(annotation.readings.length, chars.length)
  assert.equal(annotation.confidences.length, chars.length)
  assert.equal(lock.defaultAnnotation.codepoints, chars.length)
  const expectedIndices = chars.flatMap((char, index) =>
    metadata.char2phonemes[metadata.simplifiedToTraditional[char] ?? char] ? [index] : [])
  assert.deepEqual(annotation.modelIndices, expectedIndices, 'Neural positions shifted from original Unicode source')
  const modelIndices = new Set(expectedIndices)
  const toPinyin = (phoneme) => {
    if (!phoneme) return null
    const base = metadata.bopomofoToPinyin[phoneme.slice(0, -1)]
    return base ? `${base}${phoneme.slice(-1)}` : null
  }
  annotation.readings.forEach((reading, index) => {
    assert.ok(reading === null || /^[a-zü]+[1-5]$/.test(reading), `Invalid pinyin at source index ${index}`)
    const probability = annotation.confidences[index]
    if (modelIndices.has(index)) {
      assert.ok(Number.isFinite(probability) && probability >= 0 && probability <= 1)
    } else {
      assert.equal(probability, null)
      const char = metadata.simplifiedToTraditional[chars[index]] ?? chars[index]
      const phone = metadata.monophonic[char] ?? metadata.charBopomofo[char]?.[0]
      assert.equal(reading, toPinyin(phone), `Dictionary result shifted at source index ${index}`)
    }
  })
  assert.equal(modelIndices.size, lock.defaultAnnotation.modelOccurrences)
  assert.equal(annotation.readings.filter(Boolean).length, lock.defaultAnnotation.annotatedOccurrences)
  if (!sourceOnly) {
    const combined = createHash('sha256')
    for (const part of manifest.model.shards) await resource(publicDir, part, combined)
    assert.equal(combined.digest('hex'), manifest.model.sha256, 'Assembled ONNX hash differs')
    await resource(publicDir, manifest.runtime.mjs)
    await resource(publicDir, manifest.runtime.wasm)
  }
  console.log(JSON.stringify({ check: 'g2pw', mode: sourceOnly ? 'source-only' : 'complete',
    modelBytes: manifest.model.bytes, shards: manifest.model.shards.length, sourceCodepoints: chars.length,
    annotatedOccurrences: lock.defaultAnnotation.annotatedOccurrences, modelOccurrences: modelIndices.size, result: 'passed' }))
} catch (error) {
  console.error('g2pW offline verification failed:', error.message)
  console.error('Rebuild missing resources with the fixed instructions in docs/g2pw-model-build.md.')
  process.exitCode = 1
}
