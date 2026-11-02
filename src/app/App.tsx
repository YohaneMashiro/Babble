import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { CHARACTER_INDEX, LIBRARY_STATS, PRACTICE_ENTRIES } from '../data/library'
import { LESSONS, LESSON_GROUPS, getLesson } from '../data/lessons'
import { DEFAULT_PRACTICE_TEXT } from '../data/practice-text'
import { getPreprocessedPinyin } from '../data/default-pinyin'
import { automaticTextChoices, type ReadingAnnotation } from '../domain/automatic-reading'
import type { CharacterEntry, CodePosition, CodeSlot, TrainingAction, TrainingState } from '../domain'
import { CharacterInspector } from '../components/CharacterInspector'
import { LearningPath } from '../components/LearningPath'
import { TextEditor } from '../components/TextEditor'
import { TextTrainer } from '../components/TextTrainer'
import { getCodeSlots, initialTrainingState, trainingReducer } from '../domain'
import { currentCodePosition, trainingCode } from '../domain/training'
import { resolveLessonEntries } from '../domain/lessons'
import { analyzeText, auxiliaryOptionKey, getTextAuxiliary, getTextEntry, readingOptions, textPageIndex, type TextDocument, type TextReadingOption } from '../domain/text'
import { applyAttempt, getLessonProgress, lessonPositions, makeAttemptRecord, markEntrySeen, setLessonPosition } from '../domain/progress'
import { CodeSlots } from '../components/CodeSlots'
import { shapeDisplayLabel } from '../domain/shape-teaching'
import { ShapeExplanation } from '../components/ShapeExplanation'
import { Dialog } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { VirtualKeyboard, type KeyboardView } from '../components/VirtualKeyboard'
import { useTrainingKeyboard } from '../hooks/useTrainingKeyboard'
import { useLearningProgress } from '../hooks/useLearningProgress'
import { AuxiliaryTrainer, type AuxiliaryTrainerHandle } from '../components/AuxiliaryTrainer'
import { auxiliaryTargetKey, type AuxiliaryTarget } from '../domain/auxiliary'
import type { CharacterLookup } from '../domain/dictionary'
import { isHanCharacter } from '../domain/han'
import { loadComponentSpellings } from '../data/component-spelling'
import { UserLibraryImport } from '../components/UserLibraryImport'
import type { UserCodeTarget } from '../domain/user-library'
import { loadUserLibrary } from '../state/user-library-storage'
import { useGlyphFont } from '../hooks/useGlyphFont'
import { GlyphStatus, GlyphText } from '../components/GlyphSupport'
import { SHUANGPIN_INDEX, SHUANGPIN_PRACTICE_ENTRIES, SHUANGPIN_STATS } from '../data/shuangpin'
import { SHUANGPIN_LESSONS, SHUANGPIN_LESSON_GROUPS, getShuangpinLesson } from '../data/shuangpin-lessons'
import { loadLearningLevel, saveLearningLevel, type LearningLevel } from '../domain/learning-level'
import '../styles/lesson-context.css'

function displaySlotValue(slot: CodeSlot): string {
  return slot.position >= 2 ? shapeDisplayLabel(slot.value) : slot.value
}

function loadAutoHints(): boolean {
  try { return localStorage.getItem('xiaohe:auto-hints') !== 'false' } catch { return true }
}
const fullPositions: readonly CodePosition[] = [0, 1, 2, 3]
const soundPositions: readonly CodePosition[] = [0, 1]
interface TextSession {
  source: string
  document: TextDocument
  targetIndex: number
  pageIndex: number
  choices: Readonly<Record<number, string>>
  annotations?: ReadingAnnotation | null
  automaticChoices?: Readonly<Record<number, string>>
  revealedChoices?: Readonly<Record<number, boolean>>
}
function textToken(session: TextSession) {
  return session.document.tokens[session.document.targets[session.targetIndex]]
}
function textEntryAt(session: TextSession) {
  return getTextEntry(textToken(session), session.choices[session.targetIndex])
}
function textAuxiliaryAt(session: TextSession): AuxiliaryTarget | null {
  return getTextAuxiliary(textToken(session), session.choices[session.targetIndex])
}
function textDisclosesCode(session: TextSession) {
  const token = textToken(session)
  const automatic = session.automaticChoices?.[session.targetIndex]
  if (automatic && automatic === session.choices[session.targetIndex] && !session.revealedChoices?.[session.targetIndex]) return false
  return token.lookup ? readingOptions(token.lookup).some(option => option.disclosesCode) : false
}

export function App() {
  const progress = useLearningProgress()
  const [userEntries, setUserEntries] = useState<readonly UserCodeTarget[]>([])
  const libraryRevision = useRef(0)
  const applyLibrary = (entries: readonly UserCodeTarget[]) => {
    libraryRevision.current++
    setUserEntries(entries)
  }
  useEffect(() => {
    const revision = libraryRevision.current
    let alive = true
    void loadUserLibrary().then(entries => {
      if (alive && entries && revision === libraryRevision.current) setUserEntries(entries)
    }).catch(() => { /* Preserve on-disk data when restoration is unavailable. */ })
    return () => { alive = false }
  }, [])
  const [level, setLevel] = useState(loadLearningLevel)
  const [preferenceSaved, setPreferenceSaved] = useState(true)
  const sessions = useRef<Partial<Record<LearningLevel, TextSession | null>>>({})
  const source = useRef(DEFAULT_PRACTICE_TEXT.text)
  const changeLevel = (next: LearningLevel, session: TextSession | null, text: string) => {
    if (next === level) return
    sessions.current[level] = session
    source.current = text
    setPreferenceSaved(saveLearningLevel(next))
    setLevel(next)
  }
  return <LearningWorkspace key={level} userEntries={userEntries} onUserLibraryChange={applyLibrary} progress={progress} level={level} preferenceSaved={preferenceSaved} initialTextSession={sessions.current[level] ?? null} initialText={source.current} onLevelChange={changeLevel} />
}

interface LearningWorkspaceProps {
  userEntries: readonly UserCodeTarget[]
  onUserLibraryChange: (entries: readonly UserCodeTarget[]) => void
  progress: ReturnType<typeof useLearningProgress>
  level: LearningLevel
  preferenceSaved: boolean
  initialTextSession: TextSession | null
  initialText: string
  onLevelChange: (level: LearningLevel, session: TextSession | null, text: string) => void
}

