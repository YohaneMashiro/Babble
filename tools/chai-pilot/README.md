# Chai 构建期试验

这是独立、离线运行的规则试验入口，不接入 Babble 按键反馈，不更新训练库或来源锁。原始字形、官方快照和逐字报告均留在项目外。包装脚本是 Babble 原创 MIT 程序；被调用的 Chai 核心为外部 GPL-3.0-only 程序，字根表仍保留原 AGPL 来源。

## 复现

使用 WSL、Node **22.13+**、Git、curl 和 tar。这个可选工具要求 Node 的 `stripTypeScriptTypes`；Babble 网页的最低 Node 版本不因此改变。

在项目外准备固定版本，例如：

```bash
git clone https://github.com/hanzi-chai/hanzi-chai.github.io.git /tmp/babble-chai
git -C /tmp/babble-chai checkout --detach f5a8c42fe93adc218014d22499f18d62449d5fc2

# 以下命令在 Babble 项目根目录运行。
node tools/chai-pilot/prepare.mjs --chai-root /tmp/babble-chai

mkdir -p /tmp/babble-chai-research
curl --fail --silent --show-error --max-time 60 \
  https://api.chaifen.app/repertoire/all \
  --output /tmp/babble-chai-research/repertoire-api.json

node tools/chai-pilot/run.mjs \
  --chai-root /tmp/babble-chai \
  --repertoire /tmp/babble-chai-research/repertoire-api.json \
  --output /tmp/babble-chai-research/analysis.json
```

`prepare.mjs` 仅下载 [dependencies.lock.json](./dependencies.lock.json) 固定的六个运行依赖，并在解压前核对 SHA512。它使用 Node 的 TypeScript 语法转换生成核心 `dist`，**不执行类型检查**，不运行上游或依赖的安装脚本，不安装 React / Ant Design / Bun / 前端开发依赖。它重建指定外部 checkout 中的 `packages/hanzi-chai/dist` 与这六个依赖目录；请为试验使用单独 checkout。

构建清单记录源码散列、编译产物散列、Node 版本、构建方式、依赖版本与 tarball 完整性。分析前会检查固定 commit、受跟踪源码是否改变，以及清单中源码与核心产物的散列。上游也提供 `npm install --workspaces=false && npm run build` 的 TypeScript 构建入口；本工具采用上述独立准备入口，以生成并校验自己的构建清单。其语法转换运行成功不能替代上游完整类型检查或全方案测试。

官方参照是可选的，仅在候选产生后用于比较。取得项目外快照后：

```bash
node scripts/official-ix-audit.mjs \
  --cache-dir /tmp/babble-official-cache \
  --report /tmp/babble-chai-research/official-report.json

# 从上述摘要的 source.sha256 找到 cache 内相应 <sha256>.json。
node tools/chai-pilot/run.mjs \
  --chai-root /tmp/babble-chai \
  --repertoire /tmp/babble-chai-research/repertoire-api.json \
  --reference "/tmp/babble-official-cache/<sha256>.json" \
  --output /tmp/babble-chai-research/compared.json
```

不要原样复制占位符 `<sha256>`；也可传入已有、位于项目外的 JSON 快照。`--reference` 不参与生成根、取形或候选筛选。程序只比较候选首末根及两位形码，不将拼音与官方全码按数组下标配对，也不宣称已经验证完整四码或读音。

`--characters 汉字` 可替换目标集合，上限 512 个不同汉字；控制字仍独立运行。默认目标是 2026-10-26 版本《花园中》缺失的固定 24 字，不会随日后训练库更新自动改变。默认控制字为“某你我中木水花是不书”。

## 基线配置与输出

[config.json](./config.json) 是明确标为试验的基线：

- 使用 Chai 的 G 字形、`no_cross: true` 和“全符笔顺、首末取大、根少优先”。
- 使用现有许可明确的 libre-flypy 首根 / 末根表的并集识别根，生成端点时再检查对应位置是否允许；末根表中的字不能自动充当首根。
- 分六类笔画，保留点与捺的区别；只将提认同为横。
- 每个目标分析时从根表中排除目标自身，防止整字直接吞掉分析。这是基线处理方式，不是已完成的小鹤独根字规则。
- 不根据官方答案补造命名部件，也不为配出编码替换未验证的根标签。

逐字报告保留 Chai 返回的原始根序列、生成端点、位置规则缺口和比较结果。只有首末根标签与形码**同时**匹配才计为 `roots-and-shape-match`；同码异根仍为差异。官方根数量、编码 token 或私用字符异常独立标记，不自动修复。原始字形和官方数据都没有获得本项目确认的开放分发许可，因此匹配也不会自动升级为可发布教学资料。

## 2026-10-27 实跑

固定核心 commit：`f5a8c42fe93adc218014d22499f18d62449d5fc2`。

本次项目外字形输入为 126,633 个记录、27,790,213 字节，SHA256：
`ace9bf889ad497b1ea722ab21f12cb6b3666e554c51ba9eba4dabef3900b54fd`。
该 URL 会变化；复现本次结果应保留相同快照，并检查报告记录的散列。

参照快照 SHA256：
`6968764d45720778e5c9a462c2807cf5cf9acbb34f2cdc4585be6025de6b1db1`。

| 集合 | 字数 | 成功运行分析 | 首末根及形码同时匹配 | 引擎错误 |
| --- | ---: | ---: | ---: | ---: |
| 文章缺字 | 24 | 24 | 5 | 0 |
| 控制字 | 10 | 10 | 6 | 0 |

目标匹配字为“生、大、升、夜、断”；控制匹配字为“某、你、我、中、木、书”。这是该配置的试验结果，**不是 Chai 的总体准确率**，也不代表这些字已加入训练库。

其余差异暴露了需要实现的具体规则：命名部件的定义、单笔与变体根的归类、首末位置专用根，以及“延 / 途”等走之、建之的取根顺序。部分差异只有根标签不同而形码相同，不能因此合并为通过。控制集尚未全过，当前配置保持试验状态。

远程字形许可本轮再次检查了上游 README、数据文档、获取脚本和 API 模型源码，仍未找到明确独立条款；源码 GPL 声明不替代远程字形数据的许可声明。

来源：[核心固定版本](https://github.com/hanzi-chai/hanzi-chai.github.io/tree/f5a8c42fe93adc218014d22499f18d62449d5fc2/packages/hanzi-chai)、[字库结构文档](https://docs.chaifen.app/development/data/)、[上游获取脚本](https://github.com/hanzi-chai/hanzi-chai.github.io/blob/f5a8c42fe93adc218014d22499f18d62449d5fc2/scripts/fetch.ts)、[模型转换定义](https://github.com/hanzi-chai/hanzi-chai.github.io/blob/f5a8c42fe93adc218014d22499f18d62449d5fc2/src/api.ts)。
