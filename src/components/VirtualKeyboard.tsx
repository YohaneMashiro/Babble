import { LEARNING_KEY_DEFINITIONS as KEY_DEFINITIONS } from '../data/library'
import { getCodeSlots, type TrainingState } from '../domain'
import { currentCodePosition } from '../domain/training'
import { Icon } from './Icon'
import { shapeDisplayLabel } from '../domain/shape-teaching'
import type { LearningLevel } from '../domain/learning-level'

export type KeyboardView = 'sound' | 'shape' | 'all'
const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']

export function VirtualKeyboard({ state, view, onViewChange, pressedKey, selectedKey, onInspect, onType, onHint, onReset, onNext, textMode = false, level = 'yinxing' }: {
  state: TrainingState; view: KeyboardView; onViewChange: (view: KeyboardView) => void; pressedKey: string | null; selectedKey: string | null; onInspect: (key: string | null) => void; onType: (key: string) => void; onHint: () => void; onReset: () => void; onNext: () => void; textMode?: boolean; level?: LearningLevel
}) {
  const soundOnly = level === 'shuangpin'
  const activeView = soundOnly ? 'sound' : view
  const allSlots = getCodeSlots(state.entry)
  const slots = soundOnly ? allSlots.slice(0, 2) : allSlots
  const position = currentCodePosition(state)
  const current = position === undefined ? undefined : slots[position]
  const targetKey = state.hintLevel >= 3 ? current?.key : undefined
  const selected = KEY_DEFINITIONS.find(item => item.key === selectedKey)

  return <section className="keyboard-section" aria-label="交互式虚拟键盘">
    <div className="keyboard-heading"><span><Icon name="keyboard" size={17} /> 键位，一起记住</span>{!soundOnly && <div className="keyboard-views" role="group" aria-label="键盘映射显示">
      {(['sound', 'shape', 'all'] as const).map((item, index) => <button key={item} aria-pressed={view === item} onClick={() => onViewChange(item)}>{['音', '形', '全部'][index]}</button>)}
    </div>}</div>
    <div className="keyboard">
      {rows.map((row, rowIndex) => <div className={`keyboard-row row-${rowIndex}`} key={row}>
        {Array.from(row).map(key => {
          const definition = KEY_DEFINITIONS.find(item => item.key === key)!
          const context = slots.filter(slot => {
            const targetIndex = state.positions.indexOf(slot.position)
            return targetIndex >= 0 && slot.key === key && (targetIndex < state.accepted.length || state.hintLevel === 4 || (slot.position === position && state.hintLevel >= 3))
          })
          const sound = [...definition.initials, ...definition.finals].join(' / ')
          const shape = definition.shapeRoots.map(root => root.label ?? root.root).join(' ')
          const subtitle = activeView === 'sound' ? sound : activeView === 'shape' ? shape : [sound, shape].filter(Boolean).join(' · ')
          const wrong = state.error?.input === key
          return <div key={key} className={`keyboard-key ${pressedKey === key ? 'pressed' : ''} ${key === targetKey ? 'target' : ''} ${context.length ? 'context-key' : ''} ${wrong ? 'wrong-key' : ''} ${selectedKey === key ? 'inspected' : ''}`}>
            <button className="type-key" onClick={event => { onType(key); if (textMode) event.currentTarget.blur() }} aria-label={`输入 ${key}`}><span>{key}</span></button>
            {subtitle && <span className="key-mapping">{subtitle}</span>}
            <button className="inspect-key" onClick={() => onInspect(selectedKey === key ? null : key)} aria-label={`查看 ${key} 键含义`} title={`查看 ${key} 键含义`}>·</button>
            {(key === 'F' || key === 'J') && <i className="home-mark" />}
          </div>
        })}
      </div>)}
      <div className="keyboard-row function-row"><button className="function-key" onClick={event => { onReset(); if (textMode) event.currentTarget.blur() }}><Icon name="reset" size={14} /><span>重置</span><kbd>⌫</kbd></button><button className="space-key" onClick={textMode ? onNext : onHint}>空格<span>{textMode ? '确认／下一字' : '下一层提示'}</span></button><button className="function-key" onClick={onNext}><span>{state.completed ? '下一字' : '跳过此字'}</span><kbd>↵</kbd></button></div>
    </div>
    {selected && <div className="key-inspector"><strong className="key-badge">{selected.key}</strong><div><strong>当前字中的含义</strong><p>{slots.filter(slot => slot.key === selected.key).map(slot => `${slot.label} ${slot.position >= 2 ? shapeDisplayLabel(slot.value) : slot.value}`).join('；') || '当前字不使用这个键。'}</p><details className="key-all-mappings"><summary>查看此键已收录的映射</summary><p>声母：{selected.initials.join('、') || '无'}<br />韵母：{selected.finals.join('、') || '无'}</p>{!soundOnly && <><dl className="shape-root-positions">{(['first', 'last'] as const).map(position => <div key={position}><dt>{position === 'first' ? '已核验首形用法' : '已核验末形用法'}</dt><dd>{selected.shapeRoots.filter(root => root.usages?.some(usage => usage.position === position)).map(root => `${shapeDisplayLabel(root.root)}${root.kind === 'stroke' ? '［笔画］' : '［字根］'}`).join('、') || '本题库未收录'}</dd></div>)}</dl><small>按本库条目的实际首／末位置分类；笔画保留原始符号。当前字的根见上方，其他映射不代表本字也采用它们。</small><details><summary>查看这些用法的来源</summary><ul>{selected.shapeRoots.map(root => <li key={root.root}>{shapeDisplayLabel(root.root)}：{root.usages?.map(usage => `${usage.position === 'first' ? '首' : '末'}形（如 ${usage.exampleCharacters.join('、')}）；${usage.sourceIds.join('、')}`).join(' / ')}</li>)}</ul></details><p><small>声韵表已核对；字形仅覆盖当前已核验题库，尚不代表全部鹤形字根。</small></p></>}{soundOnly && <p><small>零声母音节使用专门的两键规则，当前字的具体音节可点击码位或汉字查看。</small></p>}</details></div><button className="icon-button" onClick={() => onInspect(null)} aria-label="收起键位说明"><Icon name="close" size={16} /></button></div>}
    <p className="keyboard-note">直接按键输入，或点击键帽。点击键帽右下角的 <span>·</span> 查看映射。</p>
  </section>
}
