# Babble 扩展取形资料来源

## 開放詞典：漢語拆字字典

© 2015 [開放詞典](http://www.kaifangcidian.com)（GitHub：`kfcd`）。

- 上游：[kfcd/chaizi](https://github.com/kfcd/chaizi)。
- 固定版本：`e177ab54ce4edf255315a60593ffecbd8167e96b`。
- 获取及审计日期：2026-10-26（Asia/Dubai）。
- 许可：[Creative Commons Attribution 3.0 Unported / CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)。
- 上游原样文件：`tools/shape-expansion/inputs/chaizi-jt.txt`、`chaizi-ft.txt`。
- 原始署名、许可及说明：同目录的 `CHAIZI-LICENSE`、`CHAIZI-README.md`；另附来自 Creative Commons 的完整 `CC-BY-3.0.txt`。
- 每个文件的原始路径、URL、SHA256 和字节数记录于 `data/shape-expansion-inputs.lock.json`。

以上输入按原字节保留。Babble 将其中逐字、以 Tab 分隔的多种拆法解析为有顺序的部件序列，供确定性取形程序形成候选查找路径，并在独立核验后选取可用记录。此转换属于对输入资料的整理和改编，输出不会冒充原字典全文，也不表示開放詞典为本项目背书。

原字典以部件拆字为目的，不是笔顺库或小鹤音形专用教材。不能把它的任意一种拆法直接当作小鹤首末形规则，也不能从已知编码字母倒推或猜测字根。说明中的递归路径是数据推导依据，不代表笔顺或完整教学拆分。

## Unicode 部首及笔画等价字映射

© 2025 Unicode, Inc.。`EquivalentUnifiedIdeograph.txt` 的原始创建者署名为 Ken Lunde。

- 固定版本：[Unicode 17.0.0 原文件](https://www.unicode.org/Public/17.0.0/ucd/EquivalentUnifiedIdeograph.txt)。
- 获取及审计日期：2026-10-26（Asia/Dubai）。
- 许可：[Unicode License v3 / Unicode-3.0](https://www.unicode.org/license.txt)。
- 原样文件：`tools/shape-expansion/inputs/EquivalentUnifiedIdeograph.txt`、同目录 `UNICODE-LICENSE`；项目原有的 `data/NOTICE-Unicode.txt` 继续适用。
- 变更说明：将原文件中明确列出的码点及范围解析为候选等价关系，没有增补未提供的字形别名。

Unicode 对此属性的定义是代表字形相同或近似的 CJK 部首、笔画与统一汉字之间的对应关系。它不直接规定小鹤的字根或某一码位的取形规则；因此不能只因字形映射存在，就宣称所有情况下的编码也等价。

## TJYSunset：汉字组件笔画数据

- 上游：[TJYSunset/Strokes.txt](https://github.com/TJYSunset/Strokes.txt)。
- 固定版本：`f993e6d7cd348e34d35efda29e356c258fb277c5`。
- 作者署名：TJYSunset；上游 LICENSE 写有 `Copyright (C) 2018`，没有附加个人姓名，本项目不猜测其实名。
- 获取及审计日期：2026-10-26（Asia/Dubai）。
- 许可：[WTFPL version 2](https://github.com/TJYSunset/Strokes.txt/blob/f993e6d7cd348e34d35efda29e356c258fb277c5/LICENSE)。
- 原样文件：`tools/shape-expansion/inputs/Strokes.txt`、`STROKES-LICENSE`、`STROKES-README.md`。

上游为 IDS 中未拆分的组件补充实际笔画序列。README 说明主要参考汉典笔顺，并明确讨论了 Andrew West IDS 的来源与汉典历史 CC0 声明；完整来源讨论原样保留，不把其全部输入描述成作者从未参考他处的资料。

本项目解析上游明确记录的 CJK 笔画字符及候选字符组，按本地公开规则形成首末笔候选，再独立核验。此转换不是从普通 IDS 的树叶顺序猜测笔顺，也不意味着上游数据已全部正确。作者注明的地区差异、撇与竖撇、点与捺等可能混淆仍是输入局限；无法获得明确匹配的条目保持缺失。

## 已有输入与程序

扩展工具复用的 libre-flypy 编码程序及字根定义保留 AGPL-3.0-only，Yi Bai 的 IDS 输入保留 MIT；固定版本、上游许可和原始文件摘要仍由 `data/shape-sources.lock.json`、`data/NOTICE-shape-traces.md` 与 `tools/libre-flypy-audit/` 提供。

新推导的取形记录须分别说明工具、规则与输入。它们不是旧 libre-flypy 发布码表的原始记录，不能自动继承旧发布全码表的 CC0 声明；本项目保守保留 AGPL 衍生资料义务，同时保留输入字典的 CC BY 3.0 署名和条款。原始字典的许可不因与其他资料一同分发而被本项目的 MIT 代码许可替换。

官方查形数据只用于项目外研究核验；它的原始文件、图片和教学文字均不随此资料包分发。新增解释字段必须来自上述许可输入或可复核的确定性推导，不能复制官方参照字段来填补缺失。
