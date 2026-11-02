import type { CharacterEntry, CharacterShape, DataProvenance } from '../domain/types'

export const FIXTURE_PROVENANCE: DataProvenance = {
  source: '用户提供的产品需求文档，第 5 节测试用例',
  author: '用户提供，未附署名',
  license: '未声明；仅作为本地测试 fixture，未获生产数据再分发授权',
  retrievedAt: '2026-10-25',
  modified: false,
  redistribution: 'unconfirmed',
  status: 'test-fixture',
  notes: 'TEST FIXTURE · NOT PRODUCTION DATA。仅转录用户明确给出的 某 / mou / m→M / ou→Z / 甘→G / 木→M；未经过独立权威码表审计。未提供公开来源 URL。',
}

/** TEST FIXTURE · NOT PRODUCTION DATA. Do not expand from model memory. */
export const SAMPLE_CHARACTER: CharacterEntry & { shape: CharacterShape } = {
  char: '某',
  pronunciation: {
    pinyin: 'mou',
    initial: { value: 'm', key: 'M' },
    final: { value: 'ou', key: 'Z' },
  },
  shape: {
    first: { component: '甘', key: 'G' },
    last: { component: '木', key: 'M' },
    decomposition: ['甘', '木'],
  },
  fullCode: 'MZGM',
  notes: ['仅用于验证核心交互；不是正式字典或完整拆分规则。'],
  provenance: FIXTURE_PROVENANCE,
}

export const SAMPLE_CHARACTERS = [SAMPLE_CHARACTER] as const
