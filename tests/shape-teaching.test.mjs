import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CHARACTER_INDEX, LEARNING_KEY_DEFINITIONS, TRAINING_ENTRIES } from '../src/data/library'
import { SHAPE_RULES, SHAPE_TEACHING_RECORDS, SHAPE_TEACHING_SOURCES, TEACHING_RULES } from '../src/data/shape-teaching'
import { reviewedShapeTeaching, shapeDisplayLabel, shapePresentation, validateShapeTeaching } from '../src/domain/shape-teaching'
import { ShapeExplanation } from '../src/components/ShapeExplanation'
import missingReview from '../data/hy-missing-review.json'
import rootReview from '../data/root-usage-review.json'
import { parseRootInventories } from '../tools/chai-pilot/run.mjs'

function entryFor(char) {
  const entry = CHARACTER_INDEX.lookup(char).entries[0]
  if (!entry) throw new Error(`Expected verified training entry: ${char}`)
  return entry
}

describe('scoped and evidenced shape teaching', () => {
  it('matches every reviewed endpoint/code to the actual trainable library', () => {
    expect(SHAPE_RULES).toHaveLength(4)
    expect(new Set(SHAPE_TEACHING_RECORDS.map(record => record.char)).size).toBe(13)
    for (const record of SHAPE_TEACHING_RECORDS) {
      expect(validateShapeTeaching(record, TEACHING_RULES, SHAPE_TEACHING_SOURCES), record.char).toEqual([])
      for (const code of record.verifiedCodes) {
        const entries = CHARACTER_INDEX.lookup(record.char).entries.filter(entry => entry.fullCode === code)
        expect(entries.length, record.char).toBeGreaterThan(0)
        for (const entry of entries) expect(reviewedShapeTeaching(entry, SHAPE_TEACHING_RECORDS)).toBe(record)
      }
    }
    expect(SHAPE_TEACHING_RECORDS.filter(record => record.scope === 'root-sequence')).toHaveLength(11)
    expect(SHAPE_TEACHING_RECORDS.filter(record => record.scope === 'endpoints').map(record => record.char)).toEqual(['鹤', '健'])
  })

  it('does not apply a reviewed explanation to an unreviewed character, code or root pair', () => {
    expect(reviewedShapeTeaching(entryFor('你'), SHAPE_TEACHING_RECORDS)).toBeUndefined()
    const entry = entryFor('某')
    expect(reviewedShapeTeaching({ ...entry, fullCode: 'MZGK' }, SHAPE_TEACHING_RECORDS)).toBeUndefined()
    expect(reviewedShapeTeaching({ ...entry, shape: { ...entry.shape, first: { ...entry.shape.first, component: '廿' } } }, SHAPE_TEACHING_RECORDS)).toBeUndefined()
    expect(validateShapeTeaching({ ...SHAPE_TEACHING_RECORDS[0], firstPartId: 'missing' }, TEACHING_RULES, SHAPE_TEACHING_SOURCES)).toContain('missing endpoint')
    expect(validateShapeTeaching({ ...SHAPE_TEACHING_RECORDS[6], scope: 'root-sequence' }, TEACHING_RULES, SHAPE_TEACHING_SOURCES)).toContain('sequence has an unexpanded region')
  })

  it('preserves distinct equal-glyph/equal-key endpoints and meaningful middle parts', () => {
    const middle = SHAPE_TEACHING_RECORDS.find(record => record.char === '语')
    expect(middle.parts.map(part => part.rawGlyph)).toEqual(['讠', '五', '口'])
    const central = SHAPE_TEACHING_RECORDS.find(record => record.char === '中')
    expect(central.firstPartId).not.toBe(central.lastPartId)
    expect(central.parts.filter(part => part.rawGlyph === '丨')).toHaveLength(2)
    const yuan = SHAPE_TEACHING_RECORDS.find(record => record.char === '元')
    expect(yuan.parts.map(part => part.rawGlyph)).toEqual(['二', '儿'])
    expect(entryFor('元').fullCode.slice(2)).toBe('EE')
    expect(shapePresentation('ㄟ')).toEqual({ label: '捺', kind: 'stroke', rawGlyph: 'ㄟ' })
    expect(shapeDisplayLabel('ㄟ')).toBe('捺（ㄟ）')
    expect(entryFor('木').shape.last.component).toBe('ㄟ')
  })

  it('renders honest scope, safe source links and no sound-code disclosure in shape cards', () => {
    for (const record of SHAPE_TEACHING_RECORDS) {
      const entry = entryFor(record.char)
      const html = renderToStaticMarkup(createElement(ShapeExplanation, { entry, focus: 'first', headingLevel: 2 }))
      expect(html).toContain(`data-teaching-scope="${record.scope}"`)
      expect(html).toContain('<h2>为什么这样取形</h2>')
      expect(html).not.toContain(entry.fullCode)
      if (record.scope === 'endpoints') {
        expect(html).toContain('is-unexpanded')
        expect(html).toContain('已核验端点与规则')
        expect(html).not.toContain('已核验取根序列')
      }
    }
    const fallback = renderToStaticMarkup(createElement(ShapeExplanation, { entry: entryFor('你') }))
    expect(fallback).toContain('完整教学分析待补')
    expect(fallback).not.toContain('shape-teaching-steps')
    expect(fallback).not.toContain('shape-teaching-parts')
    for (const source of SHAPE_TEACHING_SOURCES) expect(new URL(source.url).protocol).toBe('https:')
    const wood = renderToStaticMarkup(createElement(ShapeExplanation, { entry: entryFor('木') }))
    expect(wood).toContain('捺（ㄟ）')
    expect(wood).toContain('原始符号 ㄟ')
  })
})

