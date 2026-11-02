# 鹤形拆分数据调查

调查时间：2026-10-25。范围为可下载的小鹤全码、首末形、字根键位及其来源链。以下结论来自上游仓库文件、提交历史、作者说明和官方入门文档的实际检查；没有将 GitHub 的仓库许可证图标当作所有第三方数据的授权。

项目免费、无商业化导向，因此 **CC BY-NC 本身不是排除条件**。采用时仍需确认许可证覆盖具体数据文件、保留署名和许可、标明转换，并核实上游来源。下文的“暂不打包”表示尚未找到充分的再分发依据，不断言数据侵权。

## 可操作结论

- **四码与首末形是两类独立数据。** 仅有 `字→四码` 可以判定输入是否正确，不能可靠解释第三、四码分别代表哪个字根。同一键有多个字根，不能由字母倒推出取形。
- 调查发现两个直接满足结构要求的大型数据文件：`xhup_ct/拆小鹤_8167.json` 和 `oh-my-rime/opencc/fly_Chaifen.txt`。前者明确来自应用提取且没有许可证；后者有 GPL-3.0 仓库许可，但未找到原始拆分来源说明。因此均暂不作为已获授权的正式拆分库打包。
- `davelet/xiaohe-yinxing-dict/src/help/data.rs` 有 241 条教学例字和完整键位元组，结构最适合课程；追溯后可确认它来自官方帮助文档的转录，不能仅靠软件的 Unlicense 视为官方文字与图片也已重新授权。
- `openfly` 的 CC BY-NC 条款可接受，但官方词库另适用 EULA，文件归属边界没有清单。它也没有逐字首末形解释。不能用“仓库 MIT”或“整理后 NC”将整份官方词库直接作为独立学习数据库再授权。
- 可先交付独立审计通过的全码库、已核验的课程样本以及用户本地导入；没有拆分解释的条目应明确显示“暂无经核验的拆分说明”，并提供官方查形链接。正式批量首末形库应等待能明确证明来源与数据授权的版本。不要使用模型猜测来补齐数千条拆分。

`libre-flypy` 的编制来源、码表覆盖及许可证由单独的全码调查记录负责，本文件不重复该部分审计。

## 候选逐项记录

### 1. rightester/xhup_ct：结构足够，来源与许可不满足打包条件

