# 鲸梦 0.8.42｜启动性能与居中叠加专项验证

## 本轮修改基线

用户直接上传：`dsh-whale-dream-0.8.41(1).tgz`，已编译 TGZ（非原始完整仓库）。本次不重新构建 38 个外观或账户账本引擎，只调整启动 IIFE、Host 注入、插件资产导出及新动画资源。`lib/client.js` 仅替换该启动 IIFE 及包版本文字。

## 卡顿根因与处理

原 0.8.41：每帧 Canvas 先绘制预生成代码字符图层，然后使用官方帧图作 `destination-in` 遮罩，设备 DPR 最高 2；同时 DSH 启动加载 React 及插件，主线程竞争明显。启动脚本本身还内嵌约 165KB 原帧图 Base64，Host 对启动配置又注入一次 atlasDataUri。

0.8.42：离线使用同一份 137 帧 DSH PixelWhale alpha atlas 制作透明字符动画 WebP，编码 WebP 为 106 个有效帧（合并重复/静止帧），时间总长 5707ms，loop=1，192×108 像素原动作对应 768×432 输出。浏览器只加载一张本地 `.webp` 并原生播放，无逐帧 JavaScript、Canvas、字体测量和帧内合成；原 `FishLogo` SVG 结构未动。

- 独立启动 IIFE：从约 **250,920 bytes** 缩到约 **22,885 bytes**（按实际文件比较，约 91% 缩减）。
- Web/Desktop Host 启动数据：仅包含少量配色与插件资源 URL，不再重复传送 atlas Base64。
- 动画 asset：约 **1.3 MB**，由 DSH 插件资产路径按需异步加载，未嵌入启动 HTML。**这是资源移位，不是压缩包整体缩小。**

## 预览阶段测到的绘图差异（不等于 Windows DSH 性能）

对相同 1280×720、DPR1 Chromium 页面，读取页面启动后约 1.8 秒的帧/Canvas 调用计数：

| 计数 | 0.8.41 | 0.8.42 |
| --- | ---: | ---: |
| `requestAnimationFrame` 调用 | 109 | 0 |
| `CanvasRenderingContext2D.drawImage` | 86 | 0 |
| `CanvasRenderingContext2D.fillText` | 567 | 0 |

以上只说明**已移除 JS 绘图竞争**；不代表 DSH 整机冷启动时间或稳定 24fps 已经通过实机认证。测试中使用预览注入资源（不是 DSH 原生 Host 路由）；不把预览素材注入延迟作为冷启动速度数据。

## 视觉与交互回归

- Chromium 验证视口：320×640、560×800、1280×720、1920×1080。
- 四种尺寸均为 Logo＋标题组合横纵正中央；未检测到文案溢出。
- 1280×720：新鲸鱼后景宽约 922px，旧版约 819px（放大约 12.5%），依然位于 Logo/标题下层。1920×1080 新后景宽约 1382px。
- 八套内置主题在浏览器计算的文字颜色及图像 CSS 着色均符合明暗主题：深色用浅色，ivory、mist、rose 浅色用深色。
- `Esc` 立即退场、减少动态效果不播放鲸鱼、缺图时无阻塞退回纯品牌均通过 Chromium 专项检查。Host 关闭状态、启动脚本重复注入防护通过 Node 断言。
- 本轮 18 项 Node 专项测试已通过。

## 未验证及注意事项

1. **Windows DSH 真实冷启动帧率／掉帧、内存、GPU 与性能变化仍需实际安装复核。** 无法从独立 Chromium 预览推导出 Windows 完整 DSH 启动性能。
2. 插件资产服务 `plugins/dsh-whale-dream/assets/...webp` 路径依照 DSH 0.2.2-rc.3 的官方 `./assets/*` 导出契约编写；没有接入用户的 Windows 实机进行端到端资源加载测试。若素材请求失败，启动会自动回退纯品牌；应检查其 Network 404 和导出路径。
3. 未重新执行 38 种外观、SJ 推理圆环、账户信息栏的全套生产回归，尽管其运行文件未修改。
4. 动画视觉资产是从此前用户提供的 0.8.41 内嵌 DSH PixelWhale 资源制作的派生品；公开分发前须确认第三方 artwork 的再发布许可。
5. 原始数据 `whale-dream.json` 和 `~/.dsh/whale-dream-info/` 不在安装包中，热修复没有修改其迁移逻辑。

## 本地检查指令

```shell
node --check lib/index.js
node --check lib/client.js
node --check lib/startup/boot.js
node --check lib/startup/host.mjs
node --test docs/qa/smoke-0.8.42.mjs
```
