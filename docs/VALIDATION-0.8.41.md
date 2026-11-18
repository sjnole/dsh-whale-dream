# 鲸梦 0.8.41 · 启动画面复用 PixelWhale 验证说明

## 修改范围

输入：用户上传 `dsh-whale-dream-0.8.40(1).tgz`。

- 原启动脚本 `lib/startup/boot.js`：保留原 FishLogo 路径、逐字标题机制；新增 Canvas PixelWhale 动画并将品牌定位到上方；标题中恢复「×」。
- `lib/client.js`：启动回退脚本同步与 Host 完全相同的逻辑。
- `lib/startup/host.mjs`：在启动配置中嵌入已安装 DSH 官方 atlas 的 `data:image/webp;base64,...`，使 Desktop/Web 都无需再请求资产 URL。
- `lib/startup/atlas.mjs`：定位已安装的 DSH 官方 `breach-atlas.webp` 或 `breach-atlas-<sha12>.webp`。`DSH_WHALE_ATLAS` 可明确传入同一资源路径。
- `docs/qa/smoke-0.8.41.mjs`：专项测试；其他业务代码保持不变。

## 原版复用边界

- 原动画同样是 192×108 网格、12 列、137 帧、24 FPS、5700 ms。
- 原官方 `renderer.ts` 的 Canvas 逐帧绘制与 `code-fill.ts` 的遮罩方法已适配到启动 IIFE；未重绘、重新编码或更换原始帧图。启动默认选代码字符填充而非首次点击时的点阵模式，以贴合鲸梦字符矩阵视觉；缺少 Canvas 文本缓存时仍可回退点阵。
- 只有启动触发方式、布局（使标题与鲸鱼不重叠）和结束流程不同。
- 为避免擅自再分发来源视频的衍生资产，此插件 **不包含** 官方 atlas 二进制文件，运行时寻找本机原生 DSH 资源。确实找不到时保留 0.8.40 原始标题启动，不会阻断页面。
- 原会话点击鲸鱼属于 DSH 官方 `ui-brand-official`，此次没有改写或替换那部分代码。

## 静态验证

- Node `--check` 检查 Host/Client/Bootstrap 脚本语法。
- `node --test docs/qa/smoke-0.8.41.mjs` 验证源码身份、无二次修改 LOGO、首屏时序、动态样式、atlas 探测、Desktop/Web 启动配置与客户端回退同步。
- Chromium 使用**模拟 atlas 帧图**验证：深浅主题 Canvas 帧绘制、标题/Logo 同时呈现、动画后自动退出。这仅验证代码路径，不构成原始帧图视觉 1:1 验收。

## 待用户本机验收

1. DSH 真实安装目录是否可自动定位官方帧图。若无法定位，启动仅显示原 0.8.40 Logo+标题，可以把 `DSH_WHALE_ATLAS` 设置为 DSH 官方 `breach-atlas.webp` 的本机绝对路径后再启动。
2. Windows Desktop 的 `dsh-app://` 早期注入正常显示，没有二次加载闪屏。
3. 旧功能（38 种外观、SJ 圆环、信息栏）不回归故障。
4. 真实官方逐帧资源呈现与点击会话鲸鱼在动作和水花上是否一致（除布局和模式差异）。

未宣称本机实机验证已通过。
