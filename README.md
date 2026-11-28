# 鲸梦 · Whale Dream 1.5.0

鲸梦是面向 DSH 的整合插件，把星球社区、主题与动态外观、启动首屏、SJ 推理圆环、底部信息栏和实况窗放在同一个安装包里。社区用于交流与分享，主题用于个性化界面，实况窗用于查看多个会话的实时状态。

---

## 星球社区

在 DSH 侧栏进入「星球」即可使用；未登录时显示登录 / 注册页。

| 能力 | 说明 |
| --- | --- |
| 账号 | 邮箱注册 / 登录、邀请码、记住邮箱、密码显隐；登录与注册同页切换。 |
| 星域 | 鲸梦交流、插件、主题、桌面、开发、工具、资源、闲聊共 8 个板块。 |
| 内容 | 发帖（多图）、点赞、收藏、评论；时间倒序、滚动加载、弱网提示。 |
| 个人资料 | 昵称、头像、头像框；修改后同步到社区与侧栏「画框」。 |
| 身份衔接 | 启动时后台校验登录态；未登录或退出后立即回退 DSH 原生头像 / 昵称，星球加载或登录过程中不跳变。 |
| 管理 | 管理员可删除帖子与评论。 |

社区使用浅色界面与白底评论区，登录页嵌在会话视图内，不遮挡侧栏与其他工作区。

## 主题与外观

- 8 套默认配色 + 38 种动态外观，支持多色渐变、自定义完整方案、按间隔更换和点击互动。
- 自动性能保护：按实际绘制耗时动态降帧，不改写设置；支持减少动态效果与帧率上限。
- 启动首屏动画、SJ 推理圆环、底部信息栏与主界面联动。

详细说明见 [docs/THEMES.zh-CN.md](docs/THEMES.zh-CN.md)、[docs/APPEARANCES-0.8.0.zh-CN.md](docs/APPEARANCES-0.8.0.zh-CN.md)、[docs/INFO.zh-CN.md](docs/INFO.zh-CN.md)。

## 实况窗

顶部胶囊与展开面板显示多个会话的思考、待确认、新回复和空闲状态。1.5.0 起所有状态变化都会自动补发状态包，不需要再把鼠标移入窗口才刷新。

## 安装与升级

1. 下载 `dsh-whale-dream-1.5.0.tgz`，**不要解压**。
2. 打开 DSH → **插件 → 已安装 → 添加插件**，填写安装包的完整路径，点击 **安装**，再点击 **立即启用**。
3. 完成当前工作后完全退出 DSH：Windows 从托盘退出，Mac 使用 ⌘Q；重新打开后生效。
4. 如仍启用独立的 `dsh-dream-skin`、`dsh-ascii-whales`、`dsh-sj-reasoning-ring`、`dsh-bottom-info-bar`，请先停用，避免重复主题、圆环或信息入口。
5. 已有旧版鲸梦时，先卸载旧 `dsh-whale-dream`，保留 DSH 数据目录。

**官方 Web 版**：在运行 DSH Web 的机器上执行，然后重启 `dsh web` 进程并刷新页面：

```sh
dsh plugin --profile web add "/实际路径/dsh-whale-dream-1.5.0.tgz"
```

Web 与 Desktop 的插件启用状态分别管理；连接远端 Host 时，路径必须是 Host 机器上的实际路径。

## 1.5.0 更新

- 性能：客户端 bundle 压缩，`lib/client.js` 体积约减少 25%；星球 logo 改为独立 WebP 资源；实况窗补发直接复用上一包状态，不再重复计算。
- 修复：实况窗在收起 / 展开下都能刷新思考、待确认、新回复和空闲状态。
- 品牌：插件列表图标、星球品牌和品牌素材换用新 logo；启动首屏保持原鲸鱼 SVG。

完整版本历史见 [CHANGELOG.md](CHANGELOG.md)。

## 兼容与构建

- 适配基线：DSH `0.2.2-rc.3`；宿主 Node.js ≥ `22.13.0`。
- 实况窗在 Windows x64 可用；macOS 需 arm64 原生组件。
- 这是独立整合版，不是 DSH 或上游插件的官方版本。

```sh
npm ci
# 可选：复现原生 Canvas 图形检查
npm install --no-save --package-lock=false @napi-rs/canvas@0.1.100
npm run check
npm run preview   # http://127.0.0.1:4317/
npm pack
```

安装包已包含客户端代码与字体，最终用户无需构建。更多安装、升级与恢复步骤见 [docs/INSTALL.zh-CN.md](docs/INSTALL.zh-CN.md)。

## 来源与许可

- [ASCII Whales](https://github.com/Chael-Chael/dsh-ascii-whales)：0.1.6，固定提交 `fdcc976f7d66245b7e0c3d5f81018c5a109d56a6`。
- [Dream Skin](https://gitcode.com/LLLAAAAA/dsh-dream-skin)：11.7.0，固定提交 `50fbbcb9b73712e76adf7601c68cae4484390ab1`。
- SJ 推理圆环 0.1.4：完整来源与逐文件哈希见 `vendor/sj-reasoning-ring/SOURCE.json`。
- [dsh-bottom-info-bar](https://github.com/songoao25/dsh-bottom-info-bar)：1.26.0，提交 `684beceac85120824d82c713b83e0e3e77a0eb3f`；信息栏前端由鲸梦重构，账户与账本核心按 MIT 适配。
- [官方 DSH 适配基线](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.3)：提交 `38a6a5c965aa99ab525161efb7cc5cf1fe62fced`。

启动动画素材派生自 DSH PixelWhale 帧图，仅用于本地个人安装；公开再分发前需核实素材许可。

所有原始署名、许可证和字体许可均保留。合并包不能笼统标注为 MIT，具体归属见 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

---

一个插件即可完成星球交流、主题搭配和多会话状态查看；详细文档在 [`docs/`](docs/)，版本历史在 [`CHANGELOG.md`](CHANGELOG.md)。
