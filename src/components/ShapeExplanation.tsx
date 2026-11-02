import { SHAPE_RULES, SHAPE_TEACHING_RECORDS, SHAPE_TEACHING_SOURCES, SMALL_CHARACTER_GUIDANCE, TEACHING_RULES } from '../data/shape-teaching'
import { reviewedShapeTeaching, shapeDisplayLabel } from '../domain/shape-teaching'
import type { CharacterEntry } from '../domain/types'
import '../styles/shape-teaching.css'

export function ShapeExplanation({ entry, focus, headingLevel = 4 }: { entry: CharacterEntry; focus?: 'first' | 'last'; headingLevel?: 2 | 4 }) {
  const record = reviewedShapeTeaching(entry, SHAPE_TEACHING_RECORDS)
  const Heading = headingLevel === 2 ? 'h2' : 'h4'
  const shape = entry.shape
  if (!shape) return <section className="shape-explanation" aria-label={`${entry.char}的取形教学`} data-teaching-scope="unreviewed">
    <div className="shape-teaching-heading"><Heading>取形解释待补</Heading><span>编码已核对</span></div>
    <p className="shape-teaching-limitation">这条四码来自有出处的发布码表，并已核对读音与全码。当前没有可采用的首末根解释；第三、四位可练习，不能由字母反推字根。</p>
  </section>
  const selectedPartId = focus === 'first' ? record?.firstPartId : focus === 'last' ? record?.lastPartId : undefined
  return <section className="shape-explanation" aria-label={`${entry.char}的取形教学`} data-teaching-scope={record?.scope ?? 'unreviewed'}>
    <div className="shape-teaching-heading"><Heading>为什么这样取形</Heading><span>{record ? record.scope === 'root-sequence' ? '已核验取根序列' : '已核验端点与规则' : '完整教学分析待补'}</span></div>
    <p className="shape-endpoints">首形 <strong>{shapeDisplayLabel(shape.first.component)}</strong> → <kbd>{shape.first.key}</kbd><span>；</span>末形 <strong>{shapeDisplayLabel(shape.last.component)}</strong> → <kbd>{shape.last.key}</kbd></p>
    {record ? <>
      <p className="shape-sequence-caption">{record.scope === 'endpoints' ? '端点关系（中间含未展开区域）' : record.sequenceType === 'stroke-categories' ? '笔画归类序列' : '取根序列'} · 图中先后用于取码说明，不是逐笔书写动画。</p>
      <ol className="shape-teaching-parts" aria-label={record.scope === 'endpoints' ? '已核验端点及未展开区域' : '已核验取根序列'}>
        {record.parts.map(part => {
          const endpoint = part.id === record.firstPartId ? '首形' : part.id === record.lastPartId ? '末形' : undefined
          return <li key={part.id} className={`${endpoint ? 'is-endpoint' : ''} ${part.kind === 'unexpanded' ? 'is-unexpanded' : ''} ${part.id === selectedPartId ? 'is-focused' : ''}`}>
            <strong>{part.label}</strong>{part.rawGlyph && part.kind === 'stroke' && <span className="shape-raw-glyph">原始符号 {part.rawGlyph}</span>}<span>{endpoint ? <>{endpoint} · <kbd>{endpoint === '首形' ? shape.first.key : shape.last.key}</kbd></> : part.kind === 'unexpanded' ? '待逐根复核' : '中间部分'}</span>
          </li>
        })}
      </ol>
      {record.limitation && <p className="shape-teaching-limitation">{record.limitation}</p>}
      <ol className="shape-teaching-steps" aria-label="本字已复核的规则应用">
        {record.steps.map((step, index) => <li key={index}><strong>{TEACHING_RULES.find(rule => rule.id === step.ruleId)?.title}</strong><p>{step.text}</p></li>)}
      </ol>
      <details className="shape-teaching-evidence"><summary>查看本字的规则与部件依据</summary><p>以下分别记录结构事实、规则应用和正式端点；源树本身不证明真实笔顺。</p>
        <ol>{record.evidence.map(item => {
          const source = SHAPE_TEACHING_SOURCES.find(source => source.id === item.sourceId)!
          return <li key={item.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a><span>{item.locator}</span><p>{item.supports}</p><small>{source.license}</small></li>
        })}</ol>
      </details>
    </> : <><p className="shape-teaching-limitation">当前可查已核验首末根与来源轨迹；本字完整取根过程和逐项规则解释尚待补充。下面的规则目录供参考，不表示每条都已核验适用于本字。</p>{entry.notes?.filter(note => note.startsWith('规则依据：')).map(note => <p key={note}>{note}</p>)}</>}
    <details className="shape-rule-directory"><summary>四条取形规则与小字补充</summary>
      <ol>{SHAPE_RULES.map(rule => <li key={rule.id}><strong>{rule.title}</strong><p>{rule.text}</p><a href={rule.sourceUrl} target="_blank" rel="noreferrer">官方规则 · {rule.locator} ↗</a></li>)}</ol>
      <div className="shape-small-guidance"><strong>{SMALL_CHARACTER_GUIDANCE.title}</strong><p>{SMALL_CHARACTER_GUIDANCE.text}</p><a href={SMALL_CHARACTER_GUIDANCE.sourceUrl} target="_blank" rel="noreferrer">官方规则 · {SMALL_CHARACTER_GUIDANCE.locator} ↗</a></div>
      <p>本页文字为原创释义。规则目录不是完整字根表；每字是否适用，以已复核的本字步骤为准。</p>
    </details>
  </section>
}
