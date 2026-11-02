# 本轮三引擎回归记录

日期：2026-10-28（Asia/Dubai）。本报告记录最终生产构建的实际浏览器检查，结论适用于本地初版迭代。它不代表完整 PRD、真人学习效果或公开发布验收已经完成。

## 被测构建与环境

生产文件为 `dist/assets/index-BC8jNkjE.js`，1,977,957 字节，SHA256：

```text
50e653fa1ba34feb20a69af1073c7732ae0c1b7f2c4a855406b386661834ca46
```

通过 WSL Ubuntu 24.04 的独立 Python 静态服务访问完整 `dist`，地址为 `http://127.0.0.1:4173/`。测试期间产品代码及构建固定；源码包和来源通知的下载端点可访问。测试环境为 Node 22.23.4、Playwright 1.64.1、`@axe-core/playwright` 4.14.0。浏览器、工具及解压的 Linux 共享库均位于项目外，没有增加产品依赖。

共享库未安装进系统的 ldconfig 清单，因此运行时设置 `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`，并通过实际启动、加载和完整回归验证引擎；没有以 Chromium 替代缺失引擎。WebKit 的外部共享库目录另补了链接，解决旧 `/tmp` 库链接失效导致的启动问题。默认 viewport 为 1440×1050、device scale 1；脚本另测窄屏、深色与 reduced motion，关闭自动闲时提示以固定交互。

## 实际结果

每个引擎分别运行四个脚本，表中是独立检查数量；axe 数量是页面状态扫描次数，不是 WCAG 全面合规认证。

| 引擎及实际版本 | 自由学习 | 学习路径 | 自定义文本 | 取形教学 | 检查合计 | axe 状态数 | 违规 / 页面及控制台错误 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Chromium 156.0.8078.4 | 24 | 19 | 23 | 23 | 89 | 49 | 0 / 0 |
| Firefox 157.0 | 24 | 19 | 23 | 23 | 89 | 49 | 0 / 0 |
| WebKit 27.2 | 24 | 19 | 23 | 23 | 89 | 49 | 0 / 0 |
| 合计 | 72 | 57 | 69 | 69 | **267** | **147** | **0 / 0** |

每引擎 axe 分配为 13＋10＋20＋6，标签为 `wcag2a`、`wcag2aa`、`wcag21a`、`wcag21aa`。现有脚本对训练按键、课程进度与 TXT 选择/解码分别断言没有新增网络请求，均通过。完整页面、下载和查询的首载请求不在该“无逐键请求”断言之内。

自由学习检查覆盖隐藏答案、错误码位和前缀保留、逐级提示、实体/虚拟键盘、原生按钮快捷键、修饰键/重复/IME 过滤、Inspector、多音及来源、未知与仅读音字、设置、窄屏与深色。学习路径检查覆盖 15 课程自由进入、按目标码位评分、两次独立完成、提示/错误/跳过对连胜的影响、IndexedDB 恢复与不可用降级。文本检查覆盖 HY 原文、英语标点换行保留、UTF-8 TXT 上传及长度/字节边界、无效编码、逐出现位置读音、分页、缺字跳过和局部进度。

新增 [shape-teaching-smoke.mjs](../scripts/shape-teaching-smoke.mjs) 复用公共浏览器配置，保留本次教学回归，三引擎实际执行此便携版本通过。它的 23 个检查包括：

- 默认隐藏取形教学；同页首/末形展开保留已接受前缀并切换高亮；Inspector 关闭后仍保留训练前缀。
- 13 字逐个核对正式全码、部件标签、两个端点及来源入口：某、语、框、国、试、中、鹤、木、玉、主、元、建、健。11 例为取根/笔画归类序列，鹤、健为端点及未展开区域，界面明确区别取码顺序和真实笔顺。
- 未复核教学字显示“完整教学分析待补”，不生成完整序列；外部依据链接采用 HTTPS 和 `noreferrer`。
- 320px 展开规则无页面/对话框水平溢出；深色、reduced motion 正常。人工查看本次 Chromium 窄屏和 WebKit 深色截图，未发现文字重叠或布局溢出。
- 仅练首形时，查看已提供的末形所展开的完整解释也记协助；查看目标首形同样记协助。最终尝试的 `assisted` 为 true，独立掌握连胜为 0。

## 本轮修复与中断的处理

此前一次长回归的预览服务终止，导致连接拒绝或等待保存超时，未作为产品通过或产品缺陷的证据。本轮恢复独立服务后，各组全部重新完成。旧结果备份在项目外 `/root/.cache/babble-qa/prior-interrupted-run/`，最终 JSON、日志及截图位于 `test-results/completion/{chromium,firefox,webkit}/`；测试产物不加入源码分发包。

回归也验证了三项有针对性的修正：新增教学嵌套 details 后，键位总映射的测试选择器明确为直接子 summary；Firefox 原生对话框关闭会恢复按钮焦点，测试在需要全局 Enter 前显式 blur；文本中不可训练字按钮的可访问名称改为可见字符开头，Firefox 的 `label-content-name-mismatch` 不再出现。未关闭 axe 规则或修改产品键盘行为绕过检查。

## 复跑方式与边界

在项目外安装对应版本工具和引擎，先构建并启动生产预览，然后运行下列命令。这里的工具路径是本次实际环境；其他机器替换为其外部安装路径。通常完整安装 Playwright 官方依赖的机器不需要跳过 host precheck；本机私有共享库的设置见前述环境说明。

```bash
export PATH=/root/.local/share/xiaohe-toolchain/current/bin:$PATH
export PLAYWRIGHT_IMPORT=file:///root/.cache/babble-qa/node_modules/playwright/index.mjs
export AXE_IMPORT=file:///root/.cache/babble-qa/node_modules/@axe-core/playwright/dist/index.mjs
export LD_LIBRARY_PATH=/root/.cache/babble-qa/runtime/usr/lib/x86_64-linux-gnu
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
export QA_BASE_URL=http://127.0.0.1:4173/
for engine in chromium firefox webkit; do
  export BROWSER_ENGINE="$engine"
  export QA_OUTPUT_DIR="$PWD/test-results/completion/$engine"
  node scripts/browser-smoke.mjs
  node scripts/learning-path-smoke.mjs
  node scripts/custom-text-smoke.mjs
  node scripts/shape-teaching-smoke.mjs
done
```

本次未测真实 iOS Safari、Android 输入法、读屏软件或低端手机。自动化和 axe 通过不能证明学习者理解取根；应另按[15 分钟学习检查协议](learning-check-protocol.md)观察真人试用。此报告不将浏览器 smoke 时间当作启动性能或 INP。前轮外部 `/tmp` 性能原始记录已随环境清理丢失，本次不伪造复测结果；性能取舍及证据限制由本轮交付报告单独记录。
