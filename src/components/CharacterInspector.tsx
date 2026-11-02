import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { getCodeSlots, plainPinyin, type CharacterEntry, type CharacterLookup, type DataProvenance } from '../domain'
import { Dialog } from './Dialog'
import { ShapeExplanation } from './ShapeExplanation'
import { shapeDisplayLabel } from '../domain/shape-teaching'
import '../styles/inspector.css'
import type { AuxiliaryTarget } from '../domain/auxiliary'
import { loadComponentSpellings } from '../data/component-spelling'
import { isHanCharacter } from '../domain/han'
import { useGlyphFont } from '../hooks/useGlyphFont'
import { GlyphStatus, GlyphText } from './GlyphSupport'
import type { LearningLevel } from '../domain/learning-level'

interface CharacterInspectorProps {
  level?: LearningLevel
  lookup: (char: string) => CharacterLookup
  search: (query: string) => readonly CharacterLookup[]
  initialChar: string
  onTrain: (entry: CharacterEntry) => void
  onInspectCharacter?: (char: string) => void
  userTargets?: ReadonlyMap<string, readonly AuxiliaryTarget[]>
  onTrainAuxiliary?: (target: AuxiliaryTarget) => void
  onClose: () => void
}

function ExtendedCodeDetails({ char, automatically, userTargets, onTrain }: { char: string; automatically: boolean; userTargets: readonly AuxiliaryTarget[]; onTrain?: (target: AuxiliaryTarget) => void }) {
  const [request, setRequest] = useState(automatically ? 1 : 0)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [targets, setTargets] = useState<readonly AuxiliaryTarget[]>([])
  const [candidatesOpen, setCandidatesOpen] = useState(false)
  useEffect(() => {
    if (!request || !isHanCharacter(char)) return
    let alive = true
    setStatus('loading')
    void loadComponentSpellings([char]).then(result => { if (alive) { setTargets(result.get(char) ?? []); setStatus('ready') } }).catch(() => { if (alive) setStatus('error') })
    return () => { alive = false }
  }, [char, request])
  const confirmed = targets.filter(target => target.confirmed), candidates = targets.filter(target => !target.confirmed)
  const glyphs = useGlyphFont([...confirmed, ...(candidatesOpen ? candidates : [])].flatMap(target => target.parts.map(part => part.part)).join(''))
  return <section className="inspector-extra-codes" aria-label="部件拼字与本机编码">
    {userTargets.length > 0 && <div className="user-code-results"><h4>本机字库编码</h4><p>用户提供的编码独立练习，保留原有已核验四码；不推断本字读音或取形。</p>{userTargets.map(target => <article key={`${target.sourceId}:${target.code}`}><p><strong>{target.code}</strong> · {target.sourceLabel}</p>{onTrain && <button className="subtle-button" onClick={() => onTrain(target)}>练习用户编码 · {target.code}</button>}</article>)}</div>}
    {status === 'idle' && <button className="subtle-button" onClick={() => setRequest(value => value + 1)}>查看部件拼字</button>}
    {status === 'loading' && <p className="component-data-status" role="status" data-status="loading">正在加载此字的拼字资料…</p>}
    {status === 'error' && <div className="component-data-status" role="status" data-status="error"><p>拼字资料暂时无法加载。当前查询和练习保持不变。</p><button className="subtle-button" onClick={() => setRequest(value => value + 1)}>重试加载拼字资料</button></div>}
    {status === 'ready' && <div className="component-spelling-results" data-status="ready"><h4>部件拼字</h4><p>OK 引导加两／三个部件的双拼，共 6／8 键。这里的部件读音不是本字读音。</p>{confirmed.map(target => <article className="component-spelling-option" data-confirmed="true" key={target.code}><strong>{target.code}</strong><p><GlyphText text={target.parts.map(part => `${part.part}（${part.pinyin} → ${part.code}）`).join(' ＋ ')} /></p><small>与固定官方来源社区参照逐字码对一致 · 部件来源行 {target.sourceLine}</small>{onTrain && <button className="primary-button" onClick={() => onTrain(target)}>练习部件拼字 · {target.code}</button>}</article>)}{!confirmed.length && <p>此字暂没有通过当前参照核对的拼字码。</p>}{candidates.length > 0 && <details className="component-candidates" onToggle={event => setCandidatesOpen(event.currentTarget.open)}><summary>查看独立候选（不作为默认正确答案）</summary><p>以下候选尚未通过此参照核对，可能与参照不同或位于参照之外；仅供查询，不进入正式评分。</p>{candidates.map(target => <p key={target.code}><strong>{target.code}</strong> · <GlyphText text={target.parts.map(part => `${part.part}（${part.pinyin}）`).join(' ＋ ')} /></p>)}</details>}<GlyphStatus state={glyphs} label="查询部件" /><details><summary>拼字资料来源</summary><p>部件序列与助记读音来自有来源清单的开源资料，Unicode 读音和公开部件归类分别注明。按固定策略独立生成后才与参照比较。</p><p><a href="https://github.com/mirtlecn/rime-radical-pinyin/tree/87e73d7182916f3db9dbc0b6a4d18a78a775b298" target="_blank" rel="noreferrer">固定部件数据与许可 ↗</a> · <a href="https://flypy.cc/help/#/pc" target="_blank" rel="noreferrer">官方 OK 拼字说明 ↗</a></p></details></div>}
  </section>
}

