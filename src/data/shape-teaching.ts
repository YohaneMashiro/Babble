// Original teaching prose and arrangement: MIT; see data/NOTICE-shape-teaching.md.
// Factual endpoint/decomposition inputs retain their separately documented licenses.
import type { ShapeTeachingEvidence, ShapeTeachingPart, ShapeTeachingRecord, ShapeTeachingRule, ShapeTeachingSource } from '../domain/shape-teaching'

const rulesUrl = 'https://flypy.cc/help/#/gz'

export const SHAPE_RULES: readonly ShapeTeachingRule[] = [
  { id: 'first-last', title: '字取首末', text: '沿取根过程保留可成立的较大字根；没有合适的根时取笔画。形码记录第一根和最后一根，中间的根仍属于拆分。', sourceUrl: rulesUrl, locator: '一、拆分规则 · 1' },
  { id: 'no-cross', title: '相交不拆', text: '候选字根若被其他笔画穿过，就不能把它当作完整字根取走；需要继续检查可用的根或笔画。', sourceUrl: rulesUrl, locator: '一、拆分规则 · 2' },
  { id: 'no-isolation', title: '插隔不取', text: '候选字根被单笔插入，或被另一个结构隔开时，不能只因外形相似就把它合成一个根。', sourceUrl: rulesUrl, locator: '一、拆分规则 · 3' },
  { id: 'walk-radical', title: '廴辶优先', text: '廴或辶作为整个字的部首时优先取作首形；它只在内部结构中出现时，仍需按全字的常规取根处理。', sourceUrl: rulesUrl, locator: '一、拆分规则 · 4' },
]

export const SMALL_CHARACTER_GUIDANCE: ShapeTeachingRule = {
  id: 'small-derived', title: '补充：衍生小字', text: '由小字或部件加单笔得到的字，独立拆分时要检查其衍生关系；如果结果能分成两个字，也需要分取。它在别字中作根时，不能直接照搬独立成字的拆法。', sourceUrl: rulesUrl, locator: '二、小字字根 · 衍生小字与小字拆分',
}
export const TEACHING_RULES = [...SHAPE_RULES, SMALL_CHARACTER_GUIDANCE]

export const SHAPE_TEACHING_SOURCES: readonly ShapeTeachingSource[] = [
  { id: 'official-rules', title: '小鹤官方：鹤形规则（仅作事实核对）', url: rulesUrl, license: '未确认转载许可；仅链接，不分发原教程' },
  { id: 'official-roots', title: '小鹤官方：笔画与字根说明（仅作事实核对）', url: 'https://flypy.cc/help/#/zg', license: '未确认转载许可；仅链接，不分发原表' },
  { id: 'yi-bai-ids-2023', title: 'yi-bai/ids：固定 IDS 输入', url: 'https://github.com/yi-bai/ids/blob/2f9ad2de309c56a83555ca7474473ce1fa1b8ee4/ids_lv2.txt', license: 'MIT；Copyright (c) 2021 Yi Bai' },
  { id: 'kfcd-chaizi-e177ab5', title: '開放詞典：汉语拆字字典', url: 'https://github.com/kfcd/chaizi/blob/e177ab54ce4edf255315a60593ffecbd8167e96b/chaizi-jt.txt', license: 'CC BY 3.0；© 2015 開放詞典；已选择、编排为教学序列' },
  { id: 'tjy-strokes-f993e6d', title: 'TJYSunset：固定笔顺输入 Strokes.txt', url: 'https://github.com/TJYSunset/Strokes.txt/blob/f993e6d7cd348e34d35efda29e356c258fb277c5/src/Strokes.txt', license: 'WTFPL；保留 data/NOTICE-shape-expansion.md 与原许可' },
  { id: 'libre-flypy-ids-overrides-1.2.0', title: 'libre-flypy：固定 IDS 补充', url: 'https://github.com/OverflowCat/libre-flypy/blob/0eddd3eafc1ad68b3b55f0565c10b7b92b104d51/my_ids.txt', license: 'AGPL-3.0-only' },
  { id: 'canonical-shapes', title: '本库已锁定的编码、首末根与轨迹', url: 'https://github.com/OverflowCat/libre-flypy', license: 'AGPL-3.0-only；发布全码另有 CC0，详见来源通知' },
]

