import { getCodeSlots, getSlotState, type TrainingState } from '../domain'
import { Icon } from './Icon'
import { shapeDisplayLabel } from '../domain/shape-teaching'
import type { LearningLevel } from '../domain/learning-level'

export function CodeSlots({ state, selectedSlot, onSelect, compact = false, level = 'yinxing' }: { state: TrainingState; selectedSlot: number | null; onSelect: (position: number) => void; compact?: boolean; level?: LearningLevel }) {
  const allSlots = getCodeSlots(state.entry)
  const slots = level === 'shuangpin' ? allSlots.slice(0, 2) : allSlots
  return <div className="code-slots" role="group" aria-label={level === 'shuangpin' ? '两个双拼编码位置' : '四个编码位置'}>
    {slots.map((slot, position) => {
      const status = getSlotState(state, slot.position)
      const targetIndex = state.positions.indexOf(slot.position)
      const provided = targetIndex < 0
      const accepted = !provided && targetIndex < state.accepted.length
      const active = !state.completed && targetIndex === state.accepted.length
      const visible = provided || accepted || state.hintLevel === 4 || (active && state.hintLevel >= 3)
      const wrong = state.error?.position === position
      const valueVisible = provided || accepted || state.hintLevel === 4 || (active && state.hintLevel >= 2)
      const displayedKey = wrong ? state.error!.input : visible ? slot.key : ''
      const displayValue = slot.position >= 2 ? shapeDisplayLabel(slot.value) : slot.value
      return <button key={slot.type} className={`code-slot ${active ? 'current' : ''} ${wrong ? 'incorrect' : ''} ${accepted ? 'correct' : ''} ${provided ? 'provided' : ''} ${selectedSlot === position ? 'selected' : ''}`} data-state={status} aria-label={compact ? `${displayedKey || '·'}${slot.label}；第${position + 1}码，${wrong ? '输入错误' : provided ? '本关无需输入' : accepted ? '已正确输入' : '等待输入'}${valueVisible ? `，内容 ${displayValue}` : ''}，点击查看解释` : `0${position + 1}${displayedKey || '·'}${slot.label}${valueVisible ? displayValue : '—'}${provided ? '已提供' : ''}；第${position + 1}码，${wrong ? '输入错误' : provided ? '本关无需输入' : accepted ? '已正确输入' : '等待输入'}，点击查看解释`} onClick={() => onSelect(position)}>
        <span className="slot-number" aria-hidden="true">0{position + 1}</span>
        <span className={`slot-key ${visible ? '' : 'concealed'}`} aria-hidden={!displayedKey}>{displayedKey || '·'}</span>
        <span className="slot-label">{slot.label}</span>
        <span className="slot-value" aria-hidden={!valueVisible}>{valueVisible ? displayValue : '—'}</span>
        {provided && <span className="slot-provided">已提供</span>}
        {accepted && <span className="slot-check"><Icon name="check" size={12} /></span>}
      </button>
    })}
  </div>
}