function entryKey(entry: CharacterEntry): string {
  return `${entry.pronunciation.pinyin}:${entry.fullCode}`
}

function linkUrl(value?: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch { return undefined }
}

function SourceDetails({ sources }: { sources: readonly DataProvenance[] }) {
  const unique = sources.filter((source, index) => sources.findIndex(item =>
    `${item.id ?? item.source}:${item.version ?? ''}:${item.sourceUrl ?? ''}` === `${source.id ?? source.source}:${source.version ?? ''}:${source.sourceUrl ?? ''}`) === index)
  if (!unique.length) return <p className="inspector-empty-source">当前没有可展示的来源记录。</p>

  return <details className="inspector-sources">
    <summary>数据来源 · {unique.length} 项</summary>
    {unique.map(source => {
      const url = linkUrl(source.sourceUrl)
      const licenseUrl = linkUrl(source.licenseUrl)
      return <article className="inspector-source" key={`${source.id ?? source.source}:${source.version ?? ''}:${source.sourceUrl ?? ''}`}>
        <h4>{url ? <a href={url} target="_blank" rel="noreferrer">{source.source} ↗</a> : source.source}</h4>
        <dl>
          <div><dt>作者</dt><dd>{source.author}</dd></div>
          <div><dt>许可</dt><dd>{licenseUrl ? <a href={licenseUrl} target="_blank" rel="noreferrer">{source.license} ↗</a> : source.license}</dd></div>
          {source.version && <div><dt>版本</dt><dd>{source.version}</dd></div>}
          <div><dt>获取日期</dt><dd>{source.retrievedAt}</dd></div>
          <div><dt>转换情况</dt><dd>{source.modified ? '已作格式转换或整理' : '保留来源数据'}</dd></div>
          {source.checksum && <div><dt>校验值</dt><dd className="inspector-checksum">{source.checksum}</dd></div>}
        </dl>
        {source.notes && <p>{source.notes}</p>}
      </article>
    })}
  </details>
}

function EntryDetails({ entry, onTrain }: { entry: CharacterEntry; onTrain: (entry: CharacterEntry) => void }) {
  const slots = getCodeSlots(entry)
  return <>
    <div className="inspector-code-summary">
      <div><span>双拼</span><strong>{entry.fullCode.slice(0, 2)}</strong></div>
      <div><span>双形</span><strong>{entry.fullCode.slice(2)}</strong></div>
      <div><span>完整四码</span><strong>{entry.fullCode}</strong></div>
    </div>
    {entry.codeEvidence && <p className="inspector-code-evidence">{entry.codeEvidence.kind === 'published-and-compared' ? '发布全码与现代读音已核对' : '独立规则推导与全码已核对'} · {entry.shape ? '首末端点有依据，完整教学范围另列' : '首末形解释待补'}</p>}
    <ol className="inspector-slots" aria-label="四码逐位解释">
      {slots.map(slot => <li key={slot.type}>
        <span className="inspector-slot-position">0{slot.position + 1} · {slot.label}</span>
        <strong>{slot.key}</strong><span className="inspector-slot-value">{slot.position >= 2 ? shapeDisplayLabel(slot.value) : slot.value}</span>
      </li>)}
    </ol>
    <section className="inspector-shape" aria-label="汉字取形说明">
      <h4>取形说明</h4>
      <ShapeExplanation entry={entry} />
      {entry.notes?.filter(note => note.startsWith('首形查找路径') || note.startsWith('末形查找路径')).map((note, index) => <p key={index}>{note}</p>)}
      {entry.notes?.filter(note => note.startsWith('笔画归类：') || note.startsWith('Unicode 等价部件：')).map((note, index) => <p key={`normalization:${index}`}>{note}</p>)}
      {entry.notes?.filter(note => note.includes('零声母') || note.startsWith('ü ') || note.startsWith('j/q/x/y')).map((note, index) => <p key={index}>{note}</p>)}
      {entry.notes?.filter(note => note.startsWith('规则依据：') || note.startsWith('笔画范围：')).map((note, index) => <p key={`curated:${index}`}>{note}</p>)}
      <details className="inspector-trace-detail"><summary>查看源拆分记录</summary>
        {entry.shape?.decomposition?.length ? <p><span className="inspector-decomposition">{entry.shape.decomposition.join(' · ')}</span></p> : <p>当前来源未提供完整的逐部件拆分。</p>}
        <p>查找路径和源树记录取形依据，不代表笔顺或完整教学拆分。</p>
      </details>
    </section>
    <button className="primary-button inspector-train" onClick={() => onTrain(entry)}>练习「{entry.char}」· {entry.pronunciation.pinyin} · {entry.fullCode}</button>
  </>
}

