# 两级学习界面验收

日期：2026-11-01。独立浏览器检查：`levels_qa`。

本轮要求是把 Babble 分成“小鹤双拼”和“小鹤音形”两级，首次默认双拼，并记住当前浏览器上次选择。双拼只学习声韵两码；音形继续提供已有四码、取形、部件拼字及用户字库功能。

验收结论：本次两级学习需求可以交付。最终生产构建通过三引擎共 42 组场景和 33 次 axe 检查，0 违规、0 未捕获控制台错误。

## 检查范围

检查程序：[learning-level-smoke.mjs](../scripts/learning-level-smoke.mjs)。Playwright 和 axe 使用已有外部工具，未加入产品依赖。

| 场景 | 验证内容 |
| --- | --- |
| 首次进入 | 空存储默认双拼；仅两个隐藏音码位，键盘只显示声韵。 |
| 输入及提示 | `某 → MZ` 两键完成，四层提示与键位展开均不泄露形码；按键不发网络请求。 |
| 双拼各入口 | 设置、数据说明、全部双拼课程、查字和文本练习符合当前级别。 |
| 读音覆盖 | `无 → wú → WU` 无需该字的四码记录即可练习。 |
| 零声母、多音字 | `安 → AN`；原文两处“行”分别选择 `xíng → XK`、`háng → HH`。 |
| 文本 | 粘贴及 UTF-8 TXT 均保留英文、数字、标点和换行；双拼不加载拼字数据内容。 |
| 界面记忆 | 切音形后刷新仍为音形，切双拼后刷新仍为双拼；无效值回退双拼。 |
| 进度隔离 | 真实练习产生 `某:MZGM:0123` 和 `某:MZ:01`；双拼练习与刷新不改写原音形掌握记录。 |
| 切级保留 | 两级分别保留本次页面的原文和练习位置；未勾选持久保存的用户库经往返切级仍可使用。 |
| 小屏 | 两级在 320px、375px 下均可切换，页面没有水平溢出。 |
| 存储拒绝 | 同时拒绝 localStorage、IndexedDB 后，仍可切级并完成两码、四码练习。 |

## 开发版结果

三个实际浏览器引擎各通过 14 组场景、11 个 axe 视图，共 42 组场景、33 次无障碍检查，均无违规及未捕获控制台错误。已人工查看桌面和 320px 截图。

| 浏览器 | 功能场景 | axe 视图 | 留存结果 |
| --- | ---: | ---: | --- |
| Chromium 156.0.8078.4 | 14/14 | 11/11，0 违规 | `/root/.cache/babble-learning-levels/qa-dev-r5/chromium/learning-level-smoke.json` |
| Firefox 157.0 | 14/14 | 11/11，0 违规 | `/root/.cache/babble-learning-levels/qa-dev-r6/firefox/learning-level-smoke.json` |
| WebKit 27.2 | 14/14 | 11/11，0 违规 | `/root/.cache/babble-learning-levels/qa-dev-r5/webkit/learning-level-smoke.json` |

检查过程中发现并修复了级别序号对比度不足、双拼查字按钮可访问名称与可见文本分词不一致。旧失败结果保留；最终结果使用修复后代码。Firefox 测试另补充了等待字典关闭和新练习目标提交到界面的条件。

Vite 开发服务的 `?url` 模块只导出静态资源 URL，检查程序将其与真正字库内容请求分开计数。

## 生产版验收

最终生产构建在 `http://127.0.0.1:4174/` 重新运行同一组三引擎检查，三者均一次通过完整 14 组场景和 11 个 axe 视图。服务返回的 JS/CSS 与本地构建逐字节相同；验收后仅更新文档和源码包。

| 浏览器 | 功能场景 | axe 视图 | 留存结果 |
| --- | ---: | ---: | --- |
| Chromium 156.0.8078.4 | 14/14 | 11/11，0 违规 | `/root/.cache/babble-learning-levels/qa-production/chromium/learning-level-smoke.json` |
| Firefox 157.0 | 14/14 | 11/11，0 违规 | `/root/.cache/babble-learning-levels/qa-production/firefox/learning-level-smoke.json` |
| WebKit 27.2 | 14/14 | 11/11，0 违规 | `/root/.cache/babble-learning-levels/qa-production/webkit/learning-level-smoke.json` |

验收资源：

- `assets/index-BMnNJ-1O.js`：2,107,088 字节，SHA-256 `0ab725a605230390d1769020589e19a311dd121a61ab5cdcae2ca3793e813882`。
- `assets/index-B0i6BQqp.css`：40,171 字节，SHA-256 `41a1c54a0c285e78e7c84f2d46d16aa3d2951373c0a2ca1ee5cea600368685d8`。

此结论限定于两级学习界面，不表示此前规划的汉字库扩充已经入库。

已有六类音形浏览器回归在最终构建之前的生产构建中通过全部三引擎，共 18 套有效结果、378 项场景、210 次无障碍扫描，0 违规。原脚本明确进入音形级别后运行；其后仅调整双拼查字的可访问名称和双拼空用户库分支，音形语义保持不变，最终构建再通过上表的 42 组定向检查。两次服务未就绪失败和一次文本准备就绪条件失败保留，接受结果的映射见 `/root/.cache/babble-learning-levels/regression-accepted.json`。主工程另完成 191 项单元测试与 lint，并逐项比较原有 8,978 个编码选项、8,302 个自由练习字、26 个键位和 15 门课程的语义内容，均保持一致。

实际引擎验证不等同真实 iOS Safari 或实体移动设备测试。字库、取形生成器及字体文件另做字节一致性核验，未在本次级别切分中增补编码。
