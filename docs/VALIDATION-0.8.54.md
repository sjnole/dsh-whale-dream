# 鲸梦 0.8.54 · SVG/Win32 原生三态重构与验收

**交付等级：Windows x64 实测候选版（不是实机已验收稳定版）。**

## 本轮问题复盘

Windows 实机 0.8.53 截图显示：最小圆形入口正常，但展开后仍在原小尺寸内绘制、内容被缩成细长条或只显示顶部文字。实现代码有两个直接可确认的缺陷：

- `nativeApplyRect` 在 `SetWindowPos` 的第二个参数（`hWndInsertAfter`）错误地传入 `SWP_NOZORDER`；标志应组合在**第七个参数**。这可能导致 Windows 不应用预期的窗口尺寸。本版更正并检查 Win32 调用结果和实际尺寸；若失败会回滚到上一形态，不绘制被压缩的展开面板。
- 0.8.53 的 UI 使用 `wd-*.png` 预渲染面板/鲸鱼等视觉素材，并在过渡帧做整图缩放，与不同 DIP/DPI、动态文字和会话数不兼容。0.8.54 完全删除伴随运行时对该素材的加载。

## 本版直接修改的文件

- `docs/companion-native-src/main.go`：真实 56×56 首帧、DPI 改变时清理缓冲并重算位置。
- `docs/companion-native-src/fallback.go`：三态尺寸 56×56 / 360×60 / 440×442 DIP；修正 SetWindowPos 参数；新的会话行、滚轮、底部输入命中区；真实运行会话数的环形动画按需运行；会话按状态排序。
- `docs/companion-native-src/draw.go`：**所有背景、边框、图标、胶囊均由原生矢量代码绘制**。没有截图底图，也没有文字和金额切图。
- `docs/companion-native-src/vector_win.go`：Win32 GDI+ 原生抗锯齿路径渲染，支持原 SVG path 的曲线，实心/细边圆角、圆环、加号、箭头。
- `docs/companion-native-src/svgpath.go`、`whale-mark.svg`：从已有鲸梦插件 `assets/whale-brand-icon.svg` 按字节复制原版路径；SVG 原路径解析而非照片追踪。
- `docs/companion-native-src/canvas.go`：仅为双缓冲保留私有 GDI 画布，缓存字体；**没有任何 PNG/WebP 截图或素材位图**。
- `bin/whale-companion-win-x64.exe`：重新交叉编译 Windows x64。
- `package.json`、`lib/client.js`：版本一致更新至 0.8.54；旧 DSH 客户端主体内容除版本字符串外保持不变。
- 删除伴随运行时 `docs/companion-native-src/wd-*.png` 视觉资源及其依赖。

## 产品与交互规则

- 小图标：**56×56 DIP**，原鲸鱼 SVG，右上动态环只计数 `running`/`thinking`/`generating`；数字固定，不旋转；0 隐藏。
- 悬停胶囊：**360×60 DIP**，显示当前会话标题与本会话费用；不重复展示全局余额。
- 队列：**440×442 DIP**，标题左/余额右，4 行 64px 高可滚动会话胶囊；已完成/运行/待输入由鲸鱼和 1px 状态边框表示，不另设状态文字角标；底部统一的「＋｜输入｜↑」单层背景。
- 颜色：低饱和薄荷绿/柔蓝/琥珀，不使用整条强发光图片。
- 动画：以 220ms bounded Win32 尺寸过渡；中间帧只渲染当前矢量外壳，不在小尺寸内压缩完整面板；动效结束停止窗口计时器。仅当运行中的会话数量大于 0 且处于最小态时启用数字环低频重绘。
- 数据：沿用 DSH Host+Client 会话状态与现有鲸梦信息栏的额度、费用快照。未知成本保持 `—`。目前输入栏采用原生键盘文本路径，点击创建的仍是 **DSH 草稿会话**，不会暗中向模型发送付费请求。

## 经过实际执行的验证

1. `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 GO111MODULE=off go build` → **通过**。
2. `GO111MODULE=off go test svgpath.go svgpath_test.go` → **通过**，包含原鲸鱼 SVG 及曲线/椭圆弧解析。
3. `npm test` → **18/18 通过**。包括真实 Host 名单、隐私、多会话、客户端状态变化、空数据、图标非图片、窗口大小/Win32 参数检查。
4. `npm run prepack` → **通过**（Node 语法检查）。
5. `npm pack --offline` → **通过**。包内含 Windows x64 PE、原始 SVG、矢量 Go 源码；伴随模块不再包含 `wd-*.png`。
6. 原有主题启动屏、信息栏及原品牌 SVG 的 SHA-256 与基线一致，未重写 DSH 主页面。

## 尚未验证 / 不得虚报

- 本环境没有 Windows 图形桌面，**未执行 Windows GUI 启动、真实 Hover→Queue 开合 FPS、系统任务栏/置顶/多屏验证**。
- DPI 100%/125%/150%/200% 的物理像素适配以代码逻辑验证，**未实机覆盖**。
- GDI+ 透明玻璃与背景模糊效果与用户提供的渲染概念板不完全相同；本版优先消除图片拉伸锯齿与尺寸裁切。
- **复杂中文输入法组合、Shift+Enter 多行与队列外点击自动收起**暂未取得 Windows 实机级验收证据；不标记通过。
- 已知部分 DSH 会话费用不是官方独立会话接口稳定可提供的数值：显示 `—`，不填演示金额。

## 实机验收优先级

安装前保留 0.8.53 备份，完整退出 DSH 后安装 0.8.54 并启动。优先检查：① 56 DIP 小鲸鱼是否清晰 ② 悬停能否展开为 360×60 横向胶囊 ③ 点击后能否变为 440×442 会话队列而不裁切 ④ 反复开合 30 次是否还出现缩成顶部文字、闪烁 ⑤ 在不同缩放下图标边缘是否平滑 ⑥ DSH 最小化/托盘后会话状态仍更新。