- [仓库与作者说明](https://github.com/rightester/xhup_ct)；检查版本 `4ca910c96836b3cf2cbd2f8b0cce240bcab0c54f`，2022-01-29，提交说明为“网上找的，来源不明”。
- [JSON 下载](https://raw.githubusercontent.com/rightester/xhup_ct/4ca910c96836b3cf2cbd2f8b0cce240bcab0c54f/拆小鹤_8167.json)。实读 8,167 个字，值依次为简码/全码、全字拆解、双形码。例如 `某: ["mz mzgm", "甘 木", "g  m"]`。包含部分私用区字形，直接浏览器显示会有缺字问题。
- README 明确说明从安卓“小鹤拆字 2.1”应用逐项提取；仓库没有 LICENSE，也没有应用作者对其提取、改编、再分发的授权文件。
- **采用性：暂不打包。** 数据格式足以给四码提供首末形，但不应从本仓库复制为正式教学库。

### 2. Mintimate/oh-my-rime：6,941 条首末形，原始来源待补

- [数据文件](https://github.com/Mintimate/oh-my-rime/blob/5fca6ae067fd666b5ec4f119c5147efd629cc76d/opencc/fly_Chaifen.txt)；仓库检查版本 `5fca6ae067fd666b5ec4f119c5147efd629cc76d`，2026-10-19。
- [原始添加提交](https://github.com/Mintimate/oh-my-rime/commit/5fdc2719e979d18d28d468ea072897e8a5180ace)，2024-03-16，作者 Mintimate，联合署名 GGboxCloud。该文件只有这一次内容提交。提交说明介绍拆字滤镜功能，没有说明拆分表的编制来源。
- [许可证](https://github.com/Mintimate/oh-my-rime/blob/5fca6ae067fd666b5ec4f119c5147efd629cc76d/LICENSE)：仓库为 GPL-3.0；数据文件无单独许可或来源头，README 的词库来源列表也没有标识此表。
- 格式 `字<TAB>〔首形末形｜全码〕`，如 `某<TAB>〔甘木｜mzgm〕`、`国<TAB>〔囗玉｜goky〕`。多音字以 `・` 分隔多个全码。6,941 行均为不同汉字；434 行含私用区字符，59 行含增补平面字符。SHA-256：`b25675d3aa0d50cde544e58a97131b19bc2f2bb5e06badcdc7838d06e3b9afd9`。
- **采用性：来源待澄清后可考虑。** GPL 本身允许改编再分发并附带相应义务；当前缺口是原始数据授权链，而不是 GPL 不适合免费项目。此表技术上足以提供多数常用字的四码与首末形，但没有逐字取形规则解释。

### 3. davelet/xiaohe-yinxing-dict：241 个教学例字，官方文档转录

- [仓库](https://github.com/davelet/xiaohe-yinxing-dict)；版本 `100ce0ca4356ac0a73418d24302021ee4729ccfb`，2026-09-15。[软件许可](https://github.com/davelet/xiaohe-yinxing-dict/blob/100ce0ca4356ac0a73418d24302021ee4729ccfb/UNLICENSE)为 Unlicense。
- [结构化教学数据](https://github.com/davelet/xiaohe-yinxing-dict/blob/100ce0ca4356ac0a73418d24302021ee4729ccfb/src/help/data.rs)：`BUJIAN` 为 26 组 `(键, 部件列表, 记忆方法)`，`XIAOZI` 为 23 组键位列表，`CHAIFEN` 为 241 个 `(字, 全码, 首形, 末形)`。如 `("湿", "uidy", "氵", "业")`。教学数据没有拼音标音或逐字规则 ID。
- [首次帮助文档导入](https://github.com/davelet/xiaohe-yinxing-dict/commit/490cd47fd65971bb3eec06f80de55e0ae69fa777)，2026-06-17；可在该版本的 `help/zg.md`、`help/gz.md` 看到原始 Markdown。其表格和文字与[官方字根文档](https://flypy.cc/help/zg.md)、[官方规则文档](https://flypy.cc/help/gz.md)一致。帮助仍署名小鹤作者何海峰，并保留官方捐赠/联系方式。
- 编码主库 `src/dict_data.rs` 的 79,783 条目另来自 `davelet/my-mac-rime-data`；[固化源码提交](https://github.com/davelet/xiaohe-yinxing-dict/commit/32dd6ae493a44e42a8a612b0a07cb172876abe4b) 的 README 明示 Rime→Markdown→Rust 数据链。主库不等于 79,783 个独立汉字，也不含相同规模的拆分说明。
- **采用性：适合作为数据结构与人工核验参考，暂不直接复制官方文档转录。** 可独立记录经核验的事实并编写自己的说明；不能顺带复制官方字根图片和整篇教程。

### 4. amorphobia/openfly：明确混合许可，不能整体当作 MIT 数据

- [仓库与许可分界](https://github.com/amorphobia/openfly/blob/f0982a96291c1d221753cf5a049778fd88ce45e2/README.md)；检查版本 `f0982a96291c1d221753cf5a049778fd88ce45e2`，2024-09-15；词库标注 `v10.9z`。作者说明方案复刻 v9 时代官方小鹤，后续词库停更。
- README 分为：官方词库和原始配置适用 [flypy-eula.md](https://github.com/amorphobia/openfly/blob/f0982a96291c1d221753cf5a049778fd88ce45e2/flypy-eula.md)；其他整理词库/配置适用 [CC BY-NC 4.0](https://github.com/amorphobia/openfly/blob/f0982a96291c1d221753cf5a049778fd88ce45e2/by-nc.md)；程序代码适用 MIT。
- `openfly.primary.dict.yaml`、`openfly.completion.dict.yaml` 等文件头直接署名何海峰。没有文件清单将它们明确列入“其他整理”许可。
- `openfly_reverse.dict.yaml` 是四码和通配位置的反查词典；[issue #4](https://github.com/amorphobia/openfly/issues/4)与[实现提交](https://github.com/amorphobia/openfly/commit/b9fc2060dafdb31fcdc8a2fe8a823ee1d2666fd1)说明它由全码生成，替代官方反查二进制。它不是首末字根数据库。
- EULA 明确授予安装使用，禁止逆向，并保留图文版权；实读版本没有额外的“软件不得拆分”条款，也没有明确授予数据抽取、改编及再分发的条款。
- **采用性：可使用明确属作者原创且由相应许可覆盖的程序代码；官方码表不作为本轮独立教学数据源。** 把某个转换词典视为 CC BY-NC 覆盖范围的推断，仍不能替代它对底层官方数据的授权说明。

### 5. HowcanoeWang/rime-lua-aux-code：可读双形码，无拆分文字

- [仓库](https://github.com/HowcanoeWang/rime-lua-aux-code)；版本 `f9780033396f8998697c2a004d40bd543c46308b`，2026-08-13，MIT。
- [数据下载](https://raw.githubusercontent.com/HowcanoeWang/rime-lua-aux-code/f9780033396f8998697c2a004d40bd543c46308b/aux_code/flypy_full.txt)：8,283 行，UTF-8，`字=双形码`，例如 `阿=ek`。没有拼音、简码、首末形名称或取形解释。
- [目录来源清单](https://github.com/HowcanoeWang/rime-lua-aux-code/blob/f9780033396f8998697c2a004d40bd543c46308b/aux_code/README.md)仅写 AiraNadih 社区贡献。[PR #4](https://github.com/HowcanoeWang/rime-lua-aux-code/pull/4)于 2023-11-26 合并（`40e12c87d7f2fd00fca2ab7785ecfc7203029861`），讨论了代码与码表使用，没有说明原始双形数据的编制/授权链。
- **采用性：不能单独支撑四码教学，也不能仅据插件 MIT 推定第三方码表的上游权利。** 可作独立核验候选，暂不批量入库。

### 6. cubercsl/rime-flypy：官方词典挂接与构建，不是拆分解释库

- [仓库](https://github.com/cubercsl/rime-flypy)；检查 HEAD `9ee464765e325dfd4b04926028d79d60882e653e`。根目录未找到 LICENSE。
- 文件含 `flypy/flypy.full.char.dict.yaml`、首选/次选/简码词典、官方二进制，以及生成 Rime/Fcitx5 字典的脚本。全码词典为常规 `字<TAB>码`，没有首末形/规则字段。
- **采用性：暂不打包。** 无数据再分发许可证据，且内容不弥补拆分解释缺口。

### 7. boomker/rime-fast-xhup：全码与键位参考，不足以生成逐字解释

- [仓库](https://github.com/boomker/rime-fast-xhup)；检查版本 `1c0eb2f5d6cf0b9c96bee15c82b54a9105636a59`，2026-10-25；仓库 LICENSE 为 LGPL-3.0。
- `cn_dicts/flypy_chars.dict.yaml` 等单字词典及 `flypy_keymap.txt` 可读；README 将形码学习指向[官方规则](https://flypy.cc/help/#/gz)，并说明仅提供单字形码。词库转换脚本另属 `boomker/Rime-flyhe-dict`。
- **采用性：不作为首末形解释库。** 仓库许可与拼音词库来源可调查，但单字形码没有逐字字根名称及独立的编制来源记录，无法由键位表自动还原解释。

## 字根表与显示注意事项

[官方规则](https://flypy.cc/help/#/gz)及[官方字根](https://flypy.cc/help/#/zg)是教学准确性的校验依据；[官方查形](https://flypy.cc/ix/)可让用户自行查询。官方可公开访问的文档没有在已检查页面提供开放数据许可证，本次没有批量提取官方查形服务。

应分别存储字根的可显示字符、名称、对应键及来源。`ノ`、`フ` 等是部分表采用的显示替代字形；私用区字符只有配套字体才有意义。不能悄悄将所有私用区字符替换成猜测的常见部首。验证还应处理多音字、全码与简码分离、同字多码、表外字标记，以及来源版本变更。

暂存的候选仓库位于 `/tmp/xiaohe-survey-*`，未复制进入产品数据目录。以上调查只修改本文档。

## 2026-10-26 扩展审计：补充独立拆分输入

实际文章覆盖检查表明，问题集中在常用字的取形解释，不是现代读音库规模。旧 libre-flypy 发布物本身包含部分错误或缺失的全码；仅增加该发布物的行数不能恢复这些字。扩展时需要区分原发布记录与新工具推导记录，保留各自来源，不能把新结果说成上游原表的 CC0 记录。

### kfcd/chaizi：已采用的独立部件候选输入

- [固定版本](https://github.com/kfcd/chaizi/tree/e177ab54ce4edf255315a60593ffecbd8167e96b)：`e177ab54ce4edf255315a60593ffecbd8167e96b`。上游 [README](https://github.com/kfcd/chaizi/blob/e177ab54ce4edf255315a60593ffecbd8167e96b/README.md) 明确署名 © 2015 開放詞典，[LICENSE](https://github.com/kfcd/chaizi/blob/e177ab54ce4edf255315a60593ffecbd8167e96b/LICENSE) 及 README 均指定 CC BY 3.0。
- `chaizi-jt.txt`、`chaizi-ft.txt` 记录每字的一至多种部件序列；多种拆法可以包含部首及其变体。按固定两个文件实际合并得到 20,466 个不同字键。上游 README 的 17,803 字描述不等同于此合并统计，也不代表有同样数量的小鹤可训练字。
- 原输入、上游许可和说明按原字节保留在 `tools/shape-expansion/inputs/`，完整 Creative Commons 法律文本也随附；逐文件 URL、摘要和转换方法见 `data/shape-expansion-inputs.lock.json`，署名见 [扩展取形通知](../data/NOTICE-shape-expansion.md)。
- 采用范围仅为普通部件拆分的候选依据。它不是小鹤字根表，不能把任意拆法当作权威鹤形，也不能倒推根名；最终训练记录仍须有实际可追溯的规则路径和独立核验。

### Unicode 等价关系与明示笔画序列

- [Unicode 17.0.0 Equivalent Unified Ideograph](https://www.unicode.org/Public/17.0.0/ucd/EquivalentUnifiedIdeograph.txt) 以 Unicode-3.0 提供部首、笔画与视觉相同或近似的统一汉字的明确对应关系，原文件及许可已锁定保留。它补充候选字形关系，不能独立证明小鹤某一码位等价。
- [TJYSunset/Strokes.txt 固定版本](https://github.com/TJYSunset/Strokes.txt/tree/f993e6d7cd348e34d35efda29e356c258fb277c5) 以 WTFPL 提供未拆 IDS 组件的明确笔画字符序列。上游 README 说明对汉典和 Andrew West IDS 的参考，并保留历史 CC0 来源讨论，亦明确承认笔画类别和地区笔顺局限。本项目保留原说明与许可，仅把其实际序列作为可核验候选输入；不从一般 IDS 顺序生成冒充来源的笔顺。文件及摘要已加入扩展输入锁。

### 其他新检查的候选

- [if-the-time-could-stop/flypy_extension](https://github.com/if-the-time-could-stop/flypy_extension/tree/a150888cae6a90f595b5f68b6b29f8820edc81f5)：固定 `a150888cae6a90f595b5f68b6b29f8820edc81f5`，仓库 GPL-2.0。README 明确其拆分输入为 kfcd/chaizi、拼音输入为 pinyin-data，并说明零声母实现采用了另一种处理方式。该版本缺少运行所需的 `parts.txt`；生成器和输出中也存在与当前小鹤不一致的规则。没有直接采用其 24,077 条输出，避免把算法枚举结果当作核验后的新字库。
- [gaboolic/moqima-tables](https://github.com/gaboolic/moqima-tables/tree/6d8ba8f1c57466f358e682baefe11bbd0fe389ab)：MIT，独立墨奇码的拆分资料，范围较大，但其规则、字根和首末选择与小鹤不同。没有把墨奇形码重命名为小鹤形码，也没有直接采用其取形结果。
- [amorphobia/openfly](https://github.com/amorphobia/openfly/tree/f0982a96291c1d221753cf5a049778fd88ce45e2)：再次核对，HEAD 与前次一致。README 仍将官方词库归于 EULA、其他整理归于 BY-NC、程序归于 MIT；未新增明确的逐字首末根解释来源或数据授权清单。前次暂不作为独立教学数据的结论保持不变。
