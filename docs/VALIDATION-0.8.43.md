# 鲸梦 0.8.43 启动屏专项复核

- 基于 0.8.42 安装包，聚焦品牌居中 / 叠加 / 可见度，未触动其他 UI 组件和状态存储。
- 原版 HeroFish SVG 路径与品牌时间线保持不变；首次 350ms 显示 Logo，1090ms 显示「鲸梦」与分隔符，1750ms/2470ms/3300ms 显示标题片段。
- 品牌整体最终水平与垂直居中；官方 5.707 秒跃鲸动画位于下层，CSS 宽度 `min(90vw,144vh,1600px)`；浅深主题适配。
- 对预渲染动画每帧 Alpha 做非线性轻微提升，原动画坐标 / 帧数 / 时长均未变。Windows 实机 GPU 性能、资源加载与冷启动帧率尚未验收。
- 本地 Node/Chromium 专项检查：`node --check lib/index.js`, `node --check lib/client.js`, `node --check lib/startup/boot.js`, `node --check lib/startup/host.mjs`, `node --test docs/qa/smoke-0.8.43.mjs`。

## 本轮已执行检查

- Node.js 22 `node --check`：Client、Host、Index、Boot 文件语法检查通过。
- Node.js `node --test docs/qa/smoke-0.8.43.mjs`：18/18 专项测试通过。
- 独立 Chromium （无 DSH 宿主，直接注入 Base64 预览资源）：320×640 / 1280×720 / 1920×1080 实测品牌组合几何中心落在视口中心；0.75s 只有 Logo、1.44s 品牌名已入场、2.7s 标题分段出现、3.68s 完整品牌显示。
- 浏览器 `img.naturalWidth=768` 且 `complete=true`，资源加载成功、动画可见；深色和浅色主题截图符合对比度预期，无页脚异常和资源请求失败。
- 交互：Esc 跳过后 Overlay 已移除；减少动态效果时无鲸鱼图片并自动退出。
- 使用 `npm pack --ignore-scripts` 输出 `.tgz`，确认包含 Startup Boot、资源 WebP、Host 与校验文档。

### 验收边界

不把 Chromium 独立预览等同于用户本机 DSH 的冷启动、插件资源路由服务、Electron 资源解码性能；以上仍需要在真实 Windows 安装包中复测。
