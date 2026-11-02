import { getCodeSlots } from '../domain/encoding'
import { rankLessonEntries, validateLessons, type Lesson, type LessonGroupDefinition } from '../domain/lessons'
import type { CharacterEntry, CodeSlotType } from '../domain/types'
import { TEACHING_PRACTICE_ENTRIES } from './library'

export const LESSON_GROUPS: readonly LessonGroupDefinition[] = [
  { id: 'start', title: '认识小鹤', description: '从一个字理解声音与字形。' },
  { id: 'sound', title: '双拼基础', description: '把一个音节对应到两个按键。' },
  { id: 'shape', title: '鹤形入门', description: '在当前字中理解首形、末形与键位。' },
  { id: 'practice', title: '四码练习', description: '使用已有核验数据逐步扩大练习范围。' },
]

const ranked = rankLessonEntries(TEACHING_PRACTICE_ENTRIES).filter((entry): entry is CharacterEntry & { shape: NonNullable<CharacterEntry['shape']> } => entry.shape !== null)
const byCharacter = new Map(ranked.map(entry => [entry.char, entry]))
const regularSounds = ranked.filter(entry => !entry.pronunciation.initial.label)
const zeroSounds = ranked.filter(entry => entry.pronunciation.initial.label === '零声母起始')

function knownCharacters(text: string): readonly string[] {
  return [...new Set(Array.from(text))].filter(char => byCharacter.has(char))
}

function coverValues<T extends CharacterEntry>(entries: readonly T[], value: (entry: T) => string): readonly string[] {
  const seen = new Set<string>()
  const selected: string[] = []
  for (const entry of entries) {
    const item = value(entry)
    if (seen.has(item)) continue
    seen.add(item)
    selected.push(entry.char)
  }
  return selected
}

function examples(chars: readonly string[], focus: readonly CodeSlotType[]): readonly string[] {
  return chars.slice(0, 3).map(char => {
    const entry = byCharacter.get(char)!
    const explanations = getCodeSlots(entry).filter(slot => focus.includes(slot.type)).map(slot => `${slot.label}：${slot.explanation}`)
    return `${char}（${entry.pronunciation.pinyin}）· ${explanations.join('；')}`
  })
}

function conceptLesson(lesson: Omit<Lesson, 'teaching'> & { teaching: Omit<Lesson['teaching'], 'examples'> }): Lesson {
  return {
    ...lesson,
    teaching: { ...lesson.teaching, examples: examples(lesson.entries, lesson.focus ?? ['initial', 'final', 'first-shape', 'last-shape']) },
  }
}

const overview = knownCharacters('某你学好')
const soundIntro = knownCharacters('某你好的他是在')
const shapeExamples = knownCharacters('某你汉字学好们语林明休')
const firstRootCoverage = coverValues(ranked, entry => entry.shape.first.key).slice(0, 24)
const lastRootCoverage = coverValues(ranked, entry => entry.shape.last.key).slice(0, 24)
const rootCoverage = [...new Set([...firstRootCoverage, ...lastRootCoverage])]

