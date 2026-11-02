# 声韵键位、普通话读音与字频来源调研

调研及下载日期：2026-10-25（Asia/Dubai）。候选原始文件只下载到 `/tmp/xiaohe-survey-sound`；仓库纳入下述两份可复现的衍生 JSON、转换脚本、来源锁和许可通知。形码与小鹤取形的审计另行记录。

## 采用结论

| 数据层 | 采用来源 | 实际范围 | 许可及发布义务 |
| --- | --- | --- | --- |
| 小鹤声韵与零声母 | `sharebravery/shuangpin-practice` 的 `src/data/schemes.ts`，固定提交 `4927919362cadcda6e61375a04bc75a1e47e6639` | 仅 `xiaohe` 对象：23 个声母映射、32 个韵母映射、12 个零声母音节；保留原始小写及 `v/ve` 拼写 | MIT；保留作者版权与完整许可通知。见 [NOTICE-shuangpin-practice.txt](../data/NOTICE-shuangpin-practice.txt)。 |
| 单字读音与多音备选 | Unicode 官方 Unihan **17.0.0**，`Unihan_Readings.txt` 的 `kMandarin` 与 `kTGHZ2013` | 44,348 字；默认按 `kMandarin` 源顺序，其后补充不同的 `kTGHZ2013` 读音；不从其他字段猜读音 | Unicode-3.0；随数据或关联文档保留版权与完整许可通知。见 [NOTICE-Unicode.txt](../data/NOTICE-Unicode.txt)。 |
| 训练排序计数 | 同一官方文件的 `kHanyuPinlu` | 3,799 字的逐读音计数按字求和；没有频率的字保持缺失 | 同上。必须标明语料背景；不作现代互联网频率或覆盖率承诺。 |

固定历史 Unicode 版本是为了可重建，本项目不声称已使用最新 Unicode。原始 ZIP、成员文件、上游映射、许可和衍生 JSON 的 SHA-256 均在 [sources.lock.json](../data/sources.lock.json)。

