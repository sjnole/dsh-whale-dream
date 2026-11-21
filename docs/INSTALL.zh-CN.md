# 鲸梦 1.0.0 安装、升级与恢复

本文适用于以官方 DSH **0.2.2-rc.3** 为接口基线的 `dsh-whale-dream-1.0.0.tgz`。在 DSH 插件管理器中选择 `.tgz` 安装。

## Windows Desktop：从客户端安装

1. 下载 `.tgz`，保存在稳定的本地目录。若拿到的是完整 ZIP，先解压 ZIP，保留里面的 `.tgz` 原样。
2. 打开 DSH 左侧 **插件**，进入 **已安装**。先关闭旧 `dsh-dream-skin`、`dsh-ascii-whales`、`dsh-sj-reasoning-ring`、`dsh-codex-effort-slider` 以及独立 `dsh-bottom-info-bar` 的组合包开关，保留其配置和账本。
3. 选择 **添加插件**。下拉菜单中的 **安装第三方插件** 也会打开同一安装对话框。
4. 输入 `.tgz` 的实际绝对路径。例如：

   ```text
   C:\Users\你的用户名\Downloads\dsh-whale-dream-1.0.0.tgz
   ```

   只输入路径，不输入 `dsh plugin add` 命令。Windows 复制地址产生的外围双引号应去掉。
5. 点击 **安装**。完成后核对包名 `dsh-whale-dream` 与版本 `1.0.0`，点击 **立即启用**。
6. 从独立插件切换或升级后，完成当前工作，再从 Windows 托盘右键 **退出 DeepSeek Harness**，重开客户端。
7. 打开 **设置 → 鲸梦主题**。首页有「主题配色 / 外观与动态 / 信息栏」三个同级页，分别选择主题、外观和信息栏常显内容。创建主题从「主题配色 → 我的方案 → 创建新主题」进入，在配色、背景和圆环中调整，再用页底「保存当前搭配」中的「保存方案」完成；保存后回到我的方案。

本版宿主 Node.js 最低要求为 **22.13.0**。官方桌面应用使用自带的运行时；以上客户端内安装流程无需另装 Node.js，也不要求另外在 PATH 配置 pnpm。若旧运行时提示版本不满足，请更新官方 DSH 后再安装。普通窗口 ×/Alt+F4 会隐藏桌面窗口，Host 继续运行；使用托盘退出才能完整重开。

来源：[官方插件管理界面](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/packages/client/ui-plugin-manager/README.zh.md)、[Desktop 运行时与退出行为](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/apps/desktop/README.zh.md)。

## Mac 桌面版

Apple 芯片 Mac 使用官方 DSH 桌面版的「添加插件」，选择同名 `.tgz` 并启用，再按 ⌘Q 退出并重开。安装包包含 macOS arm64 原生组件时，可从 **设置 → 鲸梦主题 → 实况窗** 启用。见[Mac 构建与验收](MACOS-BUILD.zh-CN.md)。

## 从旧鲸梦升级

官方插件页会拒绝重复添加已安装的同名包。从本地路径/压缩包安装的包，也不会显示注册表版本更新区块。因此从旧鲸梦版本（包括 0.8.6）升级时：

1. 保留 `whale-dream.json` 和 DSH 数据目录；已有壁纸文件也保留。
2. 在插件管理中卸载旧 `dsh-whale-dream`。
3. 按上面的步骤安装 `dsh-whale-dream-1.0.0.tgz` 并立即启用。
4. 完整退出并重开，检查设置页和插件管理页的版本。

升级后仍沿用以下旧配置兼容规则。

- 当前外观或已存方案中的飞燕、蝴蝶、小猫、赤狐、林鹿回退为座头鲸，保留名称、主题配色、背景与其他偏好；当前共有 7 类 38 种，新增的四类各 5 种可以在「外观与动态」直接选择。
- 原来已开启每日随机、且没有分钟间隔字段的配置迁移为每 1440 分钟更换，首次载入时开始计时。新配置的默认间隔是 60 分钟，仍默认固定使用；在「外观与动态」选择「按间隔更换」后可改为 1–10080 整数分钟。点击外观卡片会固定使用该外观。

不要同时启用旧独立主题、海洋、SJ 或 Bottom Info Bar 插件。鲸梦不会自动删除其配置，也不会代替用户停用其他插件。若出现重复 SJ 提示，停用旧插件后再重开。

如果安装对话框报错，先查看 **查看安装详情** 中的实际错误。路径必须存在于运行 Host 的机器，不能仍是文档中的占位路径。成功安装与成功启用是不同步骤；完成后直接关闭弹窗会保持未启用。

### 旧信息栏的账本如何保留

鲸梦使用自己的 `$DSH_HOME/whale-dream-info/` 账本目录；没有设置 `DSH_HOME` 时为 `~/.dsh/whale-dream-info/`。**不会自动迁移或合并独立 `dsh-bottom-info-bar` 的记录。** 如果需要保存原统计，先在原插件导出留档，再停用它。原目录仍保留，鲸梦只从启用后观察到的模型调用开始累计。

升级鲸梦时请同时保留 `whale-dream.json` 和 `whale-dream-info` 目录。主题创建流程继续沿用 0.8.4：「我的方案 → 创建新主题」，在创建页底部使用「保存当前搭配」。信息栏的勾选和排序独立保存，不跟随主题方案切换。

