// Babble original program: MIT. Offline checks never fetch fonts or source ZIPs.
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const lock = JSON.parse(await readFile(resolve(root, 'data/glyph-font.lock.json'), 'utf8'))
for (const record of [...lock.inputs, ...lock.generated]) {
  const bytes = await readFile(resolve(root, record.path))
  if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) throw new Error(`Glyph input/output changed: ${record.path}`)
  if (record.path.endsWith('.woff2') && (bytes.toString('ascii', 0, 4) !== 'wOF2' || bytes.readUInt32BE(8) !== bytes.length)) throw new Error(`Invalid WOFF2 envelope: ${record.path}`)
}
const manifest = JSON.parse(await readFile(resolve(root, 'src/assets/glyph-font/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 1 || manifest.policyId !== lock.policyId || manifest.family !== 'Babble Glyphs') throw new Error('Glyph manifest schema or policy changed')
const ids = new Set(), characters = new Set()
let fontBytes = 0
for (const shard of manifest.shards) {
  if (!/^[0-9a-f]{3}$/.test(shard.id) || ids.has(shard.id) || shard.file !== `glyph-${shard.id}.woff2`) throw new Error('Duplicate or invalid glyph shard')
  ids.add(shard.id)
  const output = lock.generated.find(record => record.path === `src/assets/glyph-font/${shard.file}`)
  if (!output || output.bytes !== shard.bytes || output.sha256 !== shard.sha256) throw new Error('Glyph shard is not in the generated lock')
  let count = 0
  for (const [start, end] of shard.ranges) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || (start >>> 10).toString(16).padStart(3, '0') !== shard.id || (end >>> 10).toString(16).padStart(3, '0') !== shard.id) throw new Error('Invalid glyph range')
    for (let point = start; point <= end; point++) {
      if (characters.has(point)) throw new Error('Duplicate glyph codepoint')
      characters.add(point); count++
    }
  }
  if (count !== shard.characters || count > 1024 || count === 0) throw new Error('Glyph shard character count changed')
  fontBytes += shard.bytes
}
const files = (await readdir(resolve(root, 'src/assets/glyph-font'))).filter(name => name.endsWith('.woff2')).sort()
if (JSON.stringify(files) !== JSON.stringify(manifest.shards.map(shard => shard.file).sort())) throw new Error('Unexpected or missing generated glyph file')
if (characters.size !== manifest.characters || characters.size !== lock.totals.characters || ids.size !== lock.totals.shards || fontBytes !== lock.totals.fontBytes) throw new Error('Glyph totals changed')
console.log(`Verified ${ids.size} CC0 glyph shards, ${characters.size} codepoints, ${fontBytes} font bytes; zero network requests.`)
