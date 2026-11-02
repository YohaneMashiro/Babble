import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { readUserLibraryFile, type UserCodeTarget, type UserLibraryParseResult } from '../domain/user-library'
import { clearUserLibrary, loadUserLibrary, saveUserLibrary } from '../state/user-library-storage'
import '../styles/user-library.css'

interface UserLibraryImportProps {
  onApply: (entries: readonly UserCodeTarget[]) => void
  currentEntries?: readonly UserCodeTarget[]
  onClose?: () => void
  /** App can restore the independent store at startup and pass false here. */
  autoRestore?: boolean
}

export function UserLibraryImport({ onApply, currentEntries, onClose, autoRestore = true }: UserLibraryImportProps) {
  const [active, setActive] = useState<readonly UserCodeTarget[]>(currentEntries ?? [])
  const [pending, setPending] = useState<UserLibraryParseResult | null>(null)
  const [persist, setPersist] = useState(false)
  const [busy, setBusy] = useState(false)
  const [restoring, setRestoring] = useState(true)
  const [savedState, setSavedState] = useState<'absent' | 'present' | 'unavailable'>('absent')
  const [status, setStatus] = useState({ message: '', error: false })
  const sequence = useRef(0), callback = useRef(onApply), mounted = useRef(false)
  const activeEntries = useRef(currentEntries ?? active)
  callback.current = onApply
  activeEntries.current = currentEntries ?? active
  const fileId = useId(), helpId = useId(), statusId = useId()
  const entries = currentEntries ?? active

  useEffect(() => {
    mounted.current = true
    const request = sequence.current
    loadUserLibrary().then(stored => {
      if (!mounted.current || request !== sequence.current) return
      setSavedState(stored ? 'present' : 'absent')
      if (stored && autoRestore && !activeEntries.current.length) {
        setActive(stored); callback.current(stored)
        setStatus({ message: `已恢复当前浏览器保存的 ${stored.length.toLocaleString()} 条用户字库编码。`, error: false })
      }
    }).catch(() => {
      if (mounted.current && request === sequence.current) {
        setSavedState('unavailable')
        setStatus({ message: '本机字库存储不可用或格式无法恢复，原记录仍保留。仍可在本次页面导入。', error: true })
      }
    }).finally(() => { if (mounted.current && request === sequence.current) setRestoring(false) })
    return () => { mounted.current = false; sequence.current++ }
    // Restoration is one operation per mount. callback is kept current above.
  }, [])

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const request = ++sequence.current
    setBusy(true); setPending(null); setStatus({ message: `正在读取「${file.name}」……`, error: false })
    try {
      const result = await readUserLibraryFile(file)
      if (!mounted.current || request !== sequence.current) return
      setPending(result); setPersist(false)
      setStatus({ message: `已读取 ${result.counts.characters.toLocaleString()} 字、${result.counts.entries.toLocaleString()} 条编码，应用后生效。`, error: false })
    } catch (error) {
      if (mounted.current && request === sequence.current) setStatus({ message: error instanceof Error ? error.message : '无法读取字库，原字库保持不变。', error: true })
    } finally { if (mounted.current && request === sequence.current) setBusy(false) }
  }

  async function apply() {
    if (!pending || busy) return
    const request = ++sequence.current
    const selected = pending
    setBusy(true)
    // Applying is the explicit user action. Keep it effective even if the
    // dialog closes while the optional persistence transaction is finishing.
    setActive(selected.entries); callback.current(selected.entries); setPending(null)
    setStatus({ message: '已用于本次页面，正在更新所选的本机保存方式……', error: false })
    let storageMessage = '仅本次页面使用，刷新后清除。'
    let storageError = false
    try {
      if (persist) {
        try { await saveUserLibrary(selected.entries); if (mounted.current && request === sequence.current) setSavedState('present'); storageMessage = '已保存在当前浏览器，可刷新恢复。' }
        catch { storageError = true; storageMessage = '本次页面可用，但未能保存；原存储记录仍保留。' }
      } else if (savedState !== 'absent') {
        try { await clearUserLibrary(); if (mounted.current && request === sequence.current) setSavedState('absent') }
        catch { storageError = true; storageMessage = '本次页面已临时替换；旧存储未能清除，刷新可能恢复旧库。' }
      }
      if (!mounted.current || request !== sequence.current) return
      setStatus({ message: `已应用 ${selected.entries.length.toLocaleString()} 条用户字库编码。${storageMessage}`, error: storageError })
    } finally { if (mounted.current && request === sequence.current) setBusy(false) }
  }

  async function clear() {
    if (busy) return
    const request = ++sequence.current
    setBusy(true)
    setPending(null); setActive([]); callback.current([]); setPersist(false)
    let error = false
    try { await clearUserLibrary(); if (mounted.current && request === sequence.current) setSavedState('absent') }
    catch { error = true }
    if (mounted.current && request === sequence.current) {
      setStatus({ message: error ? '本次页面的用户字库已移除；未能清除旧存储，刷新可能恢复旧库。' : '已清除本机用户字库。内置字库和学习记录保留。', error })
      setBusy(false)
    }
  }

  const skipped = pending && pending.counts.skippedWords + pending.counts.skippedNonHan + pending.counts.skippedShortCodes + pending.counts.skippedUnsupportedCodes
  return <section className="user-library-import" aria-label="本地字库导入">
    <h3>本地字库</h3>
    <p>导入你使用的明文字库。用户编码单独标明来源，内置已核验编码优先；文件不会上传。</p>
    <label htmlFor={fileId}>选择字库文件</label>
    <input id={fileId} type="file" accept=".txt,.tsv,.ini,.yaml,.yml,text/plain" disabled={busy || restoring} onChange={chooseFile} aria-describedby={`${helpId} ${statusId}`} />
    <p id={helpId} className="user-library-help">UTF-8 · 最大 16 MiB、200,000 行。支持单字四码与 OK 六／八码；词语、简码及其他编码会分别跳过。Rime 文件只读取「...」之后的数据，不执行配置。</p>
    <p className="user-library-current">当前用户字库：{entries.length.toLocaleString()} 条{entries.length ? `，来源「${entries[0].sourceLabel}」` : ''}。</p>
    {pending && <div className="user-library-preview">
      <p>「{pending.entries[0].sourceLabel}」：准备应用 {pending.counts.characters.toLocaleString()} 字、{pending.counts.entries.toLocaleString()} 条编码。{pending.counts.duplicates ? `合并 ${pending.counts.duplicates.toLocaleString()} 条重复记录。` : ''}{skipped ? `跳过 ${skipped.toLocaleString()} 条词语、简码或不支持的记录。` : ''}</p>
      <label className="user-library-persist"><input type="checkbox" checked={persist} onChange={event => setPersist(event.target.checked)} disabled={busy} />保存在当前浏览器</label>
      <p className="user-library-help">默认仅本次使用。应用新库会替换之前的本机用户字库；练习文章仍不保存。</p>
      <button type="button" className="primary-button" onClick={apply} disabled={busy || restoring}>应用用户字库</button>
    </div>}
    <p id={statusId} role="status" aria-live="polite" className={`user-library-status ${status.error ? 'is-error' : ''}`}>{restoring ? '正在检查本机字库……' : status.message}</p>
    <div className="user-library-actions"><button type="button" className="subtle-button" onClick={clear} disabled={busy || restoring || (!entries.length && savedState === 'absent' && !pending)}>清除本机用户字库</button>{onClose && <button type="button" className="subtle-button" onClick={onClose}>关闭</button>}</div>
    <p className="dialog-note">用户提供编码不代表已核验读音或取形，字库中的字母不会被倒推为拼音或字根。</p>
  </section>
}
