import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import expansionLock from '../data/shape-expansion.lock.json'
import inputLock from '../data/shape-expansion-inputs.lock.json'
import { CHARACTER_INDEX } from '../src/data/library'
import { DEFAULT_PRACTICE_TEXT } from '../src/data/practice-text'
import { analyzeText } from '../src/domain/text'

describe('expanded dictionary coverage and source integrity', () => {
  it('keeps the user article intact and materially improves full-code coverage', () => {
    const result = analyzeText(DEFAULT_PRACTICE_TEXT.text, CHARACTER_INDEX.lookup)
    expect(result.status).toBe('valid')
    if (result.status !== 'valid') return
    expect(result.document.counts.characters).toBe(2197)
    expect(result.document.counts.han).toBe(1840)
    expect(result.document.counts.trainable).toBe(1815)
    expect(result.document.counts.unavailable).toBe(25)
    expect(result.document.counts.trainable / result.document.counts.han).toBeGreaterThan(0.95)
    expect(result.document.pages).toHaveLength(5)
    expect(result.document.tokens[result.document.targets[0]].value).toBe('花')
    expect(result.document.tokens.map(token => token.value).join('')).toBe(DEFAULT_PRACTICE_TEXT.text)
  })

  it('distributes precisely the tool, inputs and output recorded in the audit locks', () => {
    const bytes = path => readFileSync(new URL(`../${path}`, import.meta.url))
    const digest = path => createHash('sha256').update(bytes(path)).digest('hex')
    for (const source of inputLock.sources) {
      for (const file of source.files) {
        expect(digest(file.path), file.path).toBe(file.sha256)
        expect(bytes(file.path).byteLength, file.path).toBe(file.bytes)
      }
    }
    for (const [path, checksum] of Object.entries(expansionLock.files)) expect(digest(path), path).toBe(checksum)
    expect(digest(expansionLock.generator.path)).toBe(expansionLock.generator.sha256)
    expect(digest(expansionLock.generated.path)).toBe(expansionLock.generated.sha256)
  })

  it('rejects changed pinned inputs even when rebuilding a derived-output lock', () => {
    const script = `
import importlib.util
from pathlib import Path
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('shape_generator', 'tools/shape-expansion/generate.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
digest = module.digest
for target in [module.INPUTS / 'chaizi-jt.txt', module.LEGACY / 'my_ids.txt', module.ROOT / 'src/data/generated/readings.json']:
    def changed(path):
        return '0' * 64 if path == target else digest(path)
    with patch.object(module, 'digest', side_effect=changed):
        try:
            module.inputs_to_hash()
        except ValueError:
            continue
        raise AssertionError('Changed pinned input was accepted: ' + str(target))
`
    expect(() => execFileSync('python3', ['-B', '-c', script], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'pipe' })).not.toThrow()
  })
})
