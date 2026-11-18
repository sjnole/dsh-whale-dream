# 鲸梦 0.8.40 · DSH 新会话原版图标替换报告

## 用户要求
将截图红框里 DSH「新会话」页的鲸鱼 SVG 用于鲸梦启动首屏。图形结构（包括眼睛）不作任何修改，只有颜色随主题适配。保留现有标题动画及插件其他功能。

## 实施
- 图标来自 DSH 官方 `FISH_LOGO_PATH`（`FishLogo.tsx`），用于官方 `EmptyHero.tsx` 新会话页 HeroFish 的非悬停状态。
- 源码参考：https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/packages/client/ui-primitives/src/FishLogo.tsx
- 使用官方 SVG `viewBox=0 0 23.16 17.04`、单条原始 `path`、`fill=currentColor`。
- 不使用截图裁切成图片，不添加眼睛补丁、遮罩、背景、边框、圆形或红色标注框。
- 在 Host 启动脚本与客户端回退脚本中同步替换相同 SVG。
- 保留 0.8.39 的 5.55s 标题演出和「鲸梦 探索未至之境」文字。
- 此次不变更插件列表图标 `icon.svg`；用户只要求启动首屏。

## 测试
- Node 专项检查：17/17 通过。
- Chromium：8 套内置主题实际截图与图标 DOM 检查通过。
- Chromium：320px、560px、1920px 窗口下无标题溢出。
- Chromium：自然播放结束后启动遮罩自动移除；系统减少动态效果时能提前退出。
- Chromium：各主题下 SVG 与标题颜色相同，path 与随包附带的官方图标资源一致。
- 原包比较：旧版 75 个文件字节不变；修改仅限 CHANGELOG.md, README.md, lib/client.js, lib/startup/boot.js, package.json，新增 assets/hero-fish-startup.svg, docs/qa/smoke-0.8.40.mjs。
- 原有 Host、动态外观、信息栏、SJ 圆环代码保持不变；未运行全部原始源码测试套件。

## 验证边界
- 这是在已发布编译包 0.8.39 基础上的定向更新，不是用户 Windows DSH 上的实机操作。
- DSH 原生窗口控制及其他 38 种外观的整体回归未重新实测。
