// Audits the actual runtime library locally. No HTTP server or text upload.
import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
if (args.length > 1 || args[0] === '--help') {
  console.log('Usage: node scripts/audit-coverage.mjs [text-file]\nDefaults to the_Tower_of_Babel.txt. Outputs coverage JSON without the original text.')
  process.exitCode = args.length > 1 ? 1 : 0
} else {
  const input = args[0] ? resolve(args[0]) : resolve(root, 'the_Tower_of_Babel.txt')
  let server
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(input))
    server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, hmr: false, watch: null },
    })
    const [{ CHARACTER_INDEX, LIBRARY_STATS, TRAINING_ENTRIES }, { analyzeText, needsTextChoice }, { default: readingsData }] = await Promise.all([
      server.ssrLoadModule('/src/data/library.ts'),
      server.ssrLoadModule('/src/domain/text.ts'),
      server.ssrLoadModule('/src/data/generated/readings.json'),
    ])
    const analysis = analyzeText(text, CHARACTER_INDEX.lookup)
    if (analysis.status !== 'valid') throw new Error(`Text exceeds the ${analysis.limit.toLocaleString('en-US')}-character application limit.`)
    const document = analysis.document
    const han = document.tokens.filter(token => token.kind !== 'literal')
    const occurrences = new Map()
    for (const token of han) occurrences.set(token.value, (occurrences.get(token.value) ?? 0) + 1)
    const byStatus = new Map()
    for (const [char, count] of occurrences) {
      const status = CHARACTER_INDEX.lookup(char).status
      const previous = byStatus.get(status) ?? { occurrences: 0, uniqueCharacters: 0 }
      previous.occurrences += count
      previous.uniqueCharacters++
      byStatus.set(status, previous)
    }
    const sourceEntries = new Map()
    const sourceCharacters = new Map()
    for (const entry of TRAINING_ENTRIES) {
      const source = entry.provenance.id ?? entry.provenance.source
      sourceEntries.set(source, (sourceEntries.get(source) ?? 0) + 1)
      if (!sourceCharacters.has(source)) sourceCharacters.set(source, new Set())
      sourceCharacters.get(source).add(entry.char)
    }
    const frequencyEntries = Object.entries(readingsData.characters).filter(([, record]) => record.frequency !== undefined)
    const trainableFrequencyEntries = frequencyEntries.filter(([char]) => CHARACTER_INDEX.lookup(char).status === 'trainable')
    const ratio = (part, total) => total ? Number((part / total).toFixed(6)) : null
    const trainableUnique = byStatus.get('trainable')?.uniqueCharacters ?? 0
    const sortedObject = map => Object.fromEntries([...map].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
    const result = {
      inputFile: basename(input),
      library: LIBRARY_STATS,
      text: {
        characters: document.counts.characters,
        hanOccurrences: document.counts.han,
        uniqueHan: occurrences.size,
        trainableOccurrences: document.counts.trainable,
        trainableUniqueHan: trainableUnique,
        unavailableOccurrences: document.counts.unavailable,
        unavailableUniqueHan: occurrences.size - trainableUnique,
        occurrenceCoverage: ratio(document.counts.trainable, document.counts.han),
        uniqueCharacterCoverage: ratio(trainableUnique, occurrences.size),
        requiresReadingChoiceOccurrences: han.filter(needsTextChoice).length,
        pages: document.pages.length,
        byLookupStatus: sortedObject(byStatus),
        topMissingCharacters: [...occurrences]
          .filter(([char]) => CHARACTER_INDEX.lookup(char).status !== 'trainable')
          .sort(([a, aCount], [b, bCount]) => bCount - aCount || a.codePointAt(0) - b.codePointAt(0))
          .slice(0, 40)
          .map(([char, count]) => ({ char, occurrences: count, status: CHARACTER_INDEX.lookup(char).status })),
      },
      provenance: {
        entriesByPrimarySource: sortedObject(sourceEntries),
        uniqueCharactersByPrimarySource: sortedObject(new Map([...sourceCharacters].map(([source, chars]) => [source, chars.size]))),
      },
      frequency: {
        sourceCharacters: frequencyEntries.length,
        trainableCharacters: trainableFrequencyEntries.length,
        characterCoverage: ratio(trainableFrequencyEntries.length, frequencyEntries.length),
        sourceCounts: frequencyEntries.reduce((sum, [, record]) => sum + record.frequency, 0),
        trainableCounts: trainableFrequencyEntries.reduce((sum, [, record]) => sum + record.frequency, 0),
        note: readingsData.metadata.frequencyCorpus,
      },
    }
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(`Coverage audit failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  } finally {
    await server?.close()
  }
}
