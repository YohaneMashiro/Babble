# 下一轮覆盖研究的程序快照

这些文件保存本机已经执行的研究与独立复核程序版本，供工程师审查、复跑和移植。**不是生产生成器，也不是已经参数化的跨机器CLI**。程序仍包含当次实验的绝对目录；正式工程应将输入、输出和参照路径参数化，并继续采用项目外参照与固定摘要检查。网页不导入或执行本目录。

`programs.lock.json`记录每份副本的SHA256、字节数及原研究位置。可在项目根执行：

```sh
node tools/coverage-next-research/check-snapshots.mjs
python3 tools/coverage-next-research/verify-workspace.py
```

目录对应关系：

- `reading-policy/`：六个Unihan属性、上游助记与现代读音并集、等价字形助记迁移；整字字典异读另外研究，不自动变成现代默认音。
- `decomposition/`：固定拆分源、保留标签的IDS解析、结构切分、只展开一个有来源的命名部件，以及随后单独比较。`leaf-expansion/run.py`含统一身份、循环和组合上限检查。
- `common/`：有限常用字的笔画范围、根身份、源码声码生成与分离比较。它只给有限端点，不是通用字形识别器。
- `checker/`：另一代理编写的独立源解析、全量候选重算、集合与来源见证复核。它们不调用研究生成器得到预期集合。

完整本机研究树位于`/root/.cache/babble-coverage-next/`。原始官方参照、完整字码候选、期待码差异表和未澄清条款的数据均未复制到本目录。输入源版本、许可和实验结果见[总报告](../../docs/coverage-next-survey.md)、[拆分报告](../../docs/coverage-next-decomposition.md)、[读音报告](../../docs/coverage-next-reading-policy.md)、[常用字报告](../../docs/coverage-next-common-characters.md)及[工程交接](../../docs/coverage-next-implementation-handoff.md)。

复跑顺序是：固定输入及读音程序 → 全部候选与摘要落盘 → 独立比较 → 来源资格过滤 → 真实集合交并。禁止让比较表选择拆分、构造音节、修改部件或自动更新旧来源锁。原始参考不可放在项目内。上限丢弃、占位符、无源读音、解析拒绝及参考外候选分别保留统计。

程序原创部分按根目录`LICENSE-CODE`授权；所引用数据、根事实和相关常量仍保留其独立条款，不因此变成MIT数据。既有AGPL工具与合并发行规则继续适用。研究图形另保留Arphic条款；CJKVI涉及的GPLv2资料不因保存程序快照而成为默认可分发输入。

原checker的`audit-snapshot.py`执行于本目录尚未建立时，严格拒绝文档外的任何新增文件；其源码快照保留原样，直接用于当前目录会拒绝这些研究程序副本。新增`verify-workspace.py`仍逐字节核对原422份文件，只额外允许本目录清单中的40份研究文件，并要求生产JS保持不变。它用于研究阶段冻结检查；工程开始后不应拿它验收新产品。可用`--baseline`指定保存的同一基线源码包。
