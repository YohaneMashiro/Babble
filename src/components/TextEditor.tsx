import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from 'react'
import { DEFAULT_PRACTICE_TEXT } from '../data/practice-text'
import type { CharacterLookup } from '../domain/dictionary'
import { analyzeText, TEXT_HARD_CAP, TEXT_RECOMMENDED_HAN } from '../domain/text'
import { isHanCharacter } from '../domain/han'
import { Dialog } from './Dialog'
import type { LearningLevel } from '../domain/learning-level'
import { annotateContextualPinyin, getContextualPinyinStatus, loadContextualPinyin, subscribeContextualPinyin, type ContextualPinyinResult } from '../lib/contextual-pinyin'
import '../styles/text-trainer.css'

interface TextEditorProps {
  level?: LearningLevel
  initialText: string
  isEditing?: boolean
  lookup: (char: string) => CharacterLookup
  prepareLookup?: (text: string) => Promise<(char: string) => CharacterLookup>
  getPreprocessedPinyin?: (text: string) => ContextualPinyinResult | null
  onSubmit: (text: string, annotations?: ContextualPinyinResult | null) => void | Promise<void>
  onClose: () => void
}

const maxTextFileBytes = TEXT_HARD_CAP * 4 + 3

export function TextEditor({ initialText, isEditing = false, lookup, prepareLookup, getPreprocessedPinyin, onSubmit, onClose, level = 'yinxing' }: TextEditorProps) {
  const soundOnly = level === 'shuangpin'
  const [text, setText] = useState(initialText)
  const [readingFile, setReadingFile] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [preparationError, setPreparationError] = useState('')
  const [retry, setRetry] = useState(0)
  const [prepared, setPrepared] = useState<{ text: string; level: LearningLevel; lookup: (char: string) => CharacterLookup } | null>(null)
  const [uploadStatus, setUploadStatus] = useState<{ message: string; error: boolean }>({ message: '', error: false })
  const modelStatus = useSyncExternalStore(subscribeContextualPinyin, getContextualPinyinStatus, getContextualPinyinStatus)
  const [modelRequested, setModelRequested] = useState(false)
  const [annotations, setAnnotations] = useState<ContextualPinyinResult | null>(null)
  const [annotationFailure, setAnnotationFailure] = useState<{ text: string; message: string } | null>(null)
  const [annotationRetry, setAnnotationRetry] = useState(0)
  const [annotatingText, setAnnotatingText] = useState<string | null>(null)
  const [manualText, setManualText] = useState<string | null>(null)
  const annotationRequest = useRef(0)
  const annotationController = useRef<AbortController | null>(null)
  const fileRequest = useRef(0)
  const inputId = useId()
  const uploadId = useId()
  const uploadHelpId = useId()
  const uploadStatusId = useId()
  const helpId = useId()
  const statusId = useId()
  const activeLookup = prepared?.text === text && prepared.level === level ? prepared.lookup : lookup
  // The lookup can keep its identity while its lazy data cache is populated.
  // A completed preparation is therefore also a fresh analysis boundary.
  const analysis = useMemo(() => analyzeText(text, activeLookup), [text, activeLookup, prepared])
  const characterCount = analysis.status === 'valid' ? analysis.document.counts.characters : analysis.characters
  const document = analysis.status === 'valid' ? analysis.document : null
  const preprocessed = useMemo(() => {
    const result = getPreprocessedPinyin?.(text)
    return result?.text === text ? result : null
  }, [getPreprocessedPinyin, text])
  const hasPreprocessed = preprocessed !== null
  const manuallySelected = manualText === text
  const activeAnnotations = manuallySelected ? null : preprocessed ?? (annotations?.text === text ? annotations : null)
  const validForAnnotation = document !== null && document.counts.han > 0
  const failedAnnotation = annotationFailure?.text === text ? annotationFailure : null
  const automaticEnabled = modelRequested || modelStatus.phase === 'ready' || modelStatus.phase === 'loading'
  const waitingForAnnotation = validForAnnotation && !manuallySelected && !activeAnnotations && automaticEnabled && !failedAnnotation && modelStatus.phase !== 'error'
  const baseCanSubmit = Boolean(document?.counts.trainable) && !readingFile && !preparing && !preparationError
  const canSubmit = baseCanSubmit && !waitingForAnnotation
  const invalid = analysis.status === 'too-long' || Boolean(text.trim() && !document?.counts.trainable)

  useEffect(() => () => {
    fileRequest.current++
    annotationRequest.current++
    annotationController.current?.abort()
  }, [])

  useEffect(() => {
    const request = ++annotationRequest.current
    annotationController.current?.abort()
    annotationController.current = null
    if (!validForAnnotation || readingFile || hasPreprocessed || manuallySelected || modelStatus.phase !== 'ready' || annotations?.text === text) {
      setAnnotatingText(null)
      return
    }
    const controller = new AbortController()
    annotationController.current = controller
    setAnnotatingText(text)
    setAnnotationFailure(null)
    const timer = window.setTimeout(() => {
      void annotateContextualPinyin(text, { signal: controller.signal }).then(result => {
        if (request !== annotationRequest.current || controller.signal.aborted) return
        if (result.text !== text) throw new Error('自动注音结果与当前文本不一致，请重试。')
        setAnnotations(result)
      }).catch(() => {
        if (request === annotationRequest.current && !controller.signal.aborted) setAnnotationFailure({ text, message: '当前文本暂时无法完成自动注音，可以重试或手动选音练习。' })
      }).finally(() => {
        if (request === annotationRequest.current) setAnnotatingText(null)
      })
    }, 180)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
      if (annotationController.current === controller) annotationController.current = null
    }
  }, [text, validForAnnotation, readingFile, hasPreprocessed, manuallySelected, modelStatus.phase, annotations?.text, annotationRetry])

  useEffect(() => {
    const characters = Array.from(text)
    if (!prepareLookup || characters.length > TEXT_HARD_CAP || !characters.some(isHanCharacter)) { setPreparing(false); setPreparationError(''); return }
    let alive = true
    setPreparing(true); setPreparationError('')
    const timer = window.setTimeout(() => {
      void prepareLookup(text).then(value => { if (alive) setPrepared({ text, level, lookup: value }) }).catch(() => { if (alive) setPreparationError(soundOnly ? '读音资料暂时无法加载，文本保持不变。请重试。' : '拼字资料暂时无法加载，文本保持不变。请重试。') }).finally(() => { if (alive) setPreparing(false) })
    }, 120)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [text, prepareLookup, retry, level, soundOnly])

  function invalidateAnnotation() {
    annotationRequest.current++
    annotationController.current?.abort()
    annotationController.current = null
    setAnnotatingText(null)
  }

  function requestModel() {
    setModelRequested(true)
    void loadContextualPinyin().catch(() => { /* The shared status exposes retryable loading errors. */ })
  }

  function enableModel() {
    setManualText(null)
    setAnnotationFailure(null)
    setAnnotationRetry(value => value + 1)
    requestModel()
  }

  function startManually() {
    if (!baseCanSubmit) return
    invalidateAnnotation()
    setManualText(text)
    void onSubmit(text, null)
  }

  function editText(value: string) {
    fileRequest.current++
    invalidateAnnotation()
    setAnnotations(null)
    setAnnotationFailure(null)
    setManualText(null)
    setReadingFile(false)
    setUploadStatus({ message: '', error: false })
    setText(value)
  }

  async function readTextFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset the native field so selecting the same file again still fires change.
    event.target.value = ''
    const request = ++fileRequest.current
    setReadingFile(false)
    setUploadStatus({ message: '', error: false })
    if (!file) return
    if (!/\.txt$/i.test(file.name)) {
      setUploadStatus({ message: '请选择 .txt 文件。当前文本保持不变。', error: true })
      return
    }
    if (file.size > maxTextFileBytes) {
      setUploadStatus({ message: '文件过大，请选择不超过 20,000 字符的 UTF-8 TXT 文件。当前文本保持不变。', error: true })
      return
    }
    setReadingFile(true)
    invalidateAnnotation()
    setUploadStatus({ message: `正在读取「${file.name}」……`, error: false })
    try {
      const buffer = await file.arrayBuffer()
      if (request !== fileRequest.current) return
      if (buffer.byteLength > maxTextFileBytes) {
        setUploadStatus({ message: '文件实际内容过大，请选择不超过 20,000 字符的 UTF-8 TXT 文件。当前文本保持不变。', error: true })
        return
      }
      let value: string
      try {
        value = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
      } catch {
        setUploadStatus({ message: '文件不是有效的 UTF-8 文本，请转换编码后重试。当前文本保持不变。', error: true })
        return
      }
      if (Array.from(value).length > TEXT_HARD_CAP) {
        setUploadStatus({ message: '文件超过 20,000 字符，请精简后重试。当前文本保持不变，文件没有被截断。', error: true })
        return
      }
      setAnnotations(null)
      setAnnotationFailure(null)
      setManualText(null)
      setText(value)
      setUploadStatus({ message: `已载入「${file.name}」，可继续编辑。`, error: false })
    } catch {
      if (request === fileRequest.current) setUploadStatus({ message: '无法读取这个文件，请重新选择。当前文本保持不变。', error: true })
    } finally {
      if (request === fileRequest.current) setReadingFile(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canSubmit) void onSubmit(text, activeAnnotations)
  }

  return <Dialog title="自定义文本" onClose={onClose} wide>
    <form className="text-editor" onSubmit={submit}>
      <div className="text-editor-label"><label htmlFor={inputId}>练习文本</label><button type="button" onClick={() => editText(DEFAULT_PRACTICE_TEXT.text)}>填入《花园中》</button></div>
      <div className="text-editor-upload"><label htmlFor={uploadId}>上传 TXT 文件</label><input id={uploadId} type="file" accept=".txt,text/plain" onClick={requestModel} onChange={readTextFile} aria-invalid={uploadStatus.error || undefined} aria-describedby={`${uploadHelpId} ${uploadStatusId}`} /><span id={uploadHelpId}>UTF-8 · 最多 20,000 字符；首次启用自动注音约下载 175 MB</span></div>
      <p id={uploadStatusId} className={`text-editor-upload-status ${uploadStatus.error ? 'is-error' : ''}`} role="status" aria-live="polite">{uploadStatus.message}</p>
      <section className="text-annotation-status" aria-label="自动注音" data-phase={hasPreprocessed ? 'preprocessed' : activeAnnotations ? 'annotated' : manuallySelected ? 'manual' : modelStatus.phase} aria-busy={waitingForAnnotation || undefined}>
        {hasPreprocessed && !manuallySelected ? <p>示例读音已就绪，无需下载模型，可逐字修改。</p> : activeAnnotations ? <p>自动注音已就绪，可逐字修改。</p> : manuallySelected ? <p>本次使用手动选音，原文保持不变。</p> : modelStatus.phase === 'loading' ? <>
          <p role="status">{modelStatus.totalBytes ? `正在准备 g2pW 自动注音模型：${((modelStatus.loadedBytes ?? 0) / 1000000).toFixed(1)} / ${(modelStatus.totalBytes / 1000000).toFixed(1)} MB` : '正在准备 g2pW 自动注音模型…'}<span>模型在本机运行，原文不会上传。</span></p>
          {modelStatus.totalBytes !== undefined && modelStatus.totalBytes > 0 && <progress aria-label="自动注音模型下载进度" max={modelStatus.totalBytes} value={modelStatus.loadedBytes ?? 0} />}
        </> : annotatingText === text || waitingForAnnotation ? <>
          <p role="status">正在为当前文本自动注音…{modelStatus.total ? ` ${modelStatus.completed ?? 0} / ${modelStatus.total} 处` : ''}</p>
          {modelStatus.total !== undefined && modelStatus.total > 0 && <progress aria-label="当前文本自动注音进度" max={modelStatus.total} value={modelStatus.completed ?? 0} />}
        </> : modelStatus.phase === 'error' || failedAnnotation ? <p className="is-error" role="status">{failedAnnotation?.message ?? '自动注音模型暂时无法加载。原文保留，可以重试或手动选音练习。'}</p> : <p>上传 TXT 或启用自动注音时加载模型，原文在本机处理。</p>}
        {(!activeAnnotations || modelStatus.phase === 'loading') && !hasPreprocessed && <div className="text-annotation-actions">
          {modelStatus.phase !== 'loading' && annotatingText !== text && <button type="button" onClick={enableModel}>{modelStatus.phase === 'error' || failedAnnotation ? '重试 g2pW 自动注音' : '启用 g2pW 自动注音'}</button>}
          {(waitingForAnnotation || modelStatus.phase === 'error' || failedAnnotation) && <button type="button" disabled={!baseCanSubmit} onClick={startManually}>手动选音练习</button>}
        </div>}
      </section>
      <textarea id={inputId} value={text} onChange={event => editText(event.target.value)} spellCheck={false} autoFocus placeholder="粘贴练习文本…" aria-invalid={invalid || undefined} aria-describedby={`${helpId} ${statusId}`} />
      <div className="text-editor-count"><span>{characterCount.toLocaleString()} / {TEXT_HARD_CAP.toLocaleString()} 字符</span>{document && <span>{document.counts.han.toLocaleString()} 个汉字 · {document.counts.trainable.toLocaleString()} 个可练习</span>}</div>
      <p id={helpId} className="text-editor-help">推荐不超过 {TEXT_RECOMMENDED_HAN.toLocaleString()} 个汉字。标点、英文和数字保留原样；{soundOnly ? '没有可用双拼的字会标明，自动选读仍可逐字修改。' : '没有可用四码或拼字的字会标明，自动选读仍可逐字修改。'}</p>
      {(preparing || preparationError) && <div className="component-data-status" role="status" data-status={preparing ? 'loading' : 'error'}>{preparing ? soundOnly ? '正在准备本段文字的读音资料…' : '正在准备本段文字的拼字资料…' : preparationError}{preparationError && <button type="button" onClick={() => setRetry(value => value + 1)}>{soundOnly ? '重试加载读音资料' : '重试加载拼字资料'}</button>}</div>}
      <p id={statusId} className={`text-editor-status ${invalid ? 'is-error' : ''}`} role="status" aria-live="polite">
        {analysis.status === 'too-long' ? `超过 ${TEXT_HARD_CAP.toLocaleString()} 字符，请精简后再开始。内容没有被截断。` : preparing ? '资料就绪后再开始，不会把正在加载的字当作缺字。' : !text.trim() ? '输入文本后开始练习。' : !document?.counts.trainable ? '这段文本没有可练习的汉字。可以修改文本，或使用示例。' : document.exceedsRecommendation ? `长文本将按约 400 个可练习字分页。${document.counts.unavailable ? `另有 ${document.counts.unavailable} 个汉字暂无可用编码，将标明并跳过。` : ''}` : document.counts.unavailable ? `${document.counts.unavailable} 个汉字暂无可用编码，将标明并跳过。` : '文本已就绪，可以开始练习。'}
      </p>
      <div className="text-editor-actions"><button className="primary-button" type="submit" disabled={!canSubmit}>{isEditing ? '更新文本' : '开始练习'}</button><button className="subtle-button" type="button" onClick={onClose}>取消</button></div>
      <p className="dialog-note">你粘贴或上传的文本只在本次页面中使用，刷新后清除。文件在本机读取，不会上传，也不会写入本地学习记录；单字练习仍会累计到已有进度。</p>
    </form>
  </Dialog>
}
