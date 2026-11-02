import { getCodeSlots } from '../domain/encoding'
import { rankLessonEntries, validateLessons, type Lesson, type LessonGroupDefinition } from '../domain/lessons'
import type { CharacterEntry, CodeSlotType } from '../domain/types'
import { SHUANGPIN_PRACTICE_ENTRIES } from './shuangpin'

export const SHUANGPIN_LESSON_GROUPS: readonly LessonGroupDefinition[] = [
  { id: 'start', title: '认识双拼', description: '一个音节，用两个按键输入。' },
  { id: 'sound', title: '声韵键位', description: '逐步熟悉声母、韵母和零声母音节。' },
  { id: 'practice', title: '双拼练习', description: '把两个音码连起来，练得更熟。' },
]

const ranked = rankLessonEntries(SHUANGPIN_PRACTICE_ENTRIES)
const byCharacter = new Map(ranked.map(entry => [entry.char, entry]))
const regular = ranked.filter(entry => !entry.pronunciation.initial.label)
const zero = ranked.filter(entry => entry.pronunciation.initial.label === '零声母起始')
const soundFocus: readonly CodeSlotType[] = ['initial', 'final']

function known(text: string) { return [...new Set(Array.from(text))].filter(char => byCharacter.has(char)) }
function cover(entries: readonly CharacterEntry[], value: (entry: CharacterEntry) => string) {
  const used = new Set<string>()
  return entries.filter(entry => {
    const key = value(entry)
    if (used.has(key)) return false
    used.add(key)
    return true
  }).map(entry => entry.char)
}
function concept(lesson: Omit<Lesson, 'focus'> & { focus?: readonly CodeSlotType[] }): Lesson {
  const focus = lesson.focus ?? soundFocus
  return {
    ...lesson, focus,
    teaching: {
      ...lesson.teaching,
      examples: lesson.entries.slice(0, 3).map(char => {
        const entry = byCharacter.get(char)!
        return `${char}（${entry.pronunciation.pinyin}）· ${getCodeSlots(entry).slice(0, 2).filter(slot => focus.includes(slot.type)).map(slot => `${slot.label}：${slot.explanation}`).join('；')}`
      }),
    },
  }
}

const concepts: readonly Lesson[] = [
  concept({
    id: 'shuangpin-intro', title: '认识小鹤双拼', group: 'start', recommended: true,
    description: '从熟悉的汉字开始，理解一个音节的两个按键。', entries: known('某你学好'),
    teaching: { title: '一个音节，两个按键', body: '小鹤双拼用约定键位表示声母和韵母。先读出当前汉字，再依次输入两个音码。点击码位可以查看解释；按空格可以逐层获得提示。' },
  }),
  concept({
    id: 'shuangpin-initials', title: '声母键位', group: 'sound', prerequisites: ['shuangpin-intro'], focus: ['initial'],
    description: '把声母与它的按键联系起来。', entries: cover(regular, entry => entry.pronunciation.initial.value),
    teaching: { title: '先找到声母', body: '本关只输入声母，韵母会先提供。zh、ch、sh 虽然各有两个字母，在小鹤双拼中也只占一个按键。' },
  }),
  concept({
    id: 'shuangpin-finals', title: '韵母键位', group: 'sound', prerequisites: ['shuangpin-intro'], focus: ['final'],
    description: '用一个按键输入当前读音的韵母。', entries: cover(regular, entry => `${entry.pronunciation.final.value}:${entry.pronunciation.final.key}`),
    teaching: { title: '韵母对应一个键', body: '本关只输入韵母，声母会先提供。同一个按键可以表示不同韵母，需要结合当前的拼音理解。拼音中的 ü 会在相应说明中保留。' },
  }),
  concept({
    id: 'shuangpin-zero-initials', title: '零声母音节', group: 'sound', prerequisites: ['shuangpin-intro'],
    description: '认识没有辅音声母的音节如何输入两键。', entries: cover(zero, entry => entry.fullCode),
    teaching: { title: '零声母也输入两个键', body: 'a、o、e 等开头的零声母音节按照小鹤零声母表输入两个键。这里分别标为起始与收尾，不把起始字母当作辅音声母。' },
  }),
  concept({
    id: 'shuangpin-syllables', title: '连贯输入双拼', group: 'sound', prerequisites: ['shuangpin-initials', 'shuangpin-finals'],
    description: '从读音出发，连续输入两个音码。', entries: regular.slice(0, 30).map(entry => entry.char),
    teaching: { title: '把两键连起来', body: '先想声母对应的键，再想韵母对应的键，连贯输入两码。这里不输入声调；拼音仍保留声调，帮助你分辨读音。' },
  }),
]

export const SHUANGPIN_LESSONS: readonly Lesson[] = [
  ...concepts,
  ...[100, 300, 500, 1000, 3000].map((count, index): Lesson => ({
    id: `shuangpin-practice-${count}`, title: `双拼 ${count} 字`, group: 'practice', focus: soundFocus,
    description: '有词典频率记录的字优先，其余按字序排列。',
    entries: ranked.slice(0, count).map(entry => entry.char),
    prerequisites: [index ? `shuangpin-practice-${[100, 300, 500, 1000][index - 1]}` : 'shuangpin-syllables'],
    teaching: { title: '按读音输入两键', body: '逐字练习双拼。多音字可以在查字页选择其他来源读音；没有上下文时，不自动推断读音。每次只需输入当前读音的两个音码。' },
  })),
]

const issues = validateLessons(SHUANGPIN_LESSONS, SHUANGPIN_PRACTICE_ENTRIES)
if (issues.length) throw new Error(`Invalid sound lessons: ${issues.join('; ')}`)

export function getShuangpinLesson(id: string): Lesson | undefined {
  return SHUANGPIN_LESSONS.find(lesson => lesson.id === id)
}