安装后，新会话标题应为 **鲸梦×探索未至之境**，原图标和「预览版」标识保留；新旧会话的输入框内，SJ 圆环左侧都使用同一信息栏入口。信息栏默认自动适配真实账户与模型数据；可在信息栏页切到「自选常显」后勾选、排序。DS 项仅在适用模型下显示当前时段和距相反时段的倒计时，点击向上展开详情。具体操作见 [信息栏使用说明](INFO.zh-CN.md)。

## 官方 Web profile

在运行 Web Host 的机器上执行：

```sh
dsh plugin --profile web add "/实际路径/dsh-whale-dream-0.8.8.tgz"
```

Windows PowerShell 示例：

```powershell
dsh plugin --profile web add "C:\实际下载目录\dsh-whale-dream-0.8.8.tgz"
```

然后重新启动对应 `dsh web` 进程，刷新浏览器。通过插件管理 UI 安装时，也应输入 Host 上的绝对路径；浏览器所在机器与远端 Host 不是同一台时，浏览器本机下载路径不能直接作为远端路径使用。

官方 `dsh plugin` 转交包管理器执行本地 tarball 安装。Web profile 与 Desktop profile 独立，给 Web 安装不会自动给 Desktop 安装。依据：[CLI profile 管理](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/apps/cli/README.zh.md)、[插件打包与 tarball 交付](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/docs/user/develop/basic/publish.zh.md)。

<a id="desktop-cli"></a>

## Desktop 命令与普通 npm CLI 的区别

官方 0.2.2-rc.3 的规则是：

| 命令来源 | 能否管理 Desktop 插件 |
| --- | --- |
| 通过 npm 安装的普通 `dsh` | 不能；`desktop` 是 Electron 保留的 profile。 |
| 当前 Desktop 安装自带的 `dsh`/`dsh.cmd` | 可以；先启动 Desktop 初始化一次，再完全退出。 |
| 客户端 **插件 → 添加插件** | 可以；本文推荐的桌面安装入口。 |

因此，不应对 PATH 中来源未知的 `dsh` 直接执行 `--profile desktop`。需要使用命令行时，先在应用菜单打开 **管理 dsh 命令…**，查看并安装/修复当前 Desktop 命令。该窗口会指出命令位置和其他 PATH 项的优先级；安装后打开新终端。

只有确认使用 Desktop 自带入口后，才可在完全退出 Desktop 时执行：

```powershell
& "管理窗口显示的 Desktop dsh.cmd 完整路径" plugin --profile desktop add "C:\实际下载目录\dsh-whale-dream-0.8.8.tgz"
```

将两处示例路径换成真实路径。安装后重新打开 Desktop。无需猜测 `node.exe` 或 `app.asar` 的入口，也不要用普通 npm CLI 初始化一个名为 desktop 的 profile。

明确依据：

- [Desktop 内置命令运行时](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/apps/desktop/README.zh.md#bundled-command-runtime)说明自带命令及初始化/完全退出要求。
- [CLI 文档](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/apps/cli/README.zh.md)说明 npm CLI 拒绝 Desktop 插件管理。
- [CLI 参数解析](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/apps/cli/src/args.ts)用 `manageDesktopProfile` 决定是否允许该操作。
- [插件命令实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/apps/cli/src/plugin.ts)检查 Desktop profile 已初始化。

## 恢复独立插件

在插件页停用 `dsh-whale-dream`，重新启用需要的原 Dream Skin、ASCII Whales、SJ 和/或 Bottom Info Bar 插件，再完整退出并重开。无需删除原设置。鲸梦的新外观偏好存储在自己的 `whale-dream.json` 中；旧文件、旧 localStorage 键没有被合并版写回或删除。

## HTML 预览

`whale-dream-preview-0.8.8-r1.html` 可单独打开查看，不能作为安装包交给 DSH。它运行实际客户端插件代码，但会话、模型、团队与保存服务由明确的测试宿主模拟；不会调用真实模型或读取 DSH 数据。账户、额度和费用示例是演示数据，不能代替真实登录账户的验证。预览的凭据输入禁用，CSV/JSON 仅导出演示记录。本机预览的设置隔离在预览自己的版本命名空间中。

查看点击效果时，在首页 **外观与动态** 确认「显示动态外观」和「点击互动」已开启，再关闭设置、点击会话空白处或可编辑的聊天输入框。输入框反馈在卡片内部显示，保留原焦点、选区与草稿；输入暂停不会阻止这次主动点击的局部反馈。消息正文、按钮、SJ 圆环和只读输入区不触发。若系统启用减少动态效果，或显示范围设为仅新会话，界面会给出相应提示。点设置卡片是选择外观，背景点击动画在会话中查看。

安装兼容性基线见 [VERSION.md](VERSION.md)，实际已做的检查和未覆盖的条件见 [VALIDATION.md](VALIDATION.md)。


## 首屏动画开关

在「外观与动态」顶部即可看到「启动首屏动画」，不需要额外进入启动动画菜单。关闭后该窗口内的动画会退出，下一次启动会直接进入首页。为了避免冲突，请停用独立 `dsh-startup-screen`。