const root = (id: string, rawGlyph: string): ShapeTeachingPart => ({ id, rawGlyph, label: rawGlyph, kind: 'root' })
const stroke = (id: string, rawGlyph: string, label: string): ShapeTeachingPart => ({ id, rawGlyph, label, kind: 'stroke' })
const region = (label: string): ShapeTeachingPart => ({ id: 'unexpanded', label, kind: 'unexpanded' })
const evidence = (id: string, sourceId: string, locator: string, supports: string): ShapeTeachingEvidence => ({ id, sourceId, locator, supports })

function record(char: string, code: string, parts: readonly ShapeTeachingPart[], steps: ShapeTeachingRecord['steps'], facts: readonly ShapeTeachingEvidence[], options: Partial<Pick<ShapeTeachingRecord, 'scope' | 'sequenceType' | 'limitation'>> = {}): ShapeTeachingRecord {
  return {
    char, verifiedCodes: [code], coverage: 'reviewed-example', scope: 'root-sequence', sequenceType: 'root-selection',
    parts, firstPartId: parts[0].id, lastPartId: parts[parts.length - 1].id, steps,
    evidence: [evidence('endpoints', 'canonical-shapes', `src/data/generated/${'中木玉'.includes(char) ? 'shape-expansion' : 'shape-traces'}.json · characters.${char}`, '本字正式全码与首末根已核对；不是从键位反推字根。'), ...facts], ...options,
  }
}