MIT 声韵来源的[第三方来源说明](https://github.com/sharebravery/shuangpin-practice/blob/4927919362cadcda6e61375a04bc75a1e47e6639/THIRD_PARTY.md)明确称方案规则依据公开规则重新整理、没有复制第三方业务源码。已人工查看[小鹤官方键位图](https://flypy.cc/images/hejp.png)及[零声母说明](https://flypy.cc/images/uplu.png)，核对其映射一致；官方图片仅用于核验，不随项目分发。

## JSON 契约与转换规则

`src/data/generated/sound-mapping.json` 仅包含 `initials`、`finals`、`zeroInitials` 三个对象，均为音节片段到小写键位的映射。`v` 和 `ve` 是上游对 `ü` 和 `üe` 的拼写约定；`ue` 等别名及教材展示由领域层明确处理。零声母使用完整两键映射，不生成假的声母：`a → aa`、`an → an`、`ang → ah`。

`src/data/generated/readings.json` 包含 `metadata` 与 `characters`。`characters[字]` 的字段如下：

```json
{
  "readings": ["zhōng", "zhòng"],
  "readingSources": {
    "zhōng": ["kMandarin", "kTGHZ2013"],
    "zhòng": ["kTGHZ2013"]
  },
  "frequency": 4941
}
```

上例为「中」。保留源带调拼音，统一 NFC；没有声调符号的源读音保持原样。`readings` 有序去重，`readingSources` 保留每个读音具体来自哪个字段。`frequency` 是源字段所有读音计数的和，不把频率字段中的额外读音自动加入答案集合。

`kMandarin` 主要服务排序与转写；有两个值时第一项是 zh-Hans 偏好，第二项是 zh-Hant 偏好，并不保证覆盖所有字典的偏好。`kTGHZ2013` 给出《通用规范汉字字典》的读音。本次下载统计分别为 44,348 字与 8,105 字，后者均已有 `kMandarin`；合并读音后覆盖仍为 44,348 字。字段意义以 [Unihan 17.0.0 的 UAX #38](https://www.unicode.org/reports/tr38/tr38-39.html#kMandarin)为准。

本次没有采用 `kHanyuPinyin` 或 `kXHC1983`。例如 `kHanyuPinyin` 给「某」列出 `méi,mǒu`，给「行」列出五个不同音；不能未经解释就把这类旧字典/罕见读音当作现代普通话训练答案。本次「某」只有 `mǒu`；「行」保留 `xíng,háng,héng`；「重」为 `zhòng,chóng`。这些是字级备选，不进行词语或上下文消歧；领域层仍需明确选择训练读音。

`kHanyuPinlu` 是较早的频率词典数据，源文档说明其语料为 1,807,389 字，涵盖新闻、科技、口语、文学四类；简繁转换、合并会让不同字形共享计数。取逐音计数之和可用于本工具的推荐顺序，但不得将不同字的计数再相加后宣称现代中文覆盖率。[来源说明](https://www.unicode.org/reports/tr38/tr38-39.html#kHanyuPinlu)

## 可复现导入与验证

仅使用 Python 标准库；不新增 npm 运行时依赖。默认从锁定 URL 获取并校验原始文件；校验失败会在写文件之前中止。

```bash
python3 scripts/import-unihan.py
python3 scripts/import-sound-mapping.py

# 重新获取上游、重算衍生结果，与仓库文件逐字节核对。
python3 scripts/import-unihan.py --check
python3 scripts/import-sound-mapping.py --check

# 可从已经下载的、仍须通过相同 SHA 校验的文件离线重建。
python3 scripts/import-unihan.py --source /path/to/Unihan.zip --check
python3 scripts/import-sound-mapping.py --source /path/to/schemes.ts --check
```

验证覆盖了完整条目数、频率覆盖数、有序去重及逐读音来源、常见多音字与排除旧音的样本、许可通知与生成物的锁定摘要，以及损坏上游文件被拒绝且不产生输出。两份来源、版本和修改说明须在交付仓库与分发产物中保留，不能只给根代码 MIT 许可。

## 调研后未采用的候选

| 来源 | 实际核验结果 | 本次决策 |
| --- | --- | --- |
| `rime/rime-double-pinyin` | 固定提交 `01a13287cbd27819be1c34fa1ddc1b3643d5001b`；`double_pinyin_flypy.schema.yaml` 版本 `0.18`。根 LICENSE 是 GPLv3；AUTHORS 明确该文件属于 Gong Chen 的 GPLv3 作品。部分下游发行包写 LGPL，与上游不符。 | 可作映射核验；本次未复制其 YAML、正则代码或生成结果。采用有独立整理说明的 MIT 声韵表。[上游 AUTHORS](https://github.com/rime/rime-double-pinyin/blob/01a13287cbd27819be1c34fa1ddc1b3643d5001b/AUTHORS) |
| `mozillazg/pinyin-data` | 固定提交 `9d05c9e29cb6a7e5c79f2f5279f5c1014246a19a`；根 MIT。`pinyin.txt` 由多个来源合并，包括 Unihan、`cc_cedict.txt`、`zdic.txt` 和手工覆盖。 | 不导入合并文件。直接从 Unicode 官方下载有明确授权的字段，减少混合来源与旧音问题。[README](https://github.com/mozillazg/pinyin-data/blob/9d05c9e29cb6a7e5c79f2f5279f5c1014246a19a/README.md) |
| `pinyin-data` 的五份 Unihan 字段文件 | `kMandarin.txt`、`kTGHZ2013.txt`、`kHanyuPinyin.txt`、`kXHC1983.txt`、`kHanyuPinlu.txt` 的上游可追溯到 Unihan，但其格式转换和根 MIT 不会替代 Unicode 数据通知。 | 本次直接用官方 17.0.0 ZIP，不经该仓库转换，且不复制其转换程序。 |
| `pinyin-data/cc_cedict.txt` | README 明确由 CC-CEDICT 生成。CC-CEDICT [官方页面](https://cc-cedict.org/wiki/)目前声明 CC BY-SA 4.0；所导入历史快照的具体版本与当时条款仍需单独核验。 | 不把根 MIT 视为覆盖其上游署名/相同方式共享义务；本次排除。 |
| `pinyin-data/zdic.txt` 及人工补丁 | README 指明汉典、手工更正、Wikipedia 等参考；没有逐条证明全部输入可按 MIT 再分发的来源链。 | 本次排除，无需用这些输入实现当前范围。 |
| SUBTLEX-CH 字频 | 从 [Ghent 大学官方入口](https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexch/overview.htm)下载 `subtlexchchr.zip`；包含 `SUBTLEX-CH-CHR.xlsx` 和纯文本 `SUBTLEX-CH-CHR`，无单独许可文件。官方入口要求研究引用论文；未发现明确适用于下载数据的再分发授权。 | 不把论文 CC 许可或第三方网站的许可断言自动套到下载数据。当前用明确授权的 Unihan 计数，不采用该 ZIP。 |
| BlueSky-07/Shuang | 固定提交 `5a5e71e1ebeab2894f40121d680b9942e30609bb`；`src/scheme/xiaohe.js` 包含完整映射，根为 GPLv3。 | 无需引入 GPL 代码；未采用。 |
| gkovacs/fcitx-rime-config | README 称 MIT，但其 flypy schema 仍保留 Rime 作者署名。 | 不能只凭根 README 排除上游 GPL 义务；未采用。 |

## 调研快照摘要

以下候选摘要用于定位本次实际读取文件，不表示批准采用：

| 文件 | SHA-256 |
| --- | --- |
| Rime `double_pinyin_flypy.schema.yaml` | `6b522a7e9cb743474287a14678597460bd124369f32573dd63e8f04e7c41d4b9` |
| `pinyin-data/pinyin.txt` | `90c11bd680ccfe7f2617a6e25abdb1fb87b5540df3e6f011ca50aaf3c7263a89` |
| `pinyin-data/LICENSE` | `9c048697be2502a16e8bcb282d5d465a07295b2def0ffb05a269c5d39dbe1586` |
| 官方 `subtlexchchr.zip` | `ac5f26c497bf3975bec52895cef039cdb72b667dc3c95f05e4ee35ca8cb97a1f` |
| 官方 `hejp.png`（仅核验） | `2abd26102c71c039cf379c193eff49ef88fff98cd8b237cb5fe30a7327bdf1e6` |
| 官方 `uplu.png`（仅核验） | `5f9a8e7b0a016ed65c968e4d3bff8e530bdc4d3051a42f6885cbbb8707badf54` |

已采用来源的完整 SHA、URL、作者、版本、许可、修改记录和生成物摘要以 [sources.lock.json](../data/sources.lock.json)为准。
