# 固定来源的部件拼字层

此生成器将有明确来源的部件序列和部件读音独立转换成 `OK`＋二／三部件双拼，保留来源证据，再读取项目外固定参照逐字码对比较。它不是把四码倒推成字根，也不替没有读音的整字造拼音。输入、政策及条款见 [NOTICE](../../data/NOTICE-component-spelling.md)。

## 重建与离线检查

在 WSL／Linux 中使用项目 Node.js 22.12+、`npm ci` 和 Python 3（仅解析字面量 AST）：

```bash
node tools/component-spelling/generate.mjs \
  --reference /external/pinned-xhup.ok.dict.yaml

node tools/component-spelling/generate.mjs --check
```

参照必须是项目外的固定版本文件，摘要必须为
`510c6d7ab85b125d37a8b95cd1eb615371234aec353851f052e7a7a5ccf68d4a`。
无下载、强制重锁或自动接纳新参照的选项。全部独立候选生成后才读取参照；任何输入、参照或打包结构校验失败都发生在写入前。

正常 `--check` 不需要网络或原始参照：验证固定输入、政策、生成器及实际运行音码依赖、生成锁与全部产物摘要，再检查全部部件和码对是否自洽、分片统计及状态数是否一致。完整重建需上述原始固定参照，不能将离线产物摘要检查称为重新执行官方比较。

数据采用相同的来源顺序与第一份确定性 witness；同部件多读音先按不同双拼码去重，每源行最多256组合。本次实际最大12，无限额截断。固定版本得到：

- 89,189 个候选字、112,553 个候选字码对。
- 59,926 个字／59,930 个码对与固定参照一致；其余52,623码对仍为独立候选。
- 7,994 个不同的部件／选读／双拼／来源元组，103个Unicode分片。

这些数字不表示已达到全部Unicode覆盖、全部官方四码或完整教学；未通过的其他码对不能因同字另一码通过而升格。

## 给前端的格式

入口为 `src/data/generated/component-spelling-manifest.json`，仅在文本准备或查询时异步加载，避免进入首页同步包。`components` 是全局元组池：

```text
[part, pinyin, soundCode, readingSourceId]
```

读音来源区分具体Unihan属性、上游显式助记音、公开的VI／PP部件拼读约定；`sourceDefinitions`给出处和说明。助记音、部件拼读都不应被显示成本字的标准音。

manifest的`shards`列出文件、字／码对数、已比较一致的数量、原始字节数与SHA256。分片ID为：

```js
(char.codePointAt(0) >>> 10).toString(16).padStart(3, '0')
```

文件名 `component-spelling-{id}.json`，每个分片包含`schemaVersion`、`policyId`、`shardId`和`rows`。行格式：

```text
[char, fullCode, componentIds, sourceLine, comparisonFlag]
```

`fullCode`及部件`soundCode`均为大写。`componentIds`为2／3个全局池索引；`sourceLine`是原radical TSV的一基行号。flag1才可默认正式评分；flag0叫“未获固定参照确认的独立候选”，其中既可能参照外，也可能与参照不同，不能一律说从未比较。

按需加载应在开始分析文本／训练前明确准备所需分片，缺失或失败显示可重试状态，不能暂当未知字并跳过。实体输入仍为6／8位；应显示OK引导和部件双拼语义，不能套用四码的首形／末形标签。

## 输入和许可

`inputs/`保留固定radical源文件、原助记程序、原说明、GPL文本及底层CC BY／MIT／Unicode通知。Python上游程序仅供AST读取，不执行。`inputs.lock.json`列每个实际文件摘要；`config.json`明确policy版本、组合上限与四项全局规则事实。源码与数据许可分开：本生成器原创MIT，输入和派生部件资料保留GPLv3及相应上游条款。

参照原件仍在项目外，不进入这些输入、生成物或源码包。生成物中的全码来自独立部件转换；参照仅提供逐码对比较状态。