describe('partial position-specific root use and missing review', () => {
  it('retains evidence for every advertised first/last usage without promoting candidates', () => {
    for (const definition of LEARNING_KEY_DEFINITIONS) {
      expect(definition.complete).toBe(false)
      for (const root of definition.shapeRoots) {
        expect(root.usages?.length).toBeGreaterThan(0)
        for (const usage of root.usages ?? []) {
          expect(usage.verificationStatus).toBe('verified-entry-usage')
          expect(usage.sourceIds.length).toBeGreaterThan(0)
          for (const char of usage.exampleCharacters) {
            expect(TRAINING_ENTRIES.some(entry => entry.char === char && entry.shape[usage.position].component === root.root && entry.shape[usage.position].key === definition.key)).toBe(true)
          }
        }
      }
    }
    const n = LEARNING_KEY_DEFINITIONS.find(definition => definition.key === 'N')
    expect(n.shapeRoots.find(root => root.root === 'ㄟ')?.label).toBe('捺')
  })

  it('independently inventories each locked source position and rejects unsupported promotion', () => {
    const bytes = readFileSync(new URL('../tools/libre-flypy-audit/src/roots.rs', import.meta.url))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(rootReview.source.sha256)
    const inventory = parseRootInventories(bytes.toString('utf8'))
    expect(rootReview.counts.first).toBe(324)
    expect(rootReview.counts.last).toBe(385)
    expect(rootReview.records).toHaveLength(709)
    expect(rootReview.complete).toBe(false)
    for (const row of rootReview.records) {
      const position = row.position
      expect(inventory[position].get(row.root)?.toUpperCase()).toBe(row.key)
      const usage = LEARNING_KEY_DEFINITIONS.find(definition => definition.key === row.key)?.shapeRoots.find(root => root.root === row.root)?.usages?.find(usage => usage.position === position)
      expect(row.verificationStatus === 'verified-entry-usage').toBe(Boolean(usage))
    }
    expect(rootReview.records.some(row => row.verificationStatus === 'candidate-no-verified-usage')).toBe(true)
  })

  it('keeps the remaining HY review complete and answer-free after independently verified code additions', () => {
    const article = readFileSync(new URL('../HY.txt', import.meta.url), 'utf8')
    expect(missingReview.records).toHaveLength(8)
    expect(missingReview.records.reduce((sum, row) => sum + row.occurrences, 0)).toBe(25)
    expect(missingReview.records.filter(row => row.gap === 'endpoint-derivation')).toHaveLength(7)
    expect(missingReview.records.filter(row => row.gap === 'named-component')).toHaveLength(1)
    for (const row of missingReview.records) {
      expect(Object.keys(row).sort()).toEqual(['char', 'gap', 'lookupStatus', 'occurrences'])
      expect(Array.from(article).filter(char => char === row.char)).toHaveLength(row.occurrences)
      expect(CHARACTER_INDEX.lookup(row.char).status).toBe(row.lookupStatus)
      expect(CHARACTER_INDEX.lookup(row.char).entries).toEqual([])
    }
  })
})
