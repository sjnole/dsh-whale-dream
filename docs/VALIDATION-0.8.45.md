# 鲸梦 0.8.45：启动卡顿全项优化与验证

## 目标与实现

| 类别 | 实际变更 | 影响/边界 |
| --- | --- | --- |
| P0 启动与渲染争抢 | 在 splash 活跃时不初始化主页面的 Canvas 动态外观引擎，不注册原本的全页面背景监听；启动关闭后在空闲任务中恢复，最长等待约 420ms | 减少首屏期间的并发 CPU/GPU 工作；无法阻止其他插件或 DSH 核心占用主线程 |
| P0 同步阻塞 | 移除启动时两个 `getBoundingClientRect()` 布局读取，Logo 初始居中偏移由 CSS `calc` 完成；主题 CSS 一次更新 | 减少强制重排；不改 Logo→品牌→文案时序 |
| P0 媒体首帧与解码 | 深色 H.264 370,234 B、浅色 H.264 216,797 B，均为 moov-before-mdat faststart；主题选正确素材，无常驻反色滤镜；单次 `requestVideoFrameCallback` 记录首帧 | 能否硬件解码依赖 Chromium/Electron、系统驱动与 GPU 设置，不能强制保证 |
| P1 非必要初始化 | 启动设置页开关改为界面出现时才读取 Host；观察器检查关联外观 DOM 才执行更新；主界面鲸鱼 Canvas 与圆环观察器延后，Hero 标题 DOM 延迟挂载 | 设置开关与主题功能保留 |
| P1 DOM/CSS | CSS 合成层 opacity/transform、无启动期 Canvas、无帧级 JS 回调或计时器阶段性文字推进；深浅预编码避免正常路径 CSS 反色 | 保留原版动画帧与品牌外观，整屏渐变仍由浏览器负责静态光栅化 |
| P1 资源缓存 | Host 新增严格白名单的 `/whale-dream/api/startup/<hash>` 路由：HTTP 200/206/304/416、Range、ETag、Cache-Control immutable、MIME；Desktop `dsh-app://` 继续优先使用现有插件资源路由 | 相同 origin 的访问可命中浏览器缓存。DSH 使用动态端口时，跨次冷启动 origin 会变化，无法保证复用浏览器缓存 |
| P1 兼容降级 | 备用 WebP 从 1,290,814 B 减到 374,512 B（低帧率 640×360），Host 媒体路由失败重试原 plugin asset 路由；完全失败则显示品牌 | 无 H.264 时保留鲸鱼动画但帧率降低；不影响用户使用 DSH |
| P2 性能诊断 | `window.__WHALE_DREAM_STARTUP__.getMetrics()` 可查看首帧耗时、videoFrames、droppedVideoFrames、effectiveFps、长任务数和持续时间等；完成时触发本地 `whale-dream:startup-metrics` 事件 | 不调用每帧 `requestAnimationFrame` 取样；不上传、不持久存储；浏览器 API 无法读取 Windows 整个进程 CPU 峰值 |
| Host 配置读取 | 只解析一次可能很大的 JSON 启动状态，Host 主题桥与 splash 复用缓存；`boot.js` 启动脚本只读一次 | 读取路径以 mtime/size/ctime 判断文件变更，保存用户自定义配置行为不变 |

## 代码与 HTTP 验证

执行 `npm run prepack && npm test`：**22/22 通过**（基础结构、保留的品牌 SVG/标题/时序、双 H.264、WebP 降级、Canvas/DOM/圆环观察器延后、脚本一致性、八主题、Host 实际 HTTP GET/Range/If-None-Match/跨站拒绝）。未对所有历史主题/插件功能进行 DSH 实机点击回归。

## Chromium 独立预览样本（本环境）

- 1280×720 深色、浅色、1920×1080 深色、375×667 移动窗口：鲸鱼主媒体均为 `native-video`、异常数 0；浅色不再采用 runtime `invert()`；标题与 Logo 均居中。
- Logo 初始阶段约 720ms：SVG 中心 `639.99px`（1280px 画面中心 `640px`）；名称 opacity 0，符合先 Logo 后名称。
- 完整独立浏览器播放样本：视频 `137` 帧、报告 `0` 丢帧、24 FPS；首帧约 `102ms`，实际样本依赖当前容器条件，不能外推到用户机器。
- 模拟约 2.2 秒同步 JS 堵塞：`PerformanceObserver` 记录到 1 个长任务，原生视频随媒体时间继续推进；无法从浏览器断言 DSH CPU/GPU 竞争完全消失。
- 断开主视频资源：自动显示低帧率 WebP；Esc、减少动态效果均按预期退出。

## Windows DSH 冷启动待实机验证

1. **插件升级后彻底退出 DSH（托盘退出），重新冷启动。** 切换浅色和深色主题各一次，检查鲸鱼无停顿、Logo 先出现、后续标题清晰、启动屏正常退出。
2. F12 → Console 执行 `window.__WHALE_DREAM_STARTUP__?.getMetrics()`，复制 `firstFrameMs`、`longTasks`、`blockedMs`、`videoFrames`、`droppedVideoFrames`、`cacheHint`。如果 DSH 没有 F12 入口，可通过其内置开发者工具入口查看。
3. Windows 任务管理器/性能页查看 DSH CPU/GPU 峰值。浏览器诊断仅覆盖当前页面和原生视频，不提供整机或全进程 CPU 峰值。
4. 启动结束后切换至 38 种外观、SJ 圆环、账户信息、主题设置与素材切换，确认被延后初始化的功能已恢复。
5. 一些 DSH 版本在插件加载前会出现原生“Loading plugins”壳屏，插件无法在自身载入前控制它。全进程同步工作（其他插件和宿主启动逻辑）也无法仅在本插件内全部消除。

## 完整性边界

本构建以用户已提供的编译发行包为基线进行定向补丁，未持有上游完整 TS 构建项目；不会声称 DSH 宿主或未连接的其他插件已优化。未执行用户 Windows 真实冷启动追踪，因此不宣称“卡顿 100% 消除”。
