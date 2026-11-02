// Original research snapshot verifier: MIT. No generation, download or reference read.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = dirname(fileURLToPath(import.meta.url))
const lock = JSON.parse(await readFile(resolve(base, 'programs.lock.json'), 'utf8'))
const seen = new Set()
for (const entry of lock.programs) {
  const path = resolve(base, entry.path), rel = relative(base, path)
  if (isAbsolute(rel) || rel.startsWith('..') || !rel.startsWith('programs/') || seen.has(rel)) throw new Error('Invalid research snapshot path')
  seen.add(rel)
  const bytes = await readFile(path)
  if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`Changed research snapshot: ${rel}`)
}
console.log(`Verified ${seen.size} fixed research program snapshots; no production or reference access.`)