const concepts: readonly Lesson[] = [
  conceptLesson({
    id: 'intro', title: '认识小鹤', group: 'start',
    description: '先理解两个音码、两个形码分别在表达什么。', entries: overview,
    teaching: { title: '先看懂一个字', body: '单字四码把读音和字形放在一起：前两位表达读音，后两位表达当前字的首形和末形。练习时可以点击任一码位查看它的含义，再继续输入。' },
  }),
  conceptLesson({
    id: 'sound-intro', title: '什么是双拼', group: 'sound', prerequisites: ['intro'],
    description: '把完整读音拆成两个有含义的按键。', entries: soundIntro, focus: ['initial', 'final'],
    teaching: { title: '一个音节，两个按键', body: '双拼用约定键位表示声母和韵母。本关只输入前两个音码，后两个形码已提供；需要时仍可点击查看解释。零声母音节另有专门规则，后面可以单独练。' },
  }),
  conceptLesson({
    id: 'initial-keys', title: '声母键位', group: 'sound', prerequisites: ['sound-intro'],
    description: '在不同汉字中认识声母与对应按键。', entries: coverValues(regularSounds, entry => entry.pronunciation.initial.value), focus: ['initial'],
    teaching: { title: '先找到声母', body: '关注当前读音的声母，再看它对应哪一个键。含两个字母的声母也只占一个键位。字的其他三位已提供，仍可在原位置查解释，不必离开练习。' },
  }),
  conceptLesson({
    id: 'final-keys', title: '韵母键位', group: 'sound', prerequisites: ['sound-intro'],
    description: '逐个建立韵母与键位的联系。', entries: coverValues(regularSounds, entry => `${entry.pronunciation.final.value}:${entry.pronunciation.final.key}`), focus: ['final'],
    teaching: { title: '韵母不必逐字母输入', body: '完整拼音中较长的韵母，也可以由一个约定键表示。先认清当前韵母，再将它和键位联系起来；同一个键可能对应不同韵母，要结合当前读音理解。' },
  }),
  conceptLesson({
    id: 'sound-syllables', title: '完整双拼音节', group: 'sound', prerequisites: ['initial-keys', 'final-keys'],
    description: '连贯输入两个音码，形码已提供。', entries: regularSounds.slice(0, 30).map(entry => entry.char), focus: ['initial', 'final'],
    teaching: { title: '把两个音码连起来', body: '前两位共同表达当前字的读音。本关先连贯输入两个音码，形码已提供；后续再组合四码。遇到多音字时，页面会显示当前读音，也可以打开查字窗口明确换一个读音。' },
  }),
  conceptLesson({
    id: 'zero-initials', title: '零声母音节', group: 'sound', prerequisites: ['sound-intro'],
    description: '练习已收录的零声母音节，避免把补位键误当声母。', entries: coverValues(zeroSounds, entry => entry.pronunciation.final.value), focus: ['initial', 'final'],
    teaching: { title: '没有声母时，仍使用两键', body: '零声母音节使用专门的双拼映射。第一位标为零声母起始，第二位标为零声母收尾；这两键不能被解释成两个真实声母。点击码位或当前汉字，可以查看这个音节的具体规则。' },
  }),
  conceptLesson({
    id: 'shape-intro', title: '什么是鹤形', group: 'shape', recommended: true, prerequisites: ['sound-syllables'],
    description: '会双拼可以直接从这里开始，理解后两位的作用。', entries: shapeExamples, focus: ['first-shape', 'last-shape'],
    teaching: { title: '给读音接上字形', body: '会双拼后，可以直接关注第三、第四位。它们分别取当前字的首形和末形，再对应到键位。先看当前字为什么取这两个形，再逐步记住按键，不必先背完整字根表。' },
  }),
  conceptLesson({
    id: 'first-shape', title: '从首形开始', group: 'shape', prerequisites: ['shape-intro'],
    description: '在一组首形键位不同的汉字中观察第三码。', entries: [...new Set([...knownCharacters('某你汉'), ...firstRootCoverage])], focus: ['first-shape'],
    teaching: { title: '第三码表达首形', body: '先观察第三位给出的首形，再看它对应的键。需要了解取形依据时，点击当前汉字查看已核验的首末根和路径。不要只凭这个字的完整编码反推字根。' },
  }),
  conceptLesson({
    id: 'last-shape', title: '找到末形', group: 'shape', prerequisites: ['shape-intro'],
    description: '观察第四码，理解末形有时需要继续拆到内部。', entries: [...new Set([...knownCharacters('你某字'), ...lastRootCoverage])], focus: ['last-shape'],
    teaching: { title: '第四码表达末形', body: '末形并不总是顶层拆分里最后一个完整部件。先看当前字实际收录的末根，再按需查看取形路径；路径记录本数据的取形依据，不能当作实际书写笔顺。' },
  }),
  conceptLesson({
    id: 'shape-keys', title: '字根与键位', group: 'shape', prerequisites: ['first-shape', 'last-shape'],
    description: '通过已核验字例，把字根与对应键位联系起来。', entries: rootCoverage, focus: ['first-shape', 'last-shape'],
    teaching: { title: '同一个键，结合当前字理解', body: '在键盘上点开某个键，先看它在当前字中的含义，再展开已收录的映射。这里的字根关联来自当前核验题库，不代表已经收录全部鹤形字根。' },
  }),
]

const countedCharacters = ranked.filter(entry => entry.frequency !== undefined).length
const practiceDefinitions = [
  { id: 'practice-100', title: '常用字 100', count: 100 },
  { id: 'practice-300', title: '常用字 300', count: 300 },
  { id: 'practice-500', title: '常用字 500', count: 500 },
  { id: 'practice-1000', title: '常用字 1000', count: 1000 },
  { id: 'practice-3000', title: '扩展 3000 字', count: 3000 },
] as const

const practiceLessons: readonly Lesson[] = practiceDefinitions.map((definition, index) => {
  const entries = ranked.slice(0, definition.count).map(entry => entry.char)
  const hasUncountedTail = definition.count > countedCharacters
  return {
    id: definition.id, title: definition.title, group: 'practice', entries,
    description: hasUncountedTail ? '先练有词典语料计数的字，其余按字序扩展；随时可跳转。' : '从有词典语料计数、且取形已核验的子集中逐步练习。',
    prerequisites: [index === 0 ? 'shape-keys' : practiceDefinitions[index - 1].id],
    teaching: {
      title: '把每一码连成一个完整的字',
      body: `本关包含 ${entries.length} 个已核验字。有频率记录的字按 Unihan 收录的早期词典语料计数优先排列，缺计数者随后按字序排列；这不是现代互联网字频排名。遇到不熟的码就查看解释，课程不要求定时复习，也不会因错误锁住后面的内容。`,
    },
    focus: ['initial', 'final', 'first-shape', 'last-shape'],
  }
})

export const LESSONS: readonly Lesson[] = [...concepts, ...practiceLessons]

const issues = validateLessons(LESSONS, TEACHING_PRACTICE_ENTRIES)
if (issues.length) throw new Error(`Invalid lesson definitions: ${issues.join('; ')}`)

const byId = new Map(LESSONS.map(lesson => [lesson.id, lesson]))
export function getLesson(id: string): Lesson | undefined {
  return byId.get(id)
}