function LearningWorkspace({ userEntries, onUserLibraryChange, progress, level, preferenceSaved, initialTextSession, initialText, onLevelChange }: LearningWorkspaceProps) {
  const soundOnly = level === 'shuangpin'
  const characterIndex = soundOnly ? SHUANGPIN_INDEX : CHARACTER_INDEX
  const practiceEntries = soundOnly ? SHUANGPIN_PRACTICE_ENTRIES : PRACTICE_ENTRIES
  const lessons = soundOnly ? SHUANGPIN_LESSONS : LESSONS
  const lessonGroups = soundOnly ? SHUANGPIN_LESSON_GROUPS : LESSON_GROUPS
  const findLesson = soundOnly ? getShuangpinLesson : getLesson
  const activePositions = soundOnly ? soundPositions : fullPositions
  const visibleSlotsCount = soundOnly ? 2 : 4
  const practiceRef = useRef<HTMLElement>(null)
  const [practiceFocusRequest, setPracticeFocusRequest] = useState(0)
  const lastPracticeFocus = useRef(0)
  const [state, dispatch] = useReducer(trainingReducer, practiceEntries[0], entry => initialTrainingState(entry, activePositions))
  const trainingRef = useRef(state)
  trainingRef.current = state
  const [autoHints, setAutoHints] = useState(loadAutoHints)
  const [view, setView] = useState<KeyboardView>('sound')
  const [dialog, setDialog] = useState<'settings' | 'about' | 'inspector' | 'path' | 'lesson-complete' | 'text-editor' | 'text-complete' | 'library' | null>(null)
  const [mode, setMode] = useState<'free' | 'path' | 'text'>('free')
  const modeRef = useRef(mode)
  modeRef.current = mode
  const [textSession, setTextSession] = useState<TextSession | null>(initialTextSession)
  const textSessionRef = useRef(textSession)
  textSessionRef.current = textSession
  const auxiliaryRef = useRef<AuxiliaryTrainerHandle>(null)
  const [freeAuxiliary, setFreeAuxiliary] = useState<AuxiliaryTarget | null>(null)
  const [auxiliaryGeneration, setAuxiliaryGeneration] = useState(0)
  const [auxiliaryAssisted, setAuxiliaryAssisted] = useState(false)
  const [textPreparationError, setTextPreparationError] = useState('')
  const [textPreparationRetry, setTextPreparationRetry] = useState(0)
  const spellingCache = useRef(new Map<string, readonly AuxiliaryTarget[]>())
  const textRequest = useRef(0)
  const [textEditorDefault, setTextEditorDefault] = useState(initialText)
  const [inspectorChar, setInspectorChar] = useState(practiceEntries[0].char)
  const [lessonId, setLessonId] = useState<string | null>(null)
  const [lessonIndex, setLessonIndex] = useState(0)
  const [examplesOpen, setExamplesOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [focused, setFocused] = useState(true)
  const { snapshot, ready, storageStatus, update } = progress
  const userTargets = useMemo(() => {
    const map = new Map<string, AuxiliaryTarget[]>()
    if (soundOnly) return map
    for (const item of userEntries) {
      const target: AuxiliaryTarget = { kind: 'user-code', char: item.char, code: item.code, sourceLabel: `用户导入 · ${item.sourceLabel}`, sourceId: item.importId, parts: [], confirmed: true }
      const choices = map.get(item.char) ?? []; choices.push(target); map.set(item.char, choices)
    }
    return map
  }, [userEntries, soundOnly])
  const lesson = lessonId ? findLesson(lessonId) : undefined
  const lessonEntries = useMemo(() => lesson ? resolveLessonEntries(lesson, practiceEntries) : [], [lesson, practiceEntries])
  const lessonProgress = useMemo(() => Object.fromEntries(lessons.map(item => [item.id, getLessonProgress(item, practiceEntries, snapshot)])), [snapshot, lessons, practiceEntries])
  const slots = getCodeSlots(state.entry)
  const current = slots[currentCodePosition(state) ?? 0]
  const textEntry = textSession ? textEntryAt(textSession) : null
  const selectedTextReading = textSession && textToken(textSession).lookup ? readingOptions(textToken(textSession).lookup!).find(option => option.key === textSession.choices[textSession.targetIndex]) : undefined
  const selectedAuxiliary = mode === 'text' && textSession ? textAuxiliaryAt(textSession) : mode === 'free' ? freeAuxiliary : null
  const removedUserTarget = selectedAuxiliary?.kind === 'user-code' && !(userTargets.get(selectedAuxiliary.char) ?? []).some(target => auxiliaryTargetKey(target) === auxiliaryTargetKey(selectedAuxiliary))
  const auxiliary = removedUserTarget ? null : selectedAuxiliary
  const canTrain = !removedUserTarget && !auxiliary && (mode !== 'text' || textEntry !== null)
  const activeChar = auxiliary?.char ?? (mode === 'text' && textSession ? textToken(textSession).value : state.entry.char)
  const activeGlyphs = useGlyphFont(activeChar)
  const blocked = !ready || dialog !== null || selectedKey !== null
  const activeIndex = mode === 'text' && textSession ? textSession.targetIndex : mode === 'path' ? lessonIndex : auxiliary ? 0 : practiceIndex
  const activeTotal = mode === 'text' && textSession ? textSession.document.targets.length : mode === 'path' ? lessonEntries.length : auxiliary ? 1 : practiceEntries.length
  const targetLabel = state.positions.map(position => slots[position].label).join('、')

  const applyTraining = useCallback((action: TrainingAction) => {
    const nextState = trainingReducer(trainingRef.current, action)
    trainingRef.current = nextState
    dispatch(action)
    return nextState
  }, [])

  const record = useCallback((candidate: TrainingState) => {
    if (!canTrain) return
    const attempt = makeAttemptRecord(candidate, Date.now(), mode === 'path' ? lessonId ?? undefined : undefined)
    if (attempt) update(previous => applyAttempt(previous, attempt), attempt)
  }, [canTrain, mode, lessonId, update])

  const finalizePartial = useCallback(() => {
    if (auxiliary) { auxiliaryRef.current?.finishPartial(); return }
    if (!trainingRef.current.completed) record(trainingRef.current)
  }, [record, auxiliary])

  const clearExplanation = useCallback(() => {
    setSelectedSlot(null)
    setSelectedKey(null)
    setNotice('')
  }, [])

  const loadEntry = useCallback((entry: CharacterEntry, positions: readonly CodePosition[], assisted = false) => {
    setFreeAuxiliary(null)
    applyTraining({ type: 'load-entry', entry, positions })
    if (assisted) applyTraining({ type: 'mark-assisted', hintLevel: 4 })
    clearExplanation()
  }, [applyTraining, clearExplanation])

  const loadTextSession = useCallback((session: TextSession, assisted = false) => {
    setTextSession(session)
    setPracticeFocusRequest(previous => previous + 1)
    const entry = textEntryAt(session)
    setAuxiliaryGeneration(value => value + 1)
    setAuxiliaryAssisted(assisted)
    if (entry) loadEntry(entry, activePositions, assisted || textDisclosesCode(session))
    else {
      // No source-backed selection yet: keep the previous engine hidden and idle.
      applyTraining({ type: 'reset' })
      clearExplanation()
    }
  }, [loadEntry, applyTraining, clearExplanation, activePositions])

  const reset = useCallback(() => {
    if (!ready || !canTrain) return
    finalizePartial()
    applyTraining({ type: 'reset' })
    if (mode === 'path' && examplesOpen) applyTraining({ type: 'mark-assisted', hintLevel: 4 })
    if (mode === 'text' && textSession && textDisclosesCode(textSession)) applyTraining({ type: 'mark-assisted', hintLevel: 4 })
    clearExplanation()
    setNotice('已重置当前字。慢慢来。')
  }, [ready, canTrain, finalizePartial, applyTraining, mode, examplesOpen, textSession, clearExplanation])

  const chooseEntry = useCallback((entry: CharacterEntry) => {
    if (!ready) return
    finalizePartial()
    if (mode === 'text' && textSession) {
      const currentIndex = textSession.targetIndex
      const index = activeChar === entry.char ? currentIndex : textSession.document.targets.findIndex(tokenIndex => textSession.document.tokens[tokenIndex].value === entry.char)
      if (index >= 0) {
        const token = textSession.document.tokens[textSession.document.targets[index]]
        const option = token.lookup && readingOptions(token.lookup).find(item => item.entry?.fullCode === entry.fullCode && item.pinyin === entry.pronunciation.pinyin)
        if (option) {
          loadTextSession({ ...textSession, targetIndex: index, pageIndex: textPageIndex(textSession.document, index), choices: { ...textSession.choices, [index]: option.key } }, true)
          setDialog(null)
          return
        }
      }
    }
    const indexInLesson = mode === 'path' ? lessonEntries.findIndex(item => item.char === entry.char) : -1
    if (lesson && indexInLesson >= 0) {
      setLessonIndex(indexInLesson)
      loadEntry(entry, lessonPositions(lesson), true)
    } else {
      setMode('free')
      setLessonId(null)
      const index = practiceEntries.findIndex(item => item.char === entry.char)
      if (index >= 0) setPracticeIndex(index)
      loadEntry(entry, activePositions, true)
    }
    setDialog(null)
  }, [ready, finalizePartial, mode, textSession, activeChar, loadTextSession, lesson, lessonEntries, loadEntry, practiceEntries, activePositions])

  const selectLesson = useCallback((id: string) => {
    if (!ready) return
    const selected = findLesson(id)
    if (!selected) return
    if (mode === 'path' && lessonId === id) { setDialog(null); return }
    finalizePartial()
    const entries = resolveLessonEntries(selected, practiceEntries)
    const index = Math.min(snapshot.lessons[id]?.lastEntryIndex ?? 0, entries.length - 1)
    setMode('path')
    setLessonId(id)
    setLessonIndex(index)
    setExamplesOpen(false)
    loadEntry(entries[index], lessonPositions(selected))
    setDialog(null)
  }, [ready, mode, lessonId, finalizePartial, snapshot.lessons, loadEntry, findLesson, practiceEntries])

  const switchToFree = useCallback(() => {
    if (!ready || (mode === 'free' && !freeAuxiliary)) return
    finalizePartial()
    setMode('free')
    setLessonId(null)
    setExamplesOpen(false)
    loadEntry(practiceEntries[practiceIndex], activePositions)
    setDialog(null)
  }, [ready, mode, freeAuxiliary, finalizePartial, practiceIndex, loadEntry, practiceEntries, activePositions])

  const switchToText = useCallback(() => {
    if (!ready) return
    if (!textSession) { setDialog('text-editor'); return }
    if (mode === 'text') { setPracticeFocusRequest(previous => previous + 1); return }
    finalizePartial()
    setMode('text')
    setLessonId(null)
    setExamplesOpen(false)
    loadTextSession(textSession)
    setDialog(null)
  }, [ready, textSession, mode, finalizePartial, loadTextSession])

  const preparedLookup = useCallback((char: string): CharacterLookup => {
    const original = characterIndex.lookup(char)
    if (soundOnly) return original
    const targets = [...(userTargets.get(char) ?? []), ...(spellingCache.current.get(char) ?? []).filter(target => target.confirmed)]
    return targets.length ? { ...original, auxiliary: targets } : original
  }, [userTargets, characterIndex, soundOnly])
  const prepareTextLookup = useCallback(async (source: string) => {
    if (soundOnly) return preparedLookup
    const missing = [...new Set(Array.from(source).filter(char => isHanCharacter(char) && !characterIndex.lookup(char).entries.length && !userTargets.has(char)))]
    if (missing.length) {
      const results = await loadComponentSpellings(missing)
      for (const [char, targets] of results) spellingCache.current.set(char, targets)
    }
    return preparedLookup
  }, [preparedLookup, userTargets, soundOnly, characterIndex])
  const importText = useCallback(async (source: string, suppliedAnnotations?: ReadingAnnotation | null) => {
    if (!ready) return
    const request = ++textRequest.current
    const lookup = await prepareTextLookup(source)
    if (request !== textRequest.current) return
    const analysis = analyzeText(source, lookup)
    if (analysis.status !== 'valid' || !analysis.document.targets.length) return
    finalizePartial()
    setMode('text')
    setLessonId(null)
    setExamplesOpen(false)
    const annotations = suppliedAnnotations === undefined ? getPreprocessedPinyin(source) : suppliedAnnotations
    const automaticChoices = annotations ? automaticTextChoices(analysis.document, annotations) : {}
    loadTextSession({ source, document: analysis.document, targetIndex: 0, pageIndex: 0, choices: automaticChoices, automaticChoices, annotations })
    setDialog(null)
  }, [ready, finalizePartial, loadTextSession, prepareTextLookup])

  const chooseAuxiliary = useCallback((target: AuxiliaryTarget) => {
    if (soundOnly || !ready || (target.kind === 'component-spelling' && !target.confirmed)) return
    finalizePartial()
    if (target.kind === 'component-spelling') {
      const records = spellingCache.current.get(target.char) ?? []
      if (!records.some(record => record.code === target.code)) spellingCache.current.set(target.char, [...records, target])
    }
    if (mode === 'text' && textSession) {
      const index = activeChar === target.char ? textSession.targetIndex : textSession.document.targets.findIndex(tokenIndex => textSession.document.tokens[tokenIndex].value === target.char)
      if (index >= 0) {
        const tokenIndex = textSession.document.targets[index]
        const tokens = [...textSession.document.tokens], token = tokens[tokenIndex]
        if (token.lookup) {
          tokens[tokenIndex] = { ...token, lookup: { ...token.lookup, auxiliary: [target] } }
          loadTextSession({ ...textSession, targetIndex: index, pageIndex: textPageIndex(textSession.document, index), document: { ...textSession.document, tokens }, choices: { ...textSession.choices, [index]: `aux:${target.kind}:${target.sourceId}:${target.code}` } }, true)
          setDialog(null); return
        }
      }
    }
    setMode('free'); setLessonId(null); setFreeAuxiliary(target); setAuxiliaryAssisted(true); setAuxiliaryGeneration(value => value + 1); clearExplanation(); setDialog(null)
  }, [ready, finalizePartial, mode, textSession, activeChar, loadTextSession, clearExplanation, soundOnly])

  const jumpText = useCallback((index: number) => {
    if (!ready || !textSession || index < 0 || index >= textSession.document.targets.length) return
    const session = { ...textSession, targetIndex: index, pageIndex: textPageIndex(textSession.document, index) }
    if (index === textSession.targetIndex) { setTextSession(session); setPracticeFocusRequest(previous => previous + 1); return }
    finalizePartial()
    loadTextSession(session)
  }, [ready, textSession, finalizePartial, loadTextSession])

  const chooseTextReading = useCallback((option: TextReadingOption) => {
    if (!ready || !textSession) return
    if (option.key === textSession.choices[textSession.targetIndex]) { setPracticeFocusRequest(previous => previous + 1); return }
    finalizePartial()
    loadTextSession({ ...textSession, choices: { ...textSession.choices, [textSession.targetIndex]: option.key } })
  }, [ready, textSession, finalizePartial, loadTextSession])

  const revealTextChoices = useCallback(() => {
    if (!textSession) return
    const token = textToken(textSession)
    if (!token.lookup || !readingOptions(token.lookup).some(option => option.disclosesCode)) return
    setTextSession({ ...textSession, revealedChoices: { ...textSession.revealedChoices, [textSession.targetIndex]: true } })
    applyTraining({ type: 'mark-assisted', hintLevel: 4 })
    auxiliaryRef.current?.markAssisted()
  }, [textSession, applyTraining])

  const clearText = useCallback(() => {
    if (!ready) return
    finalizePartial()
    setTextSession(null)
    setTextEditorDefault('')
    setMode('free')
    setLessonId(null)
    loadEntry(practiceEntries[practiceIndex], activePositions)
    setDialog('text-editor')
  }, [ready, finalizePartial, practiceIndex, loadEntry, practiceEntries, activePositions])

  const restartText = useCallback(() => {
    if (!textSession) return
    finalizePartial()
    loadTextSession({ ...textSession, targetIndex: 0, pageIndex: 0 })
    setDialog(null)
  }, [textSession, finalizePartial, loadTextSession])

  const next = useCallback(() => {
    if (!ready) return
    if (mode === 'text' && textSession) {
      finalizePartial()
      if (textSession.targetIndex === textSession.document.targets.length - 1) {
        // Retire an auxiliary attempt before the end dialog; closing it must
        // leave a fresh target that can save another attempt.
        if (auxiliary) loadTextSession(textSession)
        else if (canTrain && !trainingRef.current.completed) {
          applyTraining({ type: 'reset' })
          if (textDisclosesCode(textSession)) applyTraining({ type: 'mark-assisted', hintLevel: 4 })
        }
        setDialog('text-complete')
      } else {
        const index = textSession.targetIndex + 1
        loadTextSession({ ...textSession, targetIndex: index, pageIndex: textPageIndex(textSession.document, index) })
      }
    } else if (mode === 'path' && lesson) {
      if (lessonIndex === lessonEntries.length - 1) {
        finalizePartial()
        if (!trainingRef.current.completed) {
          applyTraining({ type: 'reset' })
          if (examplesOpen) applyTraining({ type: 'mark-assisted', hintLevel: 4 })
        }
        setDialog('lesson-complete')
        return
      }
      finalizePartial()
      const index = lessonIndex + 1
      setLessonIndex(index)
      loadEntry(lessonEntries[index], lessonPositions(lesson), examplesOpen)
    } else {
      finalizePartial()
      const index = (practiceIndex + 1) % practiceEntries.length
      setPracticeIndex(index)
      loadEntry(practiceEntries[index], activePositions)
    }
  }, [ready, mode, textSession, canTrain, auxiliary, loadTextSession, lesson, lessonIndex, lessonEntries, examplesOpen, finalizePartial, practiceIndex, loadEntry, applyTraining, practiceEntries, activePositions])

  const restartLesson = useCallback(() => {
    if (!lesson) return
    finalizePartial()
    setLessonIndex(0)
    setExamplesOpen(false)
    loadEntry(lessonEntries[0], lessonPositions(lesson))
    setDialog(null)
  }, [lesson, lessonEntries, finalizePartial, loadEntry])

  const hint = useCallback(() => {
    if (!ready || !canTrain) return
    applyTraining({ type: 'hint' })
    setSelectedSlot(null)
    setNotice('')
  }, [ready, canTrain, applyTraining])

  const type = useCallback((letter: string) => {
    if (!ready || !canTrain || trainingRef.current.completed) return
    const nextState = applyTraining({ type: 'type-letter', letter })
    if (nextState.completed) record(nextState)
    clearExplanation()
    if (mode === 'text') practiceRef.current?.focus({ preventScroll: true })
  }, [ready, canTrain, applyTraining, record, clearExplanation, mode])

  const openInspector = useCallback(() => {
    if (!ready) return
    if (canTrain) applyTraining({ type: 'mark-assisted', hintLevel: 4 })
    if (auxiliary) auxiliaryRef.current?.markAssisted()
    setInspectorChar(activeChar)
    setDialog('inspector')
  }, [ready, canTrain, activeChar, applyTraining, auxiliary])

  const inspectTextChar = useCallback((char: string) => {
    if (!ready) return
    setInspectorChar(char)
    setDialog('inspector')
  }, [ready])

  const markInspectorAssistance = useCallback((char: string) => {
    if (canTrain && char === activeChar) applyTraining({ type: 'mark-assisted', hintLevel: 4 })
    if (auxiliary && char === activeChar) auxiliaryRef.current?.markAssisted()
  }, [canTrain, activeChar, applyTraining, auxiliary])

  const onKey = useCallback((key: string) => {
    if (key === ' ') { if (mode === 'text') next(); else hint() }
    else if (key === 'Backspace') reset()
    else if (key === 'Enter') next()
    else type(key)
  }, [mode, hint, reset, next, type])
  const pressedKey = useTrainingKeyboard(onKey, blocked || auxiliary !== null)

  const applyUserLibrary = useCallback((entries: readonly UserCodeTarget[]) => {
    const current = modeRef.current === 'text' && textSessionRef.current ? textAuxiliaryAt(textSessionRef.current) : freeAuxiliary
    if (current?.kind === 'user-code' && !entries.some(item => item.char === current.char && item.code === current.code && item.importId === current.sourceId)) auxiliaryRef.current?.finishPartial()
    onUserLibraryChange(entries)
  }, [freeAuxiliary, onUserLibraryChange])

  useEffect(() => {
    const initial = textSessionRef.current
    if (!initial) return
    let alive = true
    setTextPreparationError('')
    void prepareTextLookup(initial.source).then(lookup => {
      const previous = textSessionRef.current
      if (!alive || !previous || previous.source !== initial.source) return
      const analysis = analyzeText(previous.source, lookup)
      if (analysis.status !== 'valid') return
      const document = analysis.document
      if (!document.targets.length) {
        if (modeRef.current === 'text') finalizePartial()
        setTextEditorDefault(previous.source); setTextSession(null)
        if (modeRef.current === 'text') { setMode('free'); loadEntry(practiceEntries[practiceIndex], activePositions); setDialog('text-editor') }
        return
      }
      const oldToken = previous.document.targets[previous.targetIndex]
      const found = document.targets.indexOf(oldToken)
      const targetIndex = found >= 0 ? found : Math.min(previous.targetIndex, document.targets.length - 1)
      const automaticChoices = previous.annotations ? automaticTextChoices(document, previous.annotations) : {}
      const choices: Record<number, string> = { ...automaticChoices }
      const revealedChoices: Record<number, boolean> = {}
      for (const [index, choice] of Object.entries(previous.choices)) {
        const tokenIndex = previous.document.targets[Number(index)], nextIndex = document.targets.indexOf(tokenIndex)
        const nextToken = document.tokens[tokenIndex]
        if (nextIndex >= 0 && previous.revealedChoices?.[Number(index)]) revealedChoices[nextIndex] = true
        if (nextIndex >= 0 && nextToken.lookup && (readingOptions(nextToken.lookup).some(option => option.key === choice) || nextToken.lookup.auxiliary?.some(target => auxiliaryOptionKey(target) === choice))) choices[nextIndex] = choice
      }
      const nextSession = { ...previous, document, targetIndex, pageIndex: textPageIndex(document, targetIndex), choices, automaticChoices, revealedChoices }
      const oldTarget = textAuxiliaryAt(previous), nextTarget = textAuxiliaryAt(nextSession)
      const oldEntry = textEntryAt(previous), nextEntry = textEntryAt(nextSession)
      const same = oldTarget || nextTarget ? !!oldTarget && !!nextTarget && auxiliaryTargetKey(oldTarget) === auxiliaryTargetKey(nextTarget) : !!oldEntry && !!nextEntry && oldEntry.char === nextEntry.char && oldEntry.fullCode === nextEntry.fullCode && oldEntry.pronunciation.pinyin === nextEntry.pronunciation.pinyin
      if (modeRef.current === 'text' && !same) { finalizePartial(); loadTextSession(nextSession) }
      else setTextSession(nextSession)
    }).catch(() => { if (alive) setTextPreparationError('字库更新后拼字资料暂时无法加载。原文、位置和仍有效的选择保持不变；已移除的用户编码暂停练习。') })
    return () => { alive = false }
    // Re-prepare only when the available user library changes, not per keypress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepareTextLookup, textPreparationRetry])

  useEffect(() => {
    if (freeAuxiliary?.kind !== 'user-code') return
    if ((userTargets.get(freeAuxiliary.char) ?? []).some(target => auxiliaryTargetKey(target) === auxiliaryTargetKey(freeAuxiliary))) return
    auxiliaryRef.current?.finishPartial()
    loadEntry(practiceEntries[practiceIndex], activePositions)
  }, [userTargets, freeAuxiliary, loadEntry, practiceIndex])

  useEffect(() => {
    if (dialog !== null || practiceFocusRequest === lastPracticeFocus.current) return
    lastPracticeFocus.current = practiceFocusRequest
    practiceRef.current?.focus({ preventScroll: true })
  }, [dialog, practiceFocusRequest])

  useEffect(() => {
    if (!ready || !canTrain) return
    update(previous => {
      const seen = markEntrySeen(previous, state.entry, state.positions)
      return mode === 'path' && lessonId ? setLessonPosition(seen, lessonId, lessonIndex) : seen
    })
  }, [ready, canTrain, update, state.entry, state.positions, mode, lessonId, lessonIndex])

  useEffect(() => {
    try { localStorage.setItem('xiaohe:auto-hints', String(autoHints)) } catch { /* Storage restrictions never block training. */ }
  }, [autoHints])

  useEffect(() => {
    const blur = () => setFocused(false)
    const focus = () => setFocused(document.visibilityState === 'visible')
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSelectedKey(null); setSelectedSlot(null) }
    }
    window.addEventListener('blur', blur)
    window.addEventListener('focus', focus)
    window.addEventListener('keydown', escape)
    document.addEventListener('visibilitychange', focus)
    return () => {
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', focus)
      window.removeEventListener('keydown', escape)
      document.removeEventListener('visibilitychange', focus)
    }
  }, [])

  useEffect(() => {
    if (!ready || !canTrain || !autoHints || !focused || blocked || state.completed || state.error || state.hintLevel >= 2 || selectedSlot !== null) return
    const timer = window.setTimeout(() => {
      applyTraining({ type: 'hint' })
      setNotice('')
    }, 6500)
    return () => window.clearTimeout(timer)
  }, [ready, canTrain, autoHints, focused, blocked, state, selectedSlot, applyTraining])

  const switchLevel = (nextLevel: LearningLevel) => {
    if (nextLevel === level) return
    finalizePartial()
    textRequest.current++
    onLevelChange(nextLevel, textSession, textSession?.source ?? textEditorDefault)
  }

  const explanation = selectedSlot !== null ? slots[selectedSlot] : null
  const errorSlot = state.error ? slots[state.error.position] : null
  const storageLabel = !ready ? '读取本地进度…' : storageStatus === 'loading' ? '正在保存…' : storageStatus === 'memory-only' ? '本次进度仅保留在内存' : '本地进度已保存'

  return <div className="app-shell" data-learning-level={level}>
    <header className="site-header">
      <a className="wordmark" href="#practice">Babble<span>A better place to learn Xiaohe</span></a>

      <div className="header-tools"><button className="settings-button" onClick={openInspector} aria-label={soundOnly ? '查字与双拼' : '查字与编码'}><Icon name="search" /><span>查字</span></button><button className="settings-button" onClick={() => setDialog('settings')} aria-label="打开设置"><Icon name="settings" /><span>设置</span></button></div>
    </header>

    <section className="learning-levels" aria-label="学习级别">
      <div className="learning-level-switch" role="group" aria-label="选择学习级别">
        <button className={soundOnly ? 'is-active' : ''} aria-pressed={soundOnly} onClick={() => switchLevel('shuangpin')}><span className="level-number">01</span><span><strong>小鹤双拼</strong><small>第一级 · 从读音到两码</small></span></button>
        <button className={!soundOnly ? 'is-active' : ''} aria-pressed={!soundOnly} onClick={() => switchLevel('yinxing')}><span className="level-number">02</span><span><strong>小鹤音形</strong><small>第二级 · 音码与形码</small></span></button>
      </div>
      <p className="level-description">{soundOnly ? '先熟悉声母、韵母与键位，用两码打出一个音节。' : '在双拼基础上加入首形、末形，学习四码与部件拼字。'}<span>可随时切换，自动记住上次选择。</span></p>
      {!preferenceSaved && <p className="level-memory-note" role="status">当前浏览器无法保存级别选择，本次页面仍可自由切换。</p>}
      <nav className="main-nav" aria-label="学习模式"><button className={mode === 'free' ? 'active' : ''} aria-current={mode === 'free' ? 'page' : undefined} onClick={switchToFree}>自由学习</button><button className={mode === 'path' ? 'active' : ''} aria-current={mode === 'path' ? 'page' : undefined} onClick={() => setDialog('path')}>学习路径</button><button className={mode === 'text' ? 'active' : ''} aria-current={mode === 'text' ? 'page' : undefined} onClick={switchToText}>自定义文本</button></nav>
    </section>

    <main id="practice" className={`practice ${mode === 'text' ? 'text-practice' : ''}`} tabIndex={-1} ref={practiceRef}>
      <div className="practice-heading"><div className="practice-label"><span className="status-dot" />{mode === 'text' ? '文本练习' : mode === 'path' ? '课程练习' : '自由单字练习'}<span className="heading-divider" /><span className="muted">{mode === 'text' ? '在上下文中，连续练习' : '一次，理解一个字'}</span></div><button className={`hint-mode ${autoHints ? 'enabled' : ''}`} onClick={() => setAutoHints(value => !value)} aria-pressed={autoHints}><Icon name="hint" size={15} />提示：{autoHints ? '自动' : '手动'}<span className="tiny-chevron">⌄</span></button></div>

      {mode === 'path' && lesson && <section className="lesson-context" aria-label="课程讲解">
        <div className="lesson-context-heading"><h2>{lesson.title}</h2><button onClick={() => setDialog('path')}>更换课程</button></div>
        <p>{lesson.teaching.body}</p>
        {lesson.teaching.examples?.length ? <details key={lesson.id} open={examplesOpen} ><summary onClick={event => { event.preventDefault(); const open = !examplesOpen; if (open) applyTraining({ type: 'mark-assisted', hintLevel: 4 }); setExamplesOpen(open) }}>查看本关示例</summary><ul>{lesson.teaching.examples.map(example => <li key={example}>{example}</li>)}</ul></details> : null}
        <span className="lesson-current-progress">已尝试 {lessonProgress[lesson.id].attempted}/{lessonEntries.length} · 曾独立掌握 {lessonProgress[lesson.id].mastered} 个目标</span>
      </section>}

      {mode === 'text' && textSession && <TextTrainer level={level} document={textSession.document} targetIndex={textSession.targetIndex} pageIndex={textSession.pageIndex} choiceKey={textSession.choices[textSession.targetIndex]} automaticChoice={Boolean(textSession.automaticChoices?.[textSession.targetIndex] && textSession.automaticChoices[textSession.targetIndex] === textSession.choices[textSession.targetIndex])} onRevealChoices={revealTextChoices} onChoose={chooseTextReading} onPageChange={index => { if (index >= 0 && index < textSession.document.pages.length) setTextSession({ ...textSession, pageIndex: index }) }} onJump={jumpText} onInspect={inspectTextChar} onEdit={() => setDialog('text-editor')} onClear={clearText} />}
      {mode === 'text' && textSession && textPreparationError && <div className="component-data-status" role="status" data-status="error"><p>{textPreparationError}</p><button className="subtle-button" onClick={() => setTextPreparationRetry(value => value + 1)}>重试更新文本字库</button></div>}

      {storageStatus === 'memory-only' && <p className="local-record-note" role="status">当前浏览器无法保存本地记录，本次进度仅保留在内存。</p>}

      <section className={`character-stage ${mode === 'text' ? 'text-training-controls' : ''}`} aria-label="当前汉字练习">
        <div className={mode === 'text' ? 'text-target-meta' : undefined}>
        <div className="sample-label">{mode === 'text' ? '原文中的可练习字' : mode === 'path' ? '本关练习' : auxiliary ? auxiliary.kind === 'user-code' ? '用户库编码练习' : '部件拼字练习' : soundOnly ? '双拼读音练习' : '已核对编码题库'} <span>{activeIndex + 1} / {activeTotal.toLocaleString()}</span></div>
        {mode === 'text' ? <button className="character-inspect-button text-current-character" aria-label={`${activeChar}：${soundOnly ? '查看双拼与来源' : '查看取形与来源'}`} onClick={openInspector}><GlyphText text={activeChar} /></button> : <h1 className="character"><button className="character-inspect-button" aria-label={`${activeChar}：${soundOnly ? '查看双拼与来源' : '查看取形与来源'}`} onClick={openInspector}><GlyphText text={activeChar} /></button></h1>}
        <GlyphStatus state={activeGlyphs} />
        {auxiliary ? <div className="pinyin">{auxiliary.kind === 'component-spelling' ? characterIndex.lookup(activeChar).readings.length ? '部件拼读 · 本字读音可在查字页查看' : '本字读音未收录 · 可用部件拼字' : '用户提供的编码 · 不推断本字读音'}</div> : canTrain ? <div className="pinyin" aria-label={`拼音 ${state.entry.pronunciation.pinyin}`}>{state.entry.pronunciation.pinyin}</div> : <div className="pinyin">{selectedTextReading ? `${selectedTextReading.pinyin} · 仅读音` : '等待选择读音'}</div>}
        {!auxiliary && mode !== 'text' && characterIndex.lookup(state.entry.char).readings.length > 1 && <button className="reading-choice-link" onClick={openInspector}>多音字 · 选择其他读音</button>}
        </div>
        {auxiliary ? <AuxiliaryTrainer textMode={mode === 'text'} key={`${auxiliaryTargetKey(auxiliary)}:${auxiliaryGeneration}`} ref={auxiliaryRef} target={auxiliary} initialAssisted={auxiliaryAssisted} blocked={blocked} focused={focused} autoHints={autoHints} onNext={next} /> : canTrain ? <>
        <div className="character-caption">{soundOnly ? '一个音节，两个键。' : state.positions.length < 4 ? `本关只输入：${targetLabel}` : '两个音码，两个形码。'}<span>{soundOnly ? state.positions.length === 1 ? `本关练习：${targetLabel}。` : '先声母，再韵母。' : state.positions.length < 4 ? '其余码位已提供。' : '每一码，都有它的含义。'}</span></div>

        <CodeSlots compact={mode === 'text'} level={level} state={state} selectedSlot={selectedSlot} onSelect={position => { if (state.positions.includes(position as CodePosition) || (position >= 2 && state.positions.some(target => target >= 2))) applyTraining({ type: 'mark-assisted', hintLevel: 3 }); setSelectedSlot(value => value === position ? null : position); setNotice('') }} />

        <div className={`feedback ${state.error ? 'feedback-error' : state.completed ? 'feedback-success' : ''}`} role="status" aria-live="polite" aria-atomic="true">
          {notice ? <p>{notice}</p> : explanation ? <><span className="feedback-eyebrow">第 {explanation.position + 1} 码 · {explanation.label}</span><p><strong>{displaySlotValue(explanation)}</strong><span className="explanation-arrow">→</span><kbd>{explanation.key}</kbd><span className="explanation-detail">{explanation.position < 2 ? '声音对应的键位' : '这个字中使用的字形与键位'}</span></p></> : state.error && errorSlot ? <><span className="feedback-eyebrow">第 {state.error.position + 1} 码需要再试一下 · {errorSlot.label}</span><p>你输入了 <kbd>{state.error.input}</kbd><span className="explanation-detail">这一位是</span><strong>{displaySlotValue(errorSlot)}</strong><span className="explanation-arrow">→</span><kbd>{errorSlot.key}</kbd></p></> : state.completed ? <><span className="feedback-eyebrow"><Icon name="check" size={14} /> {soundOnly && state.positions.length === 2 ? '双拼完成' : state.positions.length === 4 ? '四码完成' : '本关目标完成'}</span><p><strong>{trainingCode(state)}</strong><span className="explanation-detail">{state.positions.map(position => displaySlotValue(slots[position])).join(" · ")} · {mode === 'text' ? '按空格确认下一字。' : '本次目标已完成。'}</span></p></> : state.hintLevel === 4 ? <><span className="feedback-eyebrow">完整解释 · 现在可以跟着输入</span><p className="full-explanation">{slots.slice(0, visibleSlotsCount).map(slot => <span key={slot.type}>{displaySlotValue(slot)}<i>→</i><strong>{slot.key}</strong></span>)}</p></> : state.hintLevel === 3 ? <><span className="feedback-eyebrow">第 {current.position + 1} 码 · {current.label}</span><p><strong>{displaySlotValue(current)}</strong><span className="explanation-arrow">→</span><kbd>{current.key}</kbd><span className="explanation-detail">在键盘上找到它，试着输入。</span></p></> : state.hintLevel === 2 ? <><span className="feedback-eyebrow">第 {current.position + 1} 码 · {current.label}</span><p>「{state.entry.char}」的{current.label}是 <strong>{displaySlotValue(current)}</strong><span className="explanation-detail">{mode === 'text' ? '点击提示，看看它在哪个键。' : '再按空格，看看它在哪个键。'}</span></p></> : state.hintLevel === 1 ? <><span className="feedback-eyebrow">第 {current.position + 1} 码 · {current.label}</span><p>{current.position < 2 ? '先想一想这个字的读音。' : '现在从这个字的字形中取码。'}<span className="explanation-detail">{mode === 'text' ? '点击提示，继续查看。' : '按空格，继续查看提示。'}</span></p></> : <><span className="feedback-eyebrow">{state.accepted.length ? '继续下一码' : current.position < 2 ? '从读音开始' : '从字形开始'}</span><p>{current.position < 2 ? '试着输入这个字的双拼音码。' : '接下来，试试这个字的形码。'}<span className="explanation-detail">不确定也没关系。</span></p></>}
        </div>

        {explanation && explanation.position >= 2 && <ShapeExplanation entry={state.entry} focus={explanation.position === 2 ? 'first' : 'last'} headingLevel={2} />}

        {mode === 'text' ? <div className="stage-actions"><button className="primary-button" onClick={next}>{state.completed ? '确认下一字' : '下一字'} <kbd>Space</kbd></button><button className="subtle-button" disabled={state.completed} onClick={() => { hint(); practiceRef.current?.focus({ preventScroll: true }) }} aria-label="查看当前字提示"><Icon name="hint" size={15} />提示</button><button className="subtle-button" onClick={() => { reset(); practiceRef.current?.focus({ preventScroll: true }) }} aria-label="重置当前字"><Icon name="reset" size={15} /></button></div> : <div className="stage-actions"><button className="primary-button" onClick={state.completed ? next : hint}>{state.completed ? <Icon name="arrow" size={16} /> : <Icon name="hint" size={17} />}{state.completed ? '下一字' : state.hintLevel === 4 ? '已展开全部提示' : '给我一点提示'}{!state.completed && <kbd>Space</kbd>}</button><button className="subtle-button" onClick={reset} aria-label="重置当前字"><Icon name="reset" size={15} /><span>重置</span></button></div>}
        <p className="stage-footnote">{soundOnly ? '点击码位看解释，点击汉字查读音；可随时跳过。' : '点击码位看解释，点击汉字查取形；可随时跳过。'}</p>
        </> : <div className="text-pending-training"><p>{removedUserTarget ? '此用户编码已从当前字库移除。等待资料更新，或跳到其他字。' : soundOnly ? '请在原文下方选择此处读音。暂无双拼映射的读音可以跳过。' : '请在原文下方选择此处读音。没有可靠四码的读音可以跳过。'}</p><button className="primary-button" onClick={next}>下一字 <kbd>Space</kbd></button></div>}
      </section>

      {canTrain && <VirtualKeyboard textMode={mode === 'text'} level={level} state={state} view={view} onViewChange={setView} pressedKey={pressedKey} selectedKey={selectedKey} onInspect={key => { if (key) applyTraining({ type: 'mark-assisted', hintLevel: 3 }); setSelectedKey(key) }} onType={type} onHint={hint} onReset={reset} onNext={next} />}

      <div className="shortcut-guide" aria-label="快捷键说明"><span><kbd>Space</kbd> {mode === 'text' ? '确认／下一字' : '逐层提示'}</span><span><kbd>Enter</kbd> 下一字</span><span><kbd>⌫</kbd> 重置当前字</span><span><kbd>Esc</kbd> 收起说明</span></div>
    </main>

    <footer className="site-footer"><span>A better place to learn Xiaohe</span><div><span className="storage-status" role="status" data-status={storageStatus}>{storageLabel}</span><button onClick={() => setDialog('about')}>数据与开源 <Icon name="info" size={13} /></button></div></footer>

    {dialog === 'settings' && <Dialog title="学习设置" onClose={() => setDialog(null)}><div className="setting-row"><div><strong>自动提示</strong><p>{mode === 'text' ? '停顿时，逐渐提示类型和内容。点击提示按钮查看键位；空格确认下一字。' : '停顿时，逐渐提示类型和内容。键位由你按空格展开。'}</p></div><button className={`switch ${autoHints ? 'on' : ''}`} role="switch" aria-checked={autoHints} aria-label="自动提示" onClick={() => setAutoHints(value => !value)}><span /></button></div><p className="dialog-note">设置只保存在当前浏览器。练习没有倒计时，也没有超时失败。</p>{!soundOnly && <button className="subtle-button" onClick={() => setDialog('library')}>管理本机字库</button>}</Dialog>}
    {dialog === 'about' && <Dialog title="数据与开源" onClose={() => setDialog(null)}>
      {soundOnly ? <><p>双拼依据现有的 {SHUANGPIN_STATS.readingCharacters.toLocaleString()} 字读音库与小鹤声韵映射，直接生成两码；多音字按来源列出，由你选择。</p><p>本级只练声母、韵母和零声母音节。读音资料采用 Unicode-3.0，声韵映射采用 MIT 许可；来源版本和通知随完整源码提供。</p></> : <>
      <p>本地读音库覆盖 {LIBRARY_STATS.readingCharacters.toLocaleString()} 字；其中 {LIBRARY_STATS.trainableCharacters.toLocaleString()} 字有已核对的四码可练，{LIBRARY_STATS.explainedCharacters.toLocaleString()} 字另有首末根依据。</p>
      <p>编码与取形解释分别保存证据。{LIBRARY_STATS.codeOnlyCharacters} 字已有发布全码与现代读音的核对结果，取形解释仍待补；不由编码字母猜根。取形来源包括开源生成器和开放拆字、笔顺资料的可复核推导。</p>
      <p>另有近六万字的部件拼字与固定官方来源社区参照一致，可按需查询和练习；其余独立候选单独显示，不作为默认正确答案。部件读音不等同本字读音。<button className="subtle-button" onClick={() => setDialog('library')}>管理本机字库</button></p>
      </>}
      <p>生僻字字形按需加载本站随附的 Jigmo／GlyphWiki CC0 字体分片，采用该字体的默认字形。{soundOnly ? '本版未声称覆盖全部 Unicode 18 字形。' : '显示支持不代表已核对中国大陆地区字形或小鹤取形；本版未声称覆盖全部 Unicode 18 字形。'}</p>
      <p>有频率记录的字按 Unihan 收录的早期词典语料计数优先排列，其余按字序排列。</p>
      {!soundOnly && <p>读音及字形映射：Unicode-3.0；声韵映射：MIT；旧发布码表：CC0；取形工具与扩展：AGPL-3.0。扩展拆字保留 CC BY 3.0 署名，笔顺输入保留 WTFPL 通知；原创 MIT 代码许可继续保留。</p>}
      <p className="dialog-note">无网络查码、无账户、无分析追踪。单字学习记录仅保存在当前浏览器；掌握按连续两次独立正确计算。你粘贴或上传的原文与所选读音只在本次页面中保留，刷新后清除。</p>
      <a className="source-download" href={`${import.meta.env.BASE_URL}${import.meta.env.DEV ? 'dist/' : ''}source/babble-source.tgz`} download>下载当前版本完整源码与许可</a>
    </Dialog>}
    {dialog === 'library' && <Dialog title="本机字库" onClose={() => setDialog(null)} wide><UserLibraryImport currentEntries={userEntries} onApply={applyUserLibrary} autoRestore={false} onClose={() => setDialog(null)} /></Dialog>}
    {dialog === 'path' && <LearningPath level={level} lessons={lessons} groups={lessonGroups} activeLessonId={lessonId ?? snapshot.lastLessonId} progress={lessonProgress} experience={snapshot.experience} onExperienceChange={experience => update(previous => previous.experience === experience ? previous : { ...previous, experience })} onSelect={selectLesson} onClose={() => setDialog(null)} />}
    {dialog === 'lesson-complete' && lesson && <Dialog title="本轮练习已结束" onClose={() => setDialog(null)}><p>{lesson.title} · 已尝试 {lessonProgress[lesson.id].attempted}/{lessonEntries.length} 个目标，曾独立掌握 {lessonProgress[lesson.id].mastered} 个。</p><p>掌握记录按每个目标的独立练习计算。所有课程都可以自由进入。</p><div className="lesson-finish-actions"><button className="primary-button" onClick={restartLesson}>再练一轮</button><button className="subtle-button" onClick={() => setDialog('path')}>选择其他课程</button></div></Dialog>}
    {dialog === 'inspector' && <CharacterInspector level={level} lookup={characterIndex.lookup} search={characterIndex.search} initialChar={inspectorChar} userTargets={userTargets} onTrainAuxiliary={chooseAuxiliary} onTrain={chooseEntry} onInspectCharacter={markInspectorAssistance} onClose={() => setDialog(null)} />}
    {dialog === 'text-editor' && <TextEditor level={level} initialText={textSession?.source ?? textEditorDefault} isEditing={textSession !== null} lookup={preparedLookup} prepareLookup={prepareTextLookup} getPreprocessedPinyin={getPreprocessedPinyin} onSubmit={importText} onClose={() => { textRequest.current++; setDialog(null) }} />}
    {dialog === 'text-complete' && textSession && <Dialog title="本轮文本已结束" onClose={() => setDialog(null)}><p>已经走到原文最后一个可练习字。完成与跳过的单字按实际尝试记录；走完文本不等于全部掌握。</p><p>共 {textSession.document.counts.trainable} 个可练习字，{textSession.document.counts.unavailable} 个暂无可用编码的汉字已标明并跳过。</p><div className="lesson-complete-actions"><button className="primary-button" onClick={restartText}>再练一轮</button><button className="subtle-button" onClick={() => setDialog('text-editor')}>更换文本</button></div></Dialog>}
  </div>
}
