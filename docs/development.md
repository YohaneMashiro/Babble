# 本地运行与开发

Babble 是浏览器端应用。日常练习、文件读取与自动注音不需要后端服务。

## 本地启动

需要 Node.js 22.12 或更新的受支持版本，以及 npm。

```bash
git clone https://github.com/YohaneMashiro/Babble.git
cd Babble
npm ci
npm run dev
```

打开终端给出的地址，通常是 `http://127.0.0.1:5173/`。界面、课程、预置文章和普通练习可以直接使用。浏览器模型不纳入 Git；要在本地为自己的文章自动注音，先准备下面的模型资源。

## 自动注音与完整构建

完整部署需要 g2pW 模型和对应运行时。使用 Python 3.12，缓存放在项目目录外：

```bash
python3 -m venv ~/.cache/babble-g2pw/venv
~/.cache/babble-g2pw/venv/bin/pip install -r tools/g2pw/requirements.txt
~/.cache/babble-g2pw/venv/bin/python tools/g2pw/prepare.py \
  --cache ~/.cache/babble-g2pw --download
npm run check:g2pw
npm run build
npm run preview
```

首次准备会下载约 589 MB 的上游模型 ZIP，以及词表和许可文件，随后生成量化分片。浏览器首次启用时的必要资源约为 175.5 MB，和构建时的下载量不同。所有来源固定版本并校验摘要；正常构建不会自动下载模型。完整步骤、默认文章重新注音和许可见 [g2pW 文档](g2pw-model-build.md)。

构建输出位于 `dist/`。请通过 HTTP 服务预览，避免直接以 `file://` 打开 HTML。部署时保留 `dist/models/`、许可通知与对应源码下载。

## 检查

```bash
npm test
npm run lint
npm run build
```

`lint` 检查严格类型和未使用代码。部分来源检查需要 Python 3.10 或更新版本。完整构建会离线校验数据、字体和模型；缺少部署资源时会给出错误。

真实浏览器检查脚本位于 `scripts/`，包括两级入口、连续文本、自动注音、字形和取形教学。Playwright 与 axe 是可选的外部 QA 工具，不属于应用运行依赖。

## GitHub Pages

仓库使用 [Pages 工作流](../.github/workflows/pages.yml)。更新 `main` 时，工作流检查源代码、准备固定模型资源、构建站点并发布 `dist/`。GitHub Pages 的构建来源设为 GitHub Actions；无需额外配置模型 API 密钥。

也可以将完整 `dist/` 上传到其他静态托管服务。模型从同一站点加载，部署路径和资源目录需要一起保留。

## 项目资料

- [架构](architecture.md)
- [数据来源与局限](data-sources.md)
- [取形教学](pedagogy.md)
- [g2pW 模型重建](g2pw-model-build.md)

修改字库或生成程序时，请保留原始来源、许可和校验记录。新增内容应附有可核对依据；读音预测不能代替小鹤编码来源。
