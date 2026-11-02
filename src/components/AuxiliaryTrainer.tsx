import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { auxiliaryTargetKey, initialAuxiliaryState, typeAuxiliary, type AuxiliaryTarget } from '../domain/auxiliary'
import { readAuxiliaryRecord, saveAuxiliaryAttempt, type AuxiliaryRecord, type AuxiliaryStorageStatus } from '../state/auxiliary-storage'
import { useTrainingKeyboard } from '../hooks/useTrainingKeyboard'
import '../styles/auxiliary.css'
import { useGlyphFont } from '../hooks/useGlyphFont'
import { GlyphStatus, GlyphText } from './GlyphSupport'

export interface AuxiliaryTrainerHandle { finishPartial(): void; markAssisted(): void }
interface Props { target: AuxiliaryTarget; blocked: boolean; focused: boolean; autoHints: boolean; initialAssisted?: boolean; textMode?: boolean; onNext(): void }

export const AuxiliaryTrainer = forwardRef<AuxiliaryTrainerHandle, Props>(function AuxiliaryTrainer({ target, blocked, focused, autoHints, initialAssisted = false, textMode = false, onNext }, ref) {
  const [state, setState] = useState(() => ({ ...initialAuxiliaryState(), assisted: initialAssisted }))
  const stateRef = useRef(state)
  const [ready, setReady] = useState(false)
  const [record, setRecord] = useState<AuxiliaryRecord | null>(null)
  const [status, setStatus] = useState<AuxiliaryStorageStatus>('loading')
  const mounted = useRef(true)
  const finished = useRef(false)
  const sourceRef = useRef<HTMLDetailsElement>(null)
  const [sourceOpen, setSourceOpen] = useState(false)
  const partGlyphs = useGlyphFont(state.hint > 0 || sourceOpen ? target.parts.map(part => part.part).join('') : '')
  function update(next: typeof state) { stateRef.current = next; setState(next) }
  function save(completed: boolean) {
    if (finished.current || (!stateRef.current.typed && !stateRef.current.assisted)) return
    finished.current = true
    setStatus('loading')
    void saveAuxiliaryAttempt(target, stateRef.current, completed).then(result => {
      if (mounted.current) { setRecord(result.record); setStatus(result.status) }
    })
  }
  function finishPartial() { if (!stateRef.current.completed) save(false) }
  function markAssisted() { if (!stateRef.current.completed) update({ ...stateRef.current, assisted: true }) }
  useImperativeHandle(ref, () => ({ finishPartial, markAssisted }))
  useEffect(() => {
    mounted.current = true
    let alive = true
    void readAuxiliaryRecord(target).then(result => {
      if (alive) { setRecord(result.record); setStatus(result.status); setReady(true) }
    })
    return () => { alive = false; mounted.current = false }
  }, [target])
  function hint() { if (ready && !stateRef.current.completed) update({ ...stateRef.current, hint: Math.min(3, stateRef.current.hint + 1), assisted: true }) }
  function reset() { finishPartial(); if (sourceRef.current) sourceRef.current.open = false; finished.current = false; update(initialAuxiliaryState()) }
  function type(letter: string) {
    if (!ready || blocked) return
    // Native <details> toggle events can be coalesced and arrive after a fast
    // keypress. The visible disclosure itself is also an assistance boundary.
    if (sourceRef.current?.open) markAssisted()
    const next = typeAuxiliary(stateRef.current, target, letter)
    update(next)
    if (next.completed) save(true)
  }
  const onKey = (key: string) => {
    if (key === ' ') { if (textMode) { finishPartial(); onNext() } else hint() }
    else if (key === 'Backspace') reset()
    else if (key === 'Enter') { finishPartial(); onNext() }
    else type(key)
  }
  const pressed = useTrainingKeyboard(onKey, blocked || !ready)
  useEffect(() => {
    if (!ready || !autoHints || !focused || blocked || sourceOpen || state.completed || state.error || state.hint >= 2) return
    const timer = window.setTimeout(() => {
      const current = stateRef.current
      if (!current.completed && !current.error && current.hint < 2) update({ ...current, hint: current.hint + 1, assisted: true })
    }, 6500)
    return () => window.clearTimeout(timer)
  }, [ready, autoHints, focused, blocked, sourceOpen, state])
  return <div className="auxiliary-trainer" data-scheme={target.kind} data-target-key={auxiliaryTargetKey(target)} data-completed={state.completed}>
    <p className="auxiliary-kind">{target.kind === 'component-spelling' ? `部件拼字 · ${target.code.length} 键` : `用户库编码 · ${target.code.length} 键`}</p>
    <p>{target.kind === 'component-spelling' ? `先输入 OK，再输入${target.parts.length === 2 ? '两个' : '三个'}部件的双拼。这些是部件的拼读，不是本字读音。` : '按用户本机导入的编码练习；不从编码推断本字读音或字根。'}</p>
    <div className="auxiliary-code" role="group" aria-label={target.kind === 'component-spelling' ? '部件拼字码位' : '用户编码码位'}>
      {Array.from(target.code).map((key, index) => {
        const correct = index < state.accepted.length, wrong = state.error?.position === index
        const label = index < 2 && target.kind === 'component-spelling' ? '引导' : `第 ${index + 1} 键`
        const display = correct ? key : wrong ? state.error?.input : state.hint >= 3 ? key : '·'
        return <button key={index} className="auxiliary-code-slot" data-state={correct ? 'correct' : wrong ? 'incorrect' : state.hint >= 3 ? 'revealed' : 'hidden'} onClick={() => { markAssisted(); update({ ...stateRef.current, hint: 3, assisted: true }) }} aria-label={`查看${label} ${display}（第 ${index + 1} 键）`}><small>{label}</small><strong>{display}</strong></button>
      })}
    </div>
    <div className="auxiliary-feedback" role="status" aria-live="polite">
      {!ready ? '读取本地练习记录…' : state.error ? `第 ${state.error.position + 1} 键输入 ${state.error.input}，应为 ${state.error.expected}。前面的正确输入已保留。` : state.completed ? `编码完成 · ${target.code}${textMode ? ' · 按空格确认下一字' : ''}` : state.hint >= 3 ? `完整编码：${target.code}` : '按顺序输入。不确定时可以查看提示。'}
    </div>
    {state.hint > 0 && target.parts.length > 0 && <ol className="auxiliary-parts">{target.parts.map((part, index) => <li key={index}><strong><GlyphText text={part.part} /></strong>{state.hint >= 2 && <span>{part.pinyin}</span>}{state.hint >= 3 && <kbd>{part.code}</kbd>}</li>)}</ol>}
    <GlyphStatus state={partGlyphs} label="部件" />
    {textMode ? <div className="stage-actions"><button className="primary-button" onClick={() => { finishPartial(); onNext() }} disabled={!ready}>{state.completed ? '确认下一字' : '跳过此字'} <kbd>Space</kbd></button><button className="subtle-button" onClick={event => { hint(); event.currentTarget.blur() }} disabled={!ready || state.completed}>查看拼字提示</button><button className="subtle-button" onClick={event => { reset(); event.currentTarget.blur() }} disabled={!ready} aria-label="重置当前字">重置</button></div> : <div className="stage-actions"><button className="primary-button" onClick={state.completed ? onNext : hint} disabled={!ready}>{state.completed ? '下一字' : '查看拼字提示'} <kbd>{state.completed ? 'Enter' : 'Space'}</kbd></button><button className="subtle-button" onClick={reset} disabled={!ready} aria-label="重置当前字">重置</button></div>}
    <div className="auxiliary-keyboard" aria-label="编码键盘">{['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map(row => <div key={row}>{Array.from(row).map(key => <button className={pressed === key ? 'is-pressed' : ''} key={key} aria-label={`输入 ${key}`} onClick={event => { type(key); if (textMode) event.currentTarget.blur() }} disabled={!ready || state.completed}>{key}</button>)}</div>)}{textMode && <div><button className="space-key" onClick={() => { finishPartial(); onNext() }} disabled={!ready}>空格 · 确认／下一字</button></div>}</div>
    <p className="auxiliary-storage" role="status" data-status={status}>{status === 'loading' ? '正在保存拼字／用户编码记录…' : status === 'memory-only' ? '本次拼字／用户编码记录仅保留在内存' : '拼字／用户编码记录已保存在当前浏览器'}{record?.everMastered && ' · 曾独立掌握'}<span>这些目标与原四码练习分别记录。</span></p>
    <details ref={sourceRef} className="auxiliary-source" onToggle={event => { setSourceOpen(event.currentTarget.open); if (event.currentTarget.open) markAssisted() }}><summary onClick={() => { if (!sourceRef.current?.open) markAssisted() }}>查看此编码的来源与部件</summary><p>{target.sourceLabel}</p>{target.sourceLine && <p>部件来源行：{target.sourceLine}。取自有来源的部件序列，再与固定官方来源社区参照逐字码对比较。</p>}{target.parts.map((part, index) => <p key={index}><GlyphText text={part.part} /> · {part.pinyin} → {part.code} · {part.source.includes('mnemonic') ? '上游部件助记读音' : part.source.includes('rule') ? '公开拼字归类' : 'Unicode 读音来源'}</p>)}{target.kind === 'component-spelling' && <a href="https://flypy.cc/help/#/pc" target="_blank" rel="noreferrer">官方 OK 拼字说明 ↗</a>}</details>
  </div>
})
