# Babble 数据来源与采用记录

旧字典审计日期：2026-10-25（Asia/Dubai）；取形扩展及默认练习文本更新于 2026-10-26，分别见独立小节。字典数据已实际下载、检查、锁定并导入。机器可核对的 URL、版本、SHA256、转换与许可见 `data/sources.lock.json` 和 `data/shape-sources.lock.json`；不以仓库首页的许可证标记代替逐文件审计。

## 已采用的数据

| 数据 | 作者 / 原始来源 | 许可与修改 | 本项目用途 |
| --- | --- | --- | --- |
| Unihan 17.0.0 | Unicode, Inc. 与 Unihan 贡献者；[固定版本 ZIP](https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip)、[UAX #38](https://www.unicode.org/reports/tr38/tr38-39.html) | Unicode-3.0，完整通知在 `data/NOTICE-Unicode.txt`。提取现代 `kMandarin`、`kTGHZ2013` 与 `kHanyuPinlu`，保留带调拼音及逐读音字段来源。 | 44,348 字现代读音；3,799 字有频率计数。未使用历史 / 罕见读音字段补齐当前读音。 |
| 小鹤声韵与零声母表 | sharebravery（许多言）；[固定 schemes.ts](https://github.com/sharebravery/shuangpin-practice/blob/4927919362cadcda6e61375a04bc75a1e47e6639/src/data/schemes.ts) | MIT，通知在 `data/NOTICE-shuangpin-practice.txt`。仅提取小鹤表，保留 v / ve 表示 ü / üe 的拼写；未复制应用源码或练习语料。 | 23 个声母、32 个韵母映射与 12 个零声母音节。已参照官方图核对，官方图未打包。 |
| libre-flypy 1.2.0 全码 | OverflowCat；[固定发布码表](https://github.com/OverflowCat/libre-flypy/releases/download/1.2.0/output.txt)、[上游声明](https://github.com/OverflowCat/libre-flypy/blob/0eddd3eafc1ad68b3b55f0565c10b7b92b104d51/README.md#协议) | 上游将生成全码表声明为 CC0；原表随复现工具保留。只选取发布物实际存在的全码，不补码。 | 编码事实的来源，不从它反推字根或读音。 |
| 真实取形轨迹 | OverflowCat 的 [AGPL 生成器固定提交](https://github.com/OverflowCat/libre-flypy/tree/0eddd3eafc1ad68b3b55f0565c10b7b92b104d51)；本项目增加 25 行来源追踪 | 工具及保守视作衍生资料的 trace 保留 AGPL-3.0；未改编码决策。完整源码、补丁、说明和锁定输入在 `tools/libre-flypy-audit/`，通知见 `data/NOTICE-shape-traces.md`。 | 6,596 字、7,014 个全码通过严格核验；保留首末根、实际递归路径及源树。与现代读音匹配后才进入训练。 |
| 生成器的 IDS 输入 | Yi Bai；[固定 ids_lv2.txt](https://github.com/yi-bai/ids/blob/2f9ad2de309c56a83555ca7474473ce1fa1b8ee4/ids_lv2.txt) | MIT，原文件与完整通知在工具 `inputs/`。 | 提供真实树和取形过程的上游依据；一般 IDS 不直接等于小鹤教学拆分。 |
| 生成器的旧拼音输入 | mozillazg；[固定 pinyin.txt](https://github.com/mozillazg/pinyin-data/blob/2fe1f86e2bbed2e230d6e947aa393f8ee37342f4/pinyin.txt) | MIT，并保留其 Unicode / Unihan 输入通知。历史输入锁定，以复现旧生成器；不替换训练所用现代 Unicode 读音。 | 只用于复现已发布编码和轨迹。 |

每份通知均保留作者、原许可与修改说明，锁文件记录获取日期和原始 / 生成 SHA。`npm run build` 将通知复制到 `dist/licenses/`，并提供完整对应源码归档。

## 默认练习文本《花园中》

2026-10-26（Asia/Dubai），用户明确指定将其提供的 `HY.docx` 转换为 text 并用作初始练习内容。本项目按 Word 正文顺序读取 65 个段落，以 LF 连接，输出根目录 UTF-8 `HY.txt`，共 2,197 个 Unicode 码点；保留原文字、英文、标点和空段落，不改写文章。来源、转换说明和 SHA256 见 [data/NOTICE-practice-text.md](../data/NOTICE-practice-text.md)：

- 原 Word：`afedef22df04a7f840a1a7b20c69009a86b8f1cdc4f8971efae73ac5e95615a2`。
- 转换文本：`b8bca40fef81749ed547a6f0ac12a29519b8b24162fe5d003a31ed33214cdac3`。

文件未附作者及独立许可证声明，不补造署名，不将代码或字典的 MIT / AGPL / Unicode / CC0 授权套用到该文章。按用户指示纳入的 `HY.txt` 随应用及完整源码包分发，原 `HY.docx` 不进入网页或源码下载包；独立通知随构建复制到 `dist/licenses/`。

这份文章仅是默认练习题目来源，与字音、形码、字根和键位数据相互独立，不参与生成或推断编码。界面也支持用户自行粘贴或本地上传 UTF-8 `.txt`；这些自有内容只在当前页面内存使用，不上传、不写入学习存储，刷新后清除。内置默认文章仍随应用可用，不意味着恢复了此前的自有文章、读音选择或位置。

## 核验方法与准确边界

1. 固定 libre-flypy 发布物与生成器提交；上游未锁输入，本项目锁定发布日前最近的 IDS / 拼音版本。
2. 修改仅记录生成器实际使用的根与查找路径。原版和追踪版的 52,743 行编码 multiset 完全一致。
3. 仅保留生成器结果同时存在于发布码表、且全码及两个根与官方研究参照完全一致的记录；不同根名不擅自设置别名。
4. 排除私用区、问号、替换符根，不自行换字形。本次保留子集中这些根均为零。
5. 将现代来源的每一个带调读音按已核对的声韵表编码，只有前两码与原始全码恰好匹配才可训练；形码直接来自原码，不生成。

旧来源链可训练 **6,573 字 / 7,113 个字＋带调读音＋全码选项**，涉及 6,839 个不同的字＋全码；23 个候选取形字无法与现代读音精确匹配，保持不可训练。保留同一全码对应的不同声调选项；不作语境消歧。自由学习默认条目取首个能匹配的现代读音，不宣称该读音适用于任意文章；自定义文本存在多读音 / 多码时按本处位置明确选择。

[官方查形页](https://flypy.cc/ix/) 及其公开引用的数据仅在项目外临时用于否定不一致记录；未确认再分发授权，**原始官方研究文件、官方图片、教程均未打包**。接受条目的全码、根、路径和树字段来自前述有许可的独立生成器及输入。核验参考的 URL 与 SHA 仅作为研究记录保留。离线复现需自行提供项目外、摘要匹配的参考文件，普通构建不使用它。

「我、中、木、水」等旧生成器算错的条目仍从旧来源排除；本次用下述独立推导的扩展记录补齐，没有改写原发布码表。核验通过不等于完整官方覆盖，也不证明每条路径是教学最优拆分；`idsTree` 是生成器的调试树，路径是查表来源，都不是笔顺教程。

## 2026-10-26：独立取形扩展

新输入与许可完整记录于 `data/shape-expansion-inputs.lock.json` 和 [NOTICE-shape-expansion.md](../data/NOTICE-shape-expansion.md)：

- 開放詞典的 [chaizi 固定版本](https://github.com/kfcd/chaizi/tree/e177ab54ce4edf255315a60593ffecbd8167e96b)，CC BY 3.0，合并 20,466 个字键的候选部件序列。
- [Unicode 17.0.0 等价字映射](https://www.unicode.org/Public/17.0.0/ucd/EquivalentUnifiedIdeograph.txt)，Unicode-3.0，仅使用明示的部首、笔画字形对应。
- [TJYSunset/Strokes.txt 固定版本](https://github.com/TJYSunset/Strokes.txt/tree/f993e6d7cd348e34d35efda29e356c258fb277c5)，WTFPL，提供 406 条 Unicode 组件的明确笔画记录；保留其来源讨论与局限。
- 继续使用已锁定的 OverflowCat 根键定义、修订 IDS 与 Yi Bai 原始 IDS，分别保留 AGPL 和 MIT 署名。修订输入不冒充 Yi Bai 的原始数据。

`tools/shape-expansion/generate.py` 从这些输入产生根、路径和现代读音前缀，首末候选来自同一顶层拆分；明确笔顺提供首末笔，六类笔画及 Unicode 对应保留归类路径。参考数据仅用于拒绝不一致结果；比较时只允许去掉根后附加的拉丁读音注记，不借其字段构造输出。工具不从码位反推根名，也不将一般 IDS 顺序说成笔顺。

新产物 `shape-expansion.json` 包含 **1,570 个字 / 1,630 个额外全码**；原有 trace 不变，合并后为 8,166 个取形候选字。与现代读音匹配后实际可训练 **8,143 字 / 8,806 个带调读音＋全码选项**，其中 1,693 个选项采用新来源。新记录保守保留 AGPL 生成资料义务及 CC BY 3.0 输入署名，不套用旧发布码表的 CC0 声明。

《花园中》有 1,840 次汉字出现、632 个不同字。可训练出现次数从 1,183（64.29%）增至 1,758（95.54%），不同字从 446 增至 608；仍有 24 个字、82 次出现缺少通过核验的解释，继续标记跳过。有字频记录的 3,799 字中，现有 2,752 字可训练；不据此宣称覆盖现代互联网常用字排名。

生成物、工具摘要、输入摘要和接受策略见 `data/shape-expansion.lock.json`。离线 `--check` 要求项目外、摘要匹配的研究参照，说明见 [扩展工具](../tools/shape-expansion/README.md)。正常构建与逐键训练不请求参照或远程数据库。

## 字频含义

`kHanyuPinlu` 来自较早的频率词典语料，共 3,799 字有计数，旧子集有 2,174 字、扩充后有 2,752 字可训练。按每字各读音的源计数求和，只用于有计数条目的优先排列；缺计数不伪造数值，随后按字序排列。简繁可能共享 / 重复计数，不据此计算全语料覆盖率，也不称为现代互联网 Top 500。

## 排除与更正

更多候选的逐项证据见 [声韵调研](survey-sound.md) 与 [拆分调研](survey-shapes.md)：无明确授权的 APK 提取数据、官方文档转录、源链不明的拆分表未纳入；CC BY-NC 本身不自动排除，需明确覆盖相应文件。

上轮审计把 `pinyin-data` README 列出的 CC-CEDICT / 汉典备用文件与主合并链混为一谈；本轮实读合并脚本后更正：固定主输入由 Unihan 及 MIT 修正构成，没有证据表明主 `pinyin.txt` 合并了那些备用文件。当前训练读音直接来自 Unicode 官方版本，进一步简化来源链。

最初用户提供的「某 → MZGM」fixture 留在测试文件使用的数据模块，明确为 TEST FIXTURE / NOT PRODUCTION DATA；运行时首题「某」现在来自独立核验数据，并带现代读音 mǒu，未把 fixture 当成正式数据许可证。

## 分发与后续门槛

组合发行遵循根目录 AGPL-3.0 `LICENSE`，原创代码的 MIT 许可保留于 `LICENSE-CODE`；不宣称所有数据为 MIT 或 CC0。完整源码、生成工具、输入通知、构建与复现说明随源码归档提供，页面有源码入口。当前阶段仍是本地交付，未发布网站。

新增或改错必须固定文件与 SHA、审计许可、保留来源和转换、核对编码及教学解释，并补回归测试。没有可靠数据的读音、字形或语境不能靠模型猜测补齐。
