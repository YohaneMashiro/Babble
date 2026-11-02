# 小鹤取形追踪工具

本目录保留 [OverflowCat/libre-flypy](https://github.com/OverflowCat/libre-flypy) 1.2.0 的 AGPL-3.0 源码、原许可、声明及锁定输入。`src/main.rs` 只增加 25 行，记录生成器实际查表使用的首末根与传播路径，未改变编码决策；完整差异见 `trace.patch`。

例如「你」的末形路径是 `你 → 尔 → 小`。直接取顶层 IDS 的「尔」会误教，不能从末形码 `x` 反推字根。这里保留真实传播记录，再严格核验。

## 复现

在 WSL 安装 Python 3.10+、Rust 编译器和系统链接器后运行：

```bash
python3 tools/libre-flypy-audit/rebuild.py \
  --reference /absolute/outside/project/ixdata.json \
  --check
```

省略 `--check` 会重新生成 `src/data/generated/shape-traces.json`。依赖文件及源码的 SHA256 在 `data/shape-sources.lock.json`。脚本会校验全部锁定文件，并在系统临时目录编译、运行。此过程不联网，正常网页构建也不请求研究数据。

`--reference` 必须指向项目外的临时研究文件。官网查形页公开加载的 `https://flypy.cc/ix/ixdata.json` 未发现开放再分发许可，未放入源码、构建产物或此目录。脚本仅读取它比较全码和两个根；接受条目的字段全部来自本目录有许可的生成器和输入，研究文件原始字符串不写入输出。研究文件校验和也锁定，内容变化需要重新审计。

选集要求发布物全码、生成器首末根与研究参考的全码/首末根完全一致；不补码、不改根、不设置同形别名。接受 6,596 个字、7,014 个唯一全码。生成器的 52,743 行里私用区根、问号根、替换符根均为 0；仍保留显式排除机制。统计在生成文件 `metadata.statistics`，排除理由按每行遇到的首个失败条件计数。

上游未锁数据依赖。本工具锁定 2023-07-07 之前最近的 IDS 和拼音提交，产物与发布物尚有 147 条唯一记录差异；这些差异通过发布物交集过滤，未修改编码规则消除差异。当前上游最新拼音数据不适用于此旧生成器（`túnwǎ` 解析失败），因此必须使用锁定输入。

`idsTree` 是原生成器的树结构调试字符串，不是完整的教学拆分。路径是生成器查表来源，不是笔顺教程。本选集只审核码和根，读音须另用已许可来源核对后接入训练。

## 许可

- 工具源码及保守按衍生资料分发的取形 trace：AGPL-3.0，保留 `LICENSE`、源码、修改说明。原始代码来源见 `UPSTREAM-README.md`。
- 发布全码表：上游声明 CC0-1.0；这不把工具、trace 或输入许可改为 CC0。
- IDS：MIT，Copyright (c) 2021 Yi Bai。
- 拼音数据：MIT，Copyright (c) 2016 mozillazg；保留其 Unihan/Unicode 数据通知。

输入许可在 `inputs/IDS-LICENSE`、`inputs/PINYIN-LICENSE`、`inputs/UNICODE-LICENSE`。来源、commit 和校验和见独立数据锁。进一步通知见 `data/NOTICE-shape-traces.md`。

将本 trace 合入应用分发时，保守按 AGPL 组合义务提供完整对应源码及许可证、修改说明、可复现构建步骤，并向网络用户提供显著源码入口。原创文件可同时保留 MIT 授权；这不免除组合分发的 AGPL 义务。
