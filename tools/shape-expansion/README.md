# Babble 取形扩展

本工具从有许可的部件、笔顺及字形输入独立形成候选，经全码与首末形核对后生成补充记录。旧 `shape-traces.json` 与其原始许可、摘要保持不变。

## 离线复现

需要 Python 3.10+，没有第三方 Python 包或网络请求。参考 JSON 必须自行放在项目外，并与锁中的研究摘要相符；参考原文件不随项目分发。

```bash
python3 tools/shape-expansion/generate.py \
  --reference /absolute/outside/project/ixdata.json --check
```

省略 `--check` 可重建产物；程序和接受策略发生已审查变更时，使用 `--update-lock` 更新派生输出锁。即使使用该选项，也会先验证上游输入锁的摘要和大小、旧程序输入及现代读音 / 声韵数据，拒绝把修改后的输入继续描述为原固定版本。

输入来源和完整通知见 [NOTICE](../../data/NOTICE-shape-expansion.md) 及 [输入锁](../../data/shape-expansion-inputs.lock.json)。工具、输入摘要及输出摘要见 [生成锁](../../data/shape-expansion.lock.json)。

## 推导与限制

候选首末路径来自同一顶层 IDS 或拆字方案，然后沿对应边界递归。显式笔顺记录可提供实际首末笔；使用横、竖、撇、点、折、捺六类，并保留字形归类和来源路径。Unicode 映射只使用表内关系。根键定义、Yi Bai IDS 和 OverflowCat 的修订输入分别署名。

候选程序会枚举来源已有的拆法及部件 / 笔画边界，只有全码及根均通过外部核对的结果才能分发。它不从编码字母反推根名，不复制参照字段构造记录。比较时可去掉根后显式附加的拉丁读音注记；不替换汉字部件名。原参考文件必须留在项目外。

普通 IDS 与拆字字典本身不是完整小鹤教学拆分，递归路径也不是笔顺教程。无法核对的字继续保持缺失，不把枚举出的候选规模当作可训练覆盖。

新记录保留 AGPL-3.0-only 生成资料义务与各输入的独立许可 / 署名，不能套用旧发布全码表的 CC0 声明。完整 AGPL 文本随项目根目录 `LICENSE` 及旧工具的 `LICENSE` 分发。

可用 `node scripts/audit-coverage.mjs [text-file]` 统计实际运行库的全文覆盖，默认读取 `HY.txt`，只输出统计与缺字，不上传原文。
