// Read-only source inventory; it never adds an association to the runtime library.
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { parseRootInventories } from '../tools/chai-pilot/run.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'data/root-usage-review.json')
const check = process.argv.slice(2)
if (check.some(arg => arg !== '--check') || check.length > 1) throw new Error('Usage: node scripts/audit-root-usage.mjs [--check]')
const bytes = await readFile(resolve(root, 'tools/libre-flypy-audit/src/roots.rs'))
const lock = JSON.parse(await readFile(resolve(root, 'data/shape-sources.lock.json'), 'utf8'))
const sha256 = createHash('sha256').update(bytes).digest('hex')
if (sha256 !== lock.files['src/roots.rs']) throw new Error('Pinned root source changed; audit refuses to accept it.')
const inventory = parseRootInventories(bytes.toString('utf8'))
const server = await createServer({ root, configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null } })
try {
  const { LEARNING_KEY_DEFINITIONS } = await server.ssrLoadModule('/src/data/library.ts')
  const records = []
  for (const position of ['first', 'last']) {
    for (const [sourceRoot, key] of inventory[position]) {
      const uses = LEARNING_KEY_DEFINITIONS.flatMap(definition => definition.shapeRoots
        .filter(item => item.root === sourceRoot)
        .flatMap(item => (item.usages ?? []).filter(usage => usage.position === position).map(usage => ({ key: definition.key, usage }))))
      const match = uses.find(item => item.key === key.toUpperCase())
      records.push({
        root: sourceRoot, key: key.toUpperCase(), position, sourceId: 'libre-flypy-root-map-1.2.0',
        verificationStatus: match ? 'verified-entry-usage' : uses.length ? 'source-key-disagrees-with-verified-usage' : 'candidate-no-verified-usage',
        exampleCharacters: match?.usage.exampleCharacters ?? [],
        usageSourceIds: match?.usage.sourceIds ?? [],
      })
    }
  }
  const counts = Object.fromEntries(['verified-entry-usage', 'source-key-disagrees-with-verified-usage', 'candidate-no-verified-usage'].map(status => [status, records.filter(record => record.verificationStatus === status).length]))
  const artifact = {
    schemaVersion: 1, reviewedAt: '2026-10-28',
    scope: 'licensed-source-inventory-compared-with-current-verified-entry-positions', complete: false,
    source: { path: 'tools/libre-flypy-audit/src/roots.rs', sha256, license: 'AGPL-3.0-only' },
    boundary: 'A verified entry use supports only its observed position. Candidates and disagreements are not promoted to learning mappings; no claim of full official-map review.',
    counts: { first: inventory.first.size, last: inventory.last.size, ...counts }, records,
  }
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`
  if (check.length) {
    if (await readFile(output, 'utf8') !== serialized) throw new Error('Root review is stale; run node scripts/audit-root-usage.mjs')
  } else await writeFile(output, serialized)
  console.log(JSON.stringify({ check: Boolean(check.length), ...artifact.counts }))
} finally {
  await server.close()
}
