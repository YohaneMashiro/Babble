# 大字集部件拼字研究工具

本工具复现一条广覆盖候选链：**明确来源的部件序列 → 固定读音策略 → 产品双拼算法 → `ok` 前缀的 6／8 键部件拼字 → 可选独立参照比较**。这是研究工具，不接入 Babble 页面、训练库、原 canonical 或既有来源锁；拼字候选不能冒称普通四码或已完成取形教学。

程序为 Babble 原创 MIT（根目录 `LICENSE-CODE`）。候选部件数据保留其 GPLv3 及底层来源条款；程序许可不替代资料许可。完整原资料和比较表均由使用者保存在项目外，源码包只包含工具、输入摘要及本说明。

## 固定输入与准备

- [mirtlecn/rime-radical-pinyin](https://github.com/mirtlecn/rime-radical-pinyin/tree/87e73d7182916f3db9dbc0b6a4d18a78a775b298)，提交 `87e73d7182916f3db9dbc0b6a4d18a78a775b298`。其 [src/README.md](https://github.com/mirtlecn/rime-radical-pinyin/blob/87e73d7182916f3db9dbc0b6a4d18a78a775b298/src/README.md) 逐项署名 kfcd/chaizi（CC BY 3.0）、CHISE/ids（GPLv2 or later）、yi-bai/ids（MIT），并声明 GPLv3。工具核对 `radical.yaml`、助记读音程序原件、来源说明及 LICENSE 的摘要。
- 现代读音及双拼键位沿用本项目固定的 Unicode 17.0.0 和现有键位表，同时核对 `sound.ts`、`dictionary.ts`、`encoding.ts` 的运行依赖摘要。程序通过 Vite 的本地 SSR 接口调用实际 `explainSound`，不另写一份双拼映射，不启动 HTTP 服务。
- 可选参照：[kchen0x/rime-crane 的 xhup.ok.dict.yaml](https://github.com/kchen0x/rime-crane/blob/71f3add6a39d58a8e8b35abc7ca9c998d766b274/xhup_dicts/xhup.ok.dict.yaml)，提交 `71f3add6a39d58a8e8b35abc7ca9c998d766b274`。该社区文件自称来自官方清风便携版；它是比较资料，不是本工具生成依据，也不能仅靠仓库 GPL 推定官方数据授权。

所需环境：WSL／Linux、项目 Node.js 22.12+ 和 `npm ci`，另需 Python 3。Python 只对固定上游源码做 AST literal 提取，不导入或执行上游程序，不安装 pypinyin 或其依赖。工具没有下载操作。

例如在项目外准备固定 checkout：

```bash
git clone https://github.com/mirtlecn/rime-radical-pinyin.git /external/radical-pinyin
git -C /external/radical-pinyin checkout --detach 87e73d7182916f3db9dbc0b6a4d18a78a775b298
git clone https://github.com/kchen0x/rime-crane.git /external/rime-crane
git -C /external/rime-crane checkout --detach 71f3add6a39d58a8e8b35abc7ca9c998d766b274
```

`/external` 是位置示例，替换成实际项目外目录。在 Babble 根目录执行：

```bash
npm run audit:coverage-research -- \
  --radical-root /external/radical-pinyin \
  --output-dir /external/new-results \
  --reference /external/rime-crane/xhup_dicts/xhup.ok.dict.yaml
```

省略 `--reference` 可仅生成候选，不打开官方来源的参照。所有原始输入和输出必须位于项目外；路径解析检查项目内别名及符号链接，输入与结果目录不能重叠。命令末端符号链接及输入文件符号链接直接拒绝，避免把悬空链接误认为新目录。同一输出目录可重复生成相同字节；已有不同内容不会被覆盖，应选择新目录。摘要不含当前时钟或机器绝对输入路径，便于对照复现。

任何固定输入的字节或摘要发生变化都会失败；没有 `--force`、自动更新锁或接受新官方版本的选项。有意调查新输入时应另做来源审查，保留本次基线。

## 两种独立读音策略

1. `modern-only`：每个部件按本项目固定现代读音的原顺序，选择第一个可被产品双拼算法编码的读音。
2. `source-aliases`：部件若有上游 `custom_dict` 显式助记读音，先使用该组的第一个可编码值；否则使用现代读音。它可能采用“横、折、单人”等助记称呼，**不能当作本字或部件的标准现代读音**。

两种策略分别生成，均只接受原文件明示的二／三部件且每个部件为单个 Unicode scalar。没有多音笛卡尔积、四部件压缩、由官方答案改分解或调读音。本字没有现代读音也可以通过有读音的组成部件产生拼字，这是该路线的主要广度来源。

完整生成两套候选以后才读取、校验及比较参照；参照不参与生成、选择或排序。完全匹配表示该字至少有一个候选拼字串与这份社区参照相同，不是小鹤教学准确率，更不是无参照长尾字的正确率。

## 本次实际复现

2026-10-28，Node.js 22.23.4，固定原输入共 120,315 个部件序列、98,483 个不同字键。便携版与此前项目外原型的两份候选 JSON **逐字节相同**。

| 指标 | modern-only | source-aliases |
| --- | ---: | ---: |
| 可生成拼字的源字键 | 88,952 | 89,189 |
| 不同字＋拼字串 | 96,341 | 97,078 |
| 本字没有现代读音、部件可编码 | 46,618 | 46,804 |
| 与比较表完全匹配的字键 | 53,809 | 57,661 |
| 比较交集中没有完全匹配串的字键 | 22,836 | 19,177 |

比较表为 88,020 个不同字码对、87,947 个字键。以上是源字键计数；若报告 **Unicode 汉字覆盖率**，须再与固定版本的 `Unified_Ideograph` 或明确目标字集求交，不能把 Unihan 全体码点、兼容汉字、统一表意文字混作同一分母。工具当前没有自动做该目标交集，根调研报告另列此项。

输出为两份候选 JSON、`summary.json`、GPL 许可、上游署名／来源说明、CC BY 许可、IDS 原始 MIT 许可及现有 Unicode／键位通知。候选包含原行号、部件及每个部件实际所用读音／双拼，便于后续抽样和定位差异；输出不会自动进入源码或正式训练库。

测试入口：`npx vitest run tests/coverage-research.test.mjs`。测试覆盖固定输入变化拒绝、实际 TSV 格式、AST 不执行、两策略不混合、不做多音组合、参照读取顺序及项目内／符号链接／输入输出重叠边界。