export const SHAPE_TEACHING_RECORDS: readonly ShapeTeachingRecord[] = [
  record('某', 'MZGM', [root('first', '甘'), root('last', '木')], [
    { ruleId: 'first-last', text: '甘、木在这次取根中分别成为第一根和最后一根，两根都保留，形码取 G、M。', partIds: ['first', 'last'], evidenceIds: ['endpoints', 'parts', 'parts-jt', 'rule'] },
  ], [evidence('parts', 'yi-bai-ids-2023', 'ids_lv2.txt:6609', '上下两部分为甘、木。'), evidence('parts-jt', 'kfcd-chaizi-e177ab5', 'chaizi-jt.txt:5758', '甘、木两部件交叉核对。'), evidence('rule', 'official-rules', '一 · 1 字取首末', '首末选择原则；本字对应关系另由已许可输入核实。')]),
  record('语', 'YUYK', [root('first', '讠'), root('middle', '五'), root('last', '口')], [
    { ruleId: 'first-last', text: '先取讠，再把吾展开为五、口。五在取根序列中保留；形码只选两端的讠、口，不能把吾整块当作末形。', partIds: ['first', 'middle', 'last'], evidenceIds: ['endpoints', 'parts', 'rule'] },
  ], [evidence('parts', 'yi-bai-ids-2023', 'ids_lv2.txt:15854,1599', '语的左右结构及吾中的五、口。'), evidence('parts-jt', 'kfcd-chaizi-e177ab5', 'chaizi-jt.txt:13522,1332', '讠、五、口的展开关系。'), evidence('rule', 'official-rules', '一 · 1 的语例', '本字取讠、口，中间的五不占形码位。')]),
  record('框', 'KLMW', [root('first', '木'), root('middle', '匚'), root('last', '王')], [
    { ruleId: 'first-last', text: '木在框中作为字根保留；匡继续展开为匚、王。首末选木、王。这里的木作偏旁，与木独立成字时的拆法不同。', partIds: ['first', 'middle', 'last'], evidenceIds: ['endpoints', 'parts', 'rule'] },
  ], [evidence('parts', 'yi-bai-ids-2023', 'ids_lv2.txt:6727,1314', '木、匡以及匚、王的结构。'), evidence('parts-jt', 'kfcd-chaizi-e177ab5', 'chaizi-jt.txt:5855,1106', '三部分展开的交叉核对。'), evidence('rule', 'official-rules', '一 · 1 的框例', '字根序列为木、匚、王，取首末。')]),
  record('国', 'GOKY', [root('first', '囗'), root('last', '玉')], [
    { ruleId: 'first-last', text: '囗先作为完整的框根取走，收口横已经属于它。剩下的玉是末根，因此末形不是最后书写的横；玉在国中作根，不照搬玉独立成字的拆法。', partIds: ['first', 'last'], evidenceIds: ['endpoints', 'parts', 'rule'] },
  ], [evidence('parts', 'yi-bai-ids-2023', 'ids_lv2.txt:2302', '囗与玉的包围结构。'), evidence('parts-jt', 'kfcd-chaizi-e177ab5', 'chaizi-jt.txt:1972', '囗、玉的部件关系。'), evidence('rule', 'official-rules', '一 · 1 的国例', '末形依取根归属决定，不等于末笔。')]),
  record('试', 'UIYG', [root('first', '讠'), root('middle', '弋'), root('last', '工')], [
    { ruleId: 'first-last', text: '式在这里分取弋、工，整字取根为讠、弋、工。末点已归入弋，不能再拿它当末形；最后的根是工。这不是逐笔书写顺序。', partIds: ['first', 'middle', 'last'], evidenceIds: ['endpoints', 'parts', 'rule'] },
  ], [evidence('parts', 'yi-bai-ids-2023', 'ids_lv2.txt:15830,4368', '讠与式、式中的弋与工。'), evidence('parts-jt', 'kfcd-chaizi-e177ab5', 'chaizi-jt.txt:13468,3773', '三根关系的交叉核对。'), evidence('rule', 'official-rules', '一 · 1 的试例', '点归弋，末根取工。')]),
  record('中', 'VSLL', [stroke('first', '丨', '竖'), stroke('fold', '乛', '折'), stroke('horizontal', '一', '横'), stroke('last', '丨', '竖')], [
    { ruleId: 'no-cross', text: '口被另一笔竖穿过，不能保留为口根，继续按笔画类别处理。两端都是竖，分别占首形和末形，得到两个 L。折的符号只表示类别，不表示精确曲线。', partIds: ['first', 'fold', 'horizontal', 'last'], evidenceIds: ['endpoints', 'strokes', 'structure', 'rule'] },
  ], [evidence('strokes', 'tjy-strokes-f993e6d', 'Strokes.txt:84', '四笔记录 ㇑㇕㇐㇑，归入竖、折、横、竖。'), evidence('structure', 'yi-bai-ids-2023', 'ids_lv2.txt:46', '口与竖的叠合结构；不单独证明几何交点。'), evidence('rule', 'official-rules', '一 · 2 的中例', '相交排除口，首末取竖。')], { sequenceType: 'stroke-categories' }),
  record('鹤', 'HEDN', [stroke('first', '丶', '点'), region('左部其余笔画未展开'), root('last', '鸟')], [
    { ruleId: 'no-cross', text: '左部看似可取的冖被撇穿过，不能整体取作首根，所以首形取点；右边的鸟是末根。这里只说明这两个端点与排除冖的理由。', partIds: ['first', 'unexpanded', 'last'], evidenceIds: ['endpoints', 'structure', 'override', 'rule'] },
  ], [evidence('structure', 'yi-bai-ids-2023', 'ids_lv2.txt:20581,18619', '左右结构与左部来源。'), evidence('override', 'libre-flypy-ids-overrides-1.2.0', 'my_ids.txt:96', '固定左部结构记录，不提供完整教学取根证明。'), evidence('rule', 'official-rules', '一 · 2 的鹤例', '冖被穿过，取首点、末鸟。')], { scope: 'endpoints', sequenceType: 'endpoint-context', limitation: '左部的完整内部取根序列尚未逐根复核；点、鸟不是全字完整拆分。' }),
  record('木', 'MUUN', [root('first', '十'), stroke('middle', '丿', '撇'), stroke('last', 'ㄟ', '捺')], [
    { ruleId: 'no-isolation', text: '看似人形的撇、捺被十隔开，不能合为人根。取十后还剩撇、捺，末形取捺。本库原始符号 ㄟ 表示捺类，不是要输入的注音；对应键是 N。', partIds: ['first', 'middle', 'last'], evidenceIds: ['endpoints', 'structure', 'parts', 'strokes', 'rule'] },
  ], [evidence('structure', 'yi-bai-ids-2023', 'ids_lv2.txt:6441', '十与人形笔画的交叠结构。'), evidence('parts', 'kfcd-chaizi-e177ab5', 'chaizi-jt.txt:5622', '木中的十与其余笔画关系。'), evidence('strokes', 'tjy-strokes-f993e6d', 'Strokes.txt:175,291；generate.py:33-40,185-192', '全字笔画及已锁定捺类归一；保留 canonical ㄟ。'), evidence('rule', 'official-rules', '一 · 3 的隔离说明与木例', '人不能作为整体取用，形码取十、捺。')]),
  record('玉', 'YUWD', [root('first', '王'), stroke('last', '丶', '点')], [
    { ruleId: 'small-derived', text: '玉独立成字时，按王加一点的衍生关系拆为王、点。这里不把点视作破坏王的普通插入；这条拆法也不能推广成国中的玉必须再拆。', partIds: ['first', 'last'], evidenceIds: ['endpoints', 'parts', 'strokes', 'rule'] },
  ], [evidence('parts', 'kfcd-chaizi-e177ab5', 'chaizi-jt.txt:8372', '王与点的拆字关系。'), evidence('strokes', 'tjy-strokes-f993e6d', 'Strokes.txt:337,338', '玉与王的笔画交叉核对。'), evidence('rule', 'official-rules', '二 · 小字拆分的玉例', '独立拆分取王、点，适用衍生规则。')]),
  record('主', 'VUDW', [stroke('first', '丶', '点'), root('last', '王')], [
    { ruleId: 'small-derived', text: '主按王加一点的衍生关系分取点、王。这里使用明确核验的这个结构，不能把另一个 IDS 候选亠、土直接当作本字取根答案。', partIds: ['first', 'last'], evidenceIds: ['endpoints', 'structure', 'parts', 'override', 'rule'] },
  ], [evidence('structure', 'yi-bai-ids-2023', 'ids_lv2.txt:60 · 第二变体', '点、王的结构变体。'), evidence('parts', 'kfcd-chaizi-e177ab5', 'chaizi-jt.txt:39', '点与王的关系。'), evidence('override', 'libre-flypy-ids-overrides-1.2.0', 'my_ids.txt:101', '本库采用的点、王结构。'), evidence('rule', 'official-rules', '二 · 小字拆分的主例', '衍生拆分取点、王，不能只看表面最大形。')]),
  record('元', 'YREE', [root('first', '二'), root('last', '儿')], [
    { ruleId: 'small-derived', text: '元能分成二、儿两个字，按衍生小字中的分取条件拆开。两根虽然都在 E 键，首形二和末形儿仍是不同的教学对象。', partIds: ['first', 'last'], evidenceIds: ['endpoints', 'parts', 'parts-jt', 'rule'] },
  ], [evidence('parts', 'yi-bai-ids-2023', 'ids_lv2.txt:836', '二、儿的上下关系。'), evidence('parts-jt', 'kfcd-chaizi-e177ab5', 'chaizi-jt.txt:707', '二、儿拆字关系。'), evidence('rule', 'official-rules', '二 · 衍生小字的两字分取与元例', '衍生结果含两个字时分别取根。')]),
  record('建', 'JMZY', [root('first', '廴'), root('last', '聿')], [
    { ruleId: 'walk-radical', text: '廴在建中是全字部首，因此取码时优先作为首形，末形取聿。图中的先后表示取根优先级，不是说实际写字先写廴。', partIds: ['first', 'last'], evidenceIds: ['endpoints', 'parts', 'parts-jt', 'rule'] },
  ], [evidence('parts', 'yi-bai-ids-2023', 'ids_lv2.txt:4347', '廴与聿的包围结构。'), evidence('parts-jt', 'kfcd-chaizi-e177ab5', 'chaizi-jt.txt:3755', '廴、聿的部件关系。'), evidence('rule', 'official-rules', '一 · 4 的建例', '廴作为全字部首先取。')]),
  record('健', 'JMRZ', [root('first', '亻'), region('建中其余部分未展开'), root('last', '廴')], [
    { ruleId: 'walk-radical', text: '健的部首是亻，廴在内部的建中，不触发全字部首优先。已核验首形亻、末形廴，不能把嵌入的建照搬成廴先取。这里只展示端点关系。', partIds: ['first', 'unexpanded', 'last'], evidenceIds: ['endpoints', 'structure', 'parts', 'rule'] },
  ], [evidence('structure', 'yi-bai-ids-2023', 'ids_lv2.txt:614,4347', '亻与建，以及建的内部结构；不证明真实书写次序。'), evidence('parts', 'kfcd-chaizi-e177ab5', 'chaizi-jt.txt:497,3755', '亻、建及建内两部分的关系。'), evidence('rule', 'official-rules', '一 · 4 的健例', '廴并非全字部首，首末取亻、廴。')], { scope: 'endpoints', sequenceType: 'endpoint-context', limitation: '建内部各根的取用顺序尚未在本卡片逐项复核；亻、廴只是首末端点。' }),
]
