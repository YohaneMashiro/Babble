# g2pW 本地模型与默认文章注音

本阶段采用作者发布的 g2pW v2 ONNX 权重，在浏览器的 Web Worker 中通过 ONNX Runtime Web 执行。原始权重、中文 BERT 词表和字典均固定到具体版本并记录 SHA-256；完整清单为 [`data/g2pw-model.lock.json`](../data/g2pw-model.lock.json)。小鹤编码仍来自已有字库，模型只提供拼音候选依据。

## 加载与隐私

- 首屏、打开自定义文本和使用《花园中》的预置注音均不需要加载模型。
- 点击“上传 TXT”时才启动模型加载；粘贴文本可通过独立的启用按钮启动。模型加载后可在当前页面复用。
- 模型、字典和运行时从本站下载。文本推理发生在本机浏览器，不向 g2pW 作者、模型托管站或远程推理服务发送用户文本。
- 自动读音仍可能出错；无法与现有读音匹配时保留人工选择，不通过模型制造小鹤音形编码。

原始 FP32 ONNX 为 **635,212,732 字节**。当前固定版本对 MatMul 和 Gather 权重做动态 int8 量化，得到 **159,287,333 字节**，拆成 8 个不超过 20 MiB 的分片。加上必要的词表/字典、WASM 和运行时入口，首次需要下载约 **175.5 MB**，另有少量应用脚本。该模型依然较大；使用单线程 SIMD WASM，无需页面启用跨源隔离，也无需 GPU。下载和初始化错误可以重试，也可继续手动选音。

## 重建部署资源

在项目目录内使用 WSL 执行。原始下载和中间权重必须放在项目目录外，准备程序会拒绝项目内缓存。

```bash
npm ci
python3 -m venv ~/.cache/babble-g2pw/venv
~/.cache/babble-g2pw/venv/bin/pip install -r tools/g2pw/requirements.txt
~/.cache/babble-g2pw/venv/bin/python tools/g2pw/prepare.py \
  --cache ~/.cache/babble-g2pw --download --preprocess
node scripts/check-g2pw.mjs
npm run build
```

`--download` 允许获取已固定来源的缺失输入。所有输入都先校验字节数和 SHA-256；下载的 Python 配置只用 AST 读取字面量，不执行其中代码。已有原始 ZIP 可通过 `--archive /外部路径/G2PWModel-v2-onnx.zip` 指定。缓存存在时，程序仍校验下载输入和量化权重；`--force` 会用固定 Python 依赖重新执行量化，并要求输出符合已固定摘要。

`--preprocess` 使用同一个 int8 模型本地生成 [`src/data/generated/default-pinyin.json`](../src/data/generated/default-pinyin.json)。每项位置以 Unicode 码点计算，与原始 the_Tower_of_Babel.txt 一一对应，保留换行、英文、标点和补充平面字符。常规字典读音与实际进入神经模型的 `modelIndices` 分开记录。原文 SHA-256 绑定默认注音；更改文章后应重新运行预处理。

生成器的中文 BERT 词表按官方 `BertTokenizer.load_vocab` 的文件行规则读取，保留词表中的 U+2028/U+2029。不能使用 Python `str.splitlines()` 分割词表，否则会额外拆词并让后续 token ID 错位。

完整部署需要 `public/models/g2pw/` 下的分片、manifest、metadata、WASM、运行时入口和许可文件。可下载源码包保留小文件、预置注音和重建程序，省略体积大的模型分片和运行时二进制；收到源码包后按上述命令重建。仅校验源码包时可运行：

```bash
node scripts/check-g2pw.mjs --source-only
```

完整校验不需要联网，逐个核对分片 SHA、拼接后模型 SHA、运行时、词表、生成程序与文章注音位置。缺少部署文件会明确失败，不会悄悄使用其他模型。

## 已执行的本地验证（2026-11-02）

原始 FP32 与 int8 都在本机 ONNX Runtime CPU 执行，未调用远程注音服务。结果保存在 [`g2pw-validation.json`](research-assets/contextual-pinyin/g2pw-validation.json)，可重新运行：

```bash
~/.cache/babble-g2pw/venv/bin/python tools/g2pw/validate.py \
  --cache ~/.cache/babble-g2pw \
  --output docs/research-assets/contextual-pinyin/g2pw-validation.json
```

- 《花园中》共 2,197 个码点，其中 1,840 个汉字都有读音结果；837 个位置使用神经模型，其余使用作者字典。预置 JSON 与重新执行 int8 的全部读音、模型位置完全一致。
- FP32 与 int8 在文章中有 1 个位置的读音不同（源码点索引 824）。目前不将任一结果视为人工校对答案；界面保留更改入口。
- 73 个原创诊断句、74 个指定多音字目标中，FP32 与 int8 都有 63 个目标符合预期，两个版本的这些目标预测完全一致。预期比较忽略声调。

这组小样例专用于发现集成问题，不能代表通用准确率，不能用论文的官方测试集成绩替代本产品验证，也不能保证人名、地名、古文、台湾和大陆异读都符合用户习惯。读音覆盖数同样不表示每处读音都已人工校对。

## 来源与许可

- [g2pW 作者仓库](https://github.com/GitYCC/g2pW/tree/b9328ce8129c4717a70f16a2688542a0197541dd)，Apache-2.0；作者 [Hugging Face 权重固定版本](https://huggingface.co/YC-Chen/g2pW/tree/fb4784f7dce8466a53dd4f3552f5a4c5b657b90c)。原始归属和 Babble 的量化、分片、位置适配修改见 `public/models/g2pw/NOTICE.txt`。
- [google-bert/bert-base-chinese 固定词表版本](https://huggingface.co/google-bert/bert-base-chinese/tree/8f23c25b06e129b6c986331a13d8d025a92cf0ea)，Apache-2.0。
- [ONNX Runtime v1.31.1](https://github.com/microsoft/onnxruntime/tree/v1.31.1)，MIT；完整许可和第三方声明随部署放在 `public/models/g2pw/runtime/LICENSE.txt`、`ThirdPartyNotices.txt`。

没有将原始官方评测语料、下载缓存、HY.docx 或用户导入的其他文本加入模型资源。
