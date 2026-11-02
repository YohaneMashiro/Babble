import { useEffect, useId, useMemo, useRef } from 'react'
import { getTextAuxiliary, getTextEntry, needsTextChoice, readingOptions, textPageIndex, type TextDocument, type TextReadingOption } from '../domain/text'
import '../styles/text-trainer.css'
import { useGlyphFont } from '../hooks/useGlyphFont'
import { GlyphStatus, GlyphText } from './GlyphSupport'
import type { LearningLevel } from '../domain/learning-level'

interface TextTrainerProps {
  level?: LearningLevel
  document: TextDocument
  targetIndex: number
  pageIndex: number
  choiceKey?: string
  automaticChoice?: boolean
  onRevealChoices?: () => void
  onChoose: (option: TextReadingOption) => void
  onPageChange: (index: number) => void
  onJump: (targetIndex: number) => void
  onInspect: (char: string) => void
  onEdit: () => void
  onClear: () => void
}

export function TextTrainer({ document, targetIndex, pageIndex, choiceKey, automaticChoice = false, onRevealChoices, onChoose, onPageChange, onJump, onInspect, onEdit, onClear, level = 'yinxing' }: TextTrainerProps) {
  const soundOnly = level === 'shuangpin'
  const viewportRef = useRef<HTMLDivElement>(null)
  const choicesRef = useRef<HTMLDetailsElement>(null)
  const targetIndices = useMemo(() => new Map(document.targets.map((tokenIndex, index) => [tokenIndex, index])), [document])
  const helpId = useId()
  const pageId = useId()
  const activeTokenIndex = document.targets[targetIndex]
  const activeToken = document.tokens[activeTokenIndex]
  const page = document.pages[pageIndex]
  const glyphs = useGlyphFont(page ? document.tokens.slice(page.startToken, page.endToken).map(token => token.value).join('') : '')
  const activePageIndex = textPageIndex(document, targetIndex)
  const options = activeToken?.lookup ? readingOptions(activeToken.lookup) : []
  const choice = options.find(option => option.key === choiceKey) ?? (options.length === 1 ? options[0] : null)
  const activeEntry = activeToken ? getTextEntry(activeToken, choiceKey) : null
  const isAmbiguous = activeToken ? needsTextChoice(activeToken) && !getTextAuxiliary(activeToken, choiceKey) : false

  useEffect(() => {
    if (choicesRef.current) choicesRef.current.open = false
  }, [document, targetIndex])

  const readingChoices = isAmbiguous && <div className="text-reading-choice" role="group" aria-label={`选择${activeToken.value}在此处的读音`}>
    <p><strong>「{activeToken.value}」在这里怎么读？</strong><span>{automaticChoice ? '已按上下文自动选择，可以为当前这一处更改。' : '为当前这一处选择读音。同一个字的其他位置可以另选。'}</span></p>
    <div className="text-reading-options">{options.map(option => <button key={option.key} aria-pressed={choice?.key === option.key} onClick={() => onChoose(option)}><span>{option.pinyin}</span>{option.disclosesCode && option.entry && <span className="text-choice-code">{soundOnly ? option.entry.fullCode.slice(0, 2) : option.entry.fullCode}</span>}{!option.entry && <small>仅读音</small>}</button>)}</div>
    {options.some(option => option.disclosesCode) && <p className="text-choice-note">同一读音有不同编码，选择时会显示编码；本次按使用协助记录。</p>}
    {!choice && <p className="text-choice-note" role="status">先选择本处读音，再开始输入{soundOnly ? '双拼两码' : '四码'}。</p>}
    {choice && !activeEntry && <p className="text-choice-note" role="status">{soundOnly ? '此读音暂无法按当前双拼映射练习。' : '此读音尚无可靠四码。'}按空格、Enter 或「下一字」跳过，也可以选择其他读音。</p>}
  </div>

  useEffect(() => {
    const viewport = viewportRef.current
    const current = viewport?.querySelector<HTMLElement>('[aria-current="location"]')
    if (!viewport) return
    if (!current) { viewport.scrollTop = 0; return }
    const top = current.offsetTop
    viewport.scrollTop = Math.max(0, top - viewport.clientHeight / 2 + current.offsetHeight / 2)
  }, [pageIndex, activeTokenIndex])

  return <section className="text-context" aria-label="自定义文本练习">
    <div className="text-context-heading"><h2>自定义文本</h2><div><button onClick={onEdit}>编辑文本</button><button onClick={onClear}>清除文本</button></div></div>
    <div className="text-context-summary"><span>{document.counts.trainable.toLocaleString()} 个可练习字 · {document.counts.unavailable.toLocaleString()} 个暂无可用编码</span><span>原文保留标点、英文和数字</span></div>
    <p id={helpId} className="text-context-help">{soundOnly ? '输入两码后按空格确认下一字；点击原文可跳转，虚线字可查读音。' : '输入编码后按空格确认下一字；点击原文可跳转，虚线字可查询。'}</p>
    <div className="text-original" role="region" aria-label="练习原文" aria-describedby={helpId} tabIndex={0} ref={viewportRef}>
      {page && document.tokens.slice(page.startToken, page.endToken).map(token => {
        if (token.kind === 'literal') return token.value
        const target = targetIndices.get(token.index)
        if (token.kind === 'unavailable' || target === undefined) return <button key={token.index} className="text-character is-unavailable" data-token-index={token.index} aria-label={`${token.value}：查询此字，暂无可用${soundOnly ? '双拼' : '编码'}，已跳过训练`} onClick={() => onInspect(token.value)}><GlyphText text={token.value} /></button>
        const current = token.index === activeTokenIndex
        return <button key={token.index} className={`text-character ${current ? 'is-current' : ''}`} data-token-index={token.index} data-target-index={target} aria-label={`跳到第 ${target + 1} 个可练习字 ${token.value}`} aria-current={current ? 'location' : undefined} onClick={() => onJump(target)}><GlyphText text={token.value} /></button>
      })}
    </div>
    <GlyphStatus state={glyphs} label="本页原文" />
    {document.pages.length > 1 && <div className="text-pagination"><div><button onClick={() => onPageChange(pageIndex - 1)} disabled={pageIndex <= 0} aria-label="原文上一页">上一页</button><label className="text-page-label" htmlFor={pageId}>原文页码</label><select id={pageId} aria-label="原文页码" value={pageIndex} onChange={event => onPageChange(Number(event.target.value))}>{document.pages.map((_, index) => <option key={index} value={index}>{index + 1} / {document.pages.length}</option>)}</select><button onClick={() => onPageChange(pageIndex + 1)} disabled={pageIndex >= document.pages.length - 1} aria-label="原文下一页">下一页</button></div>{activePageIndex !== pageIndex && <button onClick={() => onPageChange(activePageIndex)}>回到当前字</button>}</div>}
    {isAmbiguous && (automaticChoice && choice ? <details key={activeTokenIndex} className="text-automatic-choice" ref={choicesRef}>
      <summary onClick={event => {
        // Record assistance before the native toggle exposes any code choices.
        if (!(event.currentTarget.parentElement as HTMLDetailsElement).open) onRevealChoices?.()
      }} onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') event.stopPropagation() }}>读音已自动选择 · 更改<span>{choice.pinyin}</span></summary>
      {readingChoices}
    </details> : readingChoices)}
  </section>
}