function SoundEntryDetails({ entry, onTrain }: { entry: CharacterEntry; onTrain: (entry: CharacterEntry) => void }) {
  const slots = getCodeSlots(entry).slice(0, 2)
  return <>
    <div className="inspector-code-summary"><div><span>小鹤双拼</span><strong>{entry.fullCode.slice(0, 2)}</strong></div></div>
    <ol className="inspector-slots" aria-label="双拼两码逐位解释">
      {slots.map(slot => <li key={slot.type}>
        <span className="inspector-slot-position">0{slot.position + 1} · {slot.label}</span>
        <strong>{slot.key}</strong><span className="inspector-slot-value">{slot.value}</span>
      </li>)}
    </ol>
    {slots.map(slot => <p key={slot.type}>{slot.explanation}</p>)}
    {entry.notes?.filter(note => note.includes('零声母') || note.startsWith('ü ') || note.startsWith('j/q/x/y')).map((note, index) => <p key={index}>{note}</p>)}
    <button className="primary-button inspector-train" onClick={() => onTrain(entry)}>练习双拼「{entry.char}」· {entry.pronunciation.pinyin} · {entry.fullCode.slice(0, 2)}</button>
  </>
}

export function CharacterInspector({ lookup, search, initialChar, onTrain, onInspectCharacter, userTargets, onTrainAuxiliary, onClose, level = 'yinxing' }: CharacterInspectorProps) {
  const soundOnly = level === 'shuangpin'
  const inputId = useId()
  const helperId = useId()
  const [query, setQuery] = useState(initialChar)
  const [selectedChar, setSelectedChar] = useState(initialChar)
  const [selection, setSelection] = useState<{ char: string; key: string } | null>(null)
  const results = useMemo(() => {
    const original = [...search(query)]
    const normalized = query.trim().toUpperCase()
    if (!soundOnly && /^[A-Z]+$/.test(normalized) && userTargets) for (const [char, entries] of userTargets) {
      if (original.length >= 36) break
      if (!original.some(item => item.char === char) && entries.some(target => target.code.startsWith(normalized))) original.push(lookup(char))
    }
    return original
  }, [query, search, lookup, userTargets, soundOnly])
  const activeChar = results.some(result => result.char === selectedChar) ? selectedChar : results[0]?.char
  const active = activeChar ? lookup(activeChar) : null
  const glyphs = useGlyphFont(results.map(result => result.char).join(''))
  const readingOnly = active?.readings.filter(reading => !active.entries.some(entry => plainPinyin(entry.pronunciation.pinyin) === plainPinyin(reading))) ?? []
  const defaultEntry = active?.entries.length === 1 && !readingOnly.length ? active.entries[0] : null
  const selectedKey = selection && selection.char === activeChar ? selection.key : defaultEntry ? entryKey(defaultEntry) : null
  const entry = active?.entries.find(item => entryKey(item) === selectedKey) ?? null
  const selectedReadingOnly = selectedKey?.startsWith('reading:') ? selectedKey.slice(8) : null
  const choicesCount = (active?.entries.length ?? 0) + readingOnly.length
  const sources = active ? entry ? [...(entry.sources ?? [entry.provenance]), ...active.sources] : active.sources : []

  function selectCharacter(char: string) {
    onInspectCharacter?.(char)
    setSelectedChar(char)
    setSelection(null)
  }

  function changeQuery(value: string) {
    const nextResults = search(value)
    const nextChar = nextResults.some(result => result.char === selectedChar) ? selectedChar : nextResults[0]?.char
    // Record disclosure in the same event that makes an answer visible.
    if (nextChar) onInspectCharacter?.(nextChar)
    setQuery(value)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (results[0]) selectCharacter(results[0].char)
  }

  return <Dialog title={soundOnly ? '查字与双拼' : '查字与编码'} onClose={onClose} wide>
    <div className="character-inspector">
      <form className="inspector-search" onSubmit={submit}>
        <label htmlFor={inputId}>{soundOnly ? '汉字、拼音或双拼编码' : '汉字、拼音或编码'}</label>
        <div><input id={inputId} value={query} maxLength={500} autoComplete="off" spellCheck={false} placeholder={soundOnly ? '例如：某、学习、mou、MZ' : '例如：某、学习、mou、MZGM'} aria-describedby={helperId} onChange={event => changeQuery(event.target.value)} /><button type="submit">查询</button></div>
        <p id={helperId}>{soundOnly ? '可粘贴多个汉字逐字查看；用拼音或双拼两码查询读音与声韵键位。多音字请明确选择本次读音。' : '可粘贴多个汉字逐字查看；拼音或编码检索四码题库及本机导入库。生僻字可直接输入汉字查拼字。'}</p>
      </form>
      <div className="inspector-layout">
        <section className="inspector-result-section" aria-label="查询结果">
          <p className="inspector-result-count" role="status">{results.length ? `显示 ${results.length} 个字${results.length >= 36 ? '（可细化查询）' : ''}` : query.trim() ? '没有匹配结果' : '输入内容开始查询'}</p>
          <div className="inspector-results">
            {results.map(result => <button key={result.char} className={result.char === activeChar ? 'is-active' : ''} aria-pressed={result.char === activeChar} aria-label={soundOnly ? undefined : `${result.char} ${result.status === 'missing' ? '未收录' : result.status === 'pronunciation-only' ? '仅读音' : '可练习'}：查看读音与编码`} title={soundOnly ? '查看读音与双拼' : undefined} onClick={() => selectCharacter(result.char)}>
              <strong><GlyphText text={result.char} /></strong><span>{result.status === 'missing' ? '未收录' : result.status === 'pronunciation-only' ? '仅读音' : '可练习'}</span>
            </button>)}
          </div>
        </section>
        <section className="inspector-detail" aria-label="单字详情">
          <GlyphStatus state={glyphs} label="查询汉字" />
          {!active && <div className="inspector-empty"><p>{query.trim() ? '没有找到对应的汉字、拼音或编码。可以换一个词，或直接输入汉字。' : '输入想查的字，查看它的读音和编码。'}</p></div>}
          {active && <>
            <div className="inspector-character-heading">
              <button className="inspector-character" onClick={() => setSelection({ char: active.char, key: '' })} aria-label={`${active.char}：重新选择读音`}><GlyphText text={active.char} /></button>
              <div><h3><GlyphText text={active.char} />的读音与{soundOnly ? '双拼' : '编码'}</h3><p>{active.status === 'missing' ? '本地数据库尚未收录' : choicesCount > 1 ? '多读音，请明确选择本次要查看的读音。' : '查看每一码的含义，再开始练习。'}</p></div>
            </div>
            {active.status === 'missing' ? <div className="inspector-empty"><p>未找到「{active.char}」的{soundOnly ? '读音记录' : '读音或取形记录'}。可换一个汉字继续查询。</p></div> : <>
              <div className="inspector-reading-choices" role="group" aria-label="选择读音">
                {active.entries.map(item => <button key={entryKey(item)} aria-pressed={selectedKey === entryKey(item)} onClick={() => setSelection({ char: active.char, key: entryKey(item) })}><strong>{item.pronunciation.pinyin}</strong><span>{soundOnly ? item.fullCode.slice(0, 2) : item.fullCode}</span></button>)}
                {readingOnly.map(reading => <button key={`reading:${reading}`} aria-pressed={selectedKey === `reading:${reading}`} onClick={() => setSelection({ char: active.char, key: `reading:${reading}` })}><strong>{reading}</strong><span>仅读音</span></button>)}
              </div>
              {entry ? soundOnly ? <SoundEntryDetails entry={entry} onTrain={onTrain} /> : <EntryDetails entry={entry} onTrain={onTrain} /> : active.status === 'pronunciation-only' || selectedReadingOnly ? <div className="inspector-empty"><p>{selectedReadingOnly ? `「${active.char}」的 ${selectedReadingOnly} 读音可查。` : '已收录该字的读音。'}{soundOnly ? '此读音暂无法按当前小鹤双拼映射练习。' : '取形数据尚未收录，暂不提供四码训练。'}</p></div> : <p className="inspector-choice-prompt">{soundOnly ? '请选择一个读音，查看对应的两码与声韵说明。' : '请选择一个读音，查看对应的四码与取形说明。'}</p>}
            </>}
            {!soundOnly && <ExtendedCodeDetails key={active.char} char={active.char} automatically={!active.entries.length} userTargets={userTargets?.get(active.char) ?? []} onTrain={onTrainAuxiliary} />}
            <SourceDetails sources={sources} />
          </>}
        </section>
      </div>
    </div>
  </Dialog>
}
