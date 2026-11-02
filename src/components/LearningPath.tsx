import { useId } from 'react'
import type { Lesson, LessonGroup } from '../domain/lessons'
import type { ExperienceLevel, LessonProgress } from '../domain/progress'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import type { LearningLevel } from '../domain/learning-level'
import '../styles/learning-path.css'

interface LearningPathProps {
  level?: LearningLevel
  lessons: readonly Lesson[]
  groups: readonly { id: LessonGroup; title: string; description: string }[]
  activeLessonId: string | null
  progress: Readonly<Record<string, LessonProgress>>
  experience: ExperienceLevel
  onExperienceChange: (level: ExperienceLevel) => void
  onSelect: (lessonId: string) => void
  onClose: () => void
}

const startingPoints: Record<ExperienceLevel, string> = {
  new: 'intro',
  shuangpin: 'shape-intro',
  'some-shape': 'shape-keys',
  yinxing: 'practice-300',
}

const experienceOptions: readonly { value: ExperienceLevel; label: string }[] = [
  { value: 'new', label: '刚开始了解小鹤' },
  { value: 'shuangpin', label: '会小鹤双拼' },
  { value: 'some-shape', label: '会一些鹤形' },
  { value: 'yinxing', label: '已经使用小鹤音形' },
]

function lessonProgress(lesson: Lesson, progress: Readonly<Record<string, LessonProgress>>): LessonProgress {
  return progress[lesson.id] ?? {
    seen: 0, attempted: 0, mastered: 0, total: lesson.entries.length, lastEntryIndex: 0,
  }
}

export function LearningPath({ lessons, groups, activeLessonId, progress, experience, onExperienceChange, onSelect, onClose, level = 'yinxing' }: LearningPathProps) {
  const soundOnly = level === 'shuangpin'
  const experienceId = useId()
  const progressHelpId = useId()
  const active = lessons.find(lesson => lesson.id === activeLessonId)
  const activeProgress = active ? lessonProgress(active, progress) : null
  const recommended = lessons.find(lesson => !soundOnly && lesson.id === startingPoints[experience])
    ?? lessons.find(lesson => lesson.recommended)
    ?? lessons[0]

  return <Dialog title="学习路径" onClose={onClose} wide>
    <div className="learning-path">
      <p className="path-introduction">{soundOnly ? '从声母、韵母和零声母规则开始，逐步练习完整的双拼两码。所有课程都可以直接进入，也可以随时跳过。' : '按你已经会的内容选择起点。所有课程都可以直接进入，也可以随时跳过。'}</p>
      {!soundOnly && <div className="path-experience">
        <label htmlFor={experienceId}>我目前的程度</label>
        <select id={experienceId} value={experience} onChange={event => {
          const option = experienceOptions.find(item => item.value === event.target.value)
          if (option) onExperienceChange(option.value)
        }}>
          {experienceOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <span>只调整推荐起点，不限制课程。</span>
      </div>}

      {active && activeProgress && <div className="path-resume">
        <div><span>当前课程</span><strong>{active.title}</strong></div>
        <button className="primary-button" onClick={() => onSelect(active.id)}>继续练习 <Icon name="arrow" size={15} /></button>
        <p>从第 {Math.min(Math.max(0, activeProgress.lastEntryIndex), Math.max(0, activeProgress.total - 1)) + 1} / {activeProgress.total} 字继续。</p>
      </div>}

      <div className="path-groups" aria-describedby={progressHelpId}>
        {groups.map((group, groupIndex) => {
          const entries = lessons.filter(lesson => lesson.group === group.id)
          if (!entries.length) return null
          return <section className="path-group" key={group.id} aria-labelledby={`${experienceId}-${group.id}`}>
            <div className="path-group-heading"><span aria-hidden="true">0{groupIndex + 1}</span><div><h3 id={`${experienceId}-${group.id}`}>{group.title}</h3><p>{group.description}</p></div></div>
            <div className="path-lesson-list">
              {entries.map(lesson => {
                const counts = lessonProgress(lesson, progress)
                const isActive = lesson.id === activeLessonId
                const isRecommended = lesson.id === recommended?.id
                return <button className={`path-lesson ${isActive ? 'is-current' : ''}`} key={lesson.id} onClick={() => onSelect(lesson.id)} aria-current={isActive ? 'step' : undefined}>
                  <span className="path-lesson-copy"><span className="path-lesson-title">{lesson.title}{isRecommended && <span className="path-recommendation">推荐起点</span>}{isActive && <span className="path-current-label">当前课程</span>}</span><span className="path-lesson-description">{lesson.description}</span><span className="path-lesson-counts">看过 {counts.seen} · 练过 {counts.attempted} · 已掌握 {counts.mastered} / {counts.total}</span></span>
                  <Icon name="arrow" size={17} />
                </button>
              })}
            </div>
          </section>
        })}
      </div>

      {!lessons.length && <p className="path-empty" role="status">当前没有可用课程，可以返回自由学习继续练习。</p>}
      <p id={progressHelpId} className="path-progress-note">掌握按同一练习范围内连续两次独立正确完成计算；用过提示或出现错误的完成不计入连续独立正确。记录只保存在当前浏览器，没有每日任务或到期要求。</p>
    </div>
  </Dialog>
}
