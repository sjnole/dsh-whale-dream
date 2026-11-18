# SJ 推理圆环

**dsh-sj-reasoning-ring · 0.1.4 · SJ**

面向 DeepSeek Harness（DSH）的独立插件包，将模型选择、推理等级与团队协作集中到一个环形控件。它从 dsh-codex-effort-slider 1.1.5 派生，采用独立包名、注册标识和样式。

## 0.1.4 修复透明底板和菜单重叠

本版针对 0.1.3 在透明主题中的安装截图，修复内盘透出输入框文字／麦克风、模型菜单覆盖圆环内容的问题：

- 小圆环默认 **34px**，默认描边 **3.6px**；能够明确识别同一输入框的主按钮时，继续跟随其实测尺寸。
- 展开圆环保持 **160px**，可见环线保持 **15px**；内盘边缘紧贴外环内沿，当前等级（如 Max）保留在内圈。
- 内盘与模型菜单使用插件自己的不透明底色，不再直接使用可能透明的宿主背景变量。颜色跟随宿主的浅色／暗色模式；不支持 light-dark 的旧内核使用不透明暗色回退。
- 模型菜单以整个圆环及可见状态条为避让范围，下方充足时向下打开，截图中的靠底部场景向上打开；上下不足时尝试两侧或滚动列表。空间极小时给出提示，不把菜单强行叠在圆环上。
- 限定环内文字的行高、最大高度和溢出范围，统一按钮的基础文字样式，减少宿主主题造成的字体挤压。
- 点击小圆环后，以其中心原位放大；仅在接近视口边缘时做必要的位置调整。展开与收起均有缩放过渡，减少动态效果模式下立即完成。
- 点击中心模型区域打开独立下拉菜单，菜单与圆环之间保留间距，圆环内的等级和团队控件仍然保留，菜单不含搜索框。选择模型后立即关闭菜单，圆环保留，并在宿主读回后更新显示。
- 菜单打开时，点击圆环内的其他区域只关闭菜单，不顺带修改等级或团队状态；点击圆环与菜单之外的空白处关闭全部。Esc 先关闭菜单，再关闭圆环。
- 保留单色辉光、仅团队开启时使用的多彩与运动光点、弧端圆帽命中，以及真实宿主状态读写。

本版采用原位展开的定位方式；展开后可覆盖原输入区附近，位置受视口边界约束。包名、注册标识和设置存储键保持不变，0.1.0／0.1.1／0.1.2／0.1.3 的圆环偏好可以继续使用。详细变更见 [CHANGELOG.md](CHANGELOG.md)。

## 交互

- 收起时显示与发送按钮同档尺寸的小圆环，默认 34px；点击圆环本身展开，没有“点击展开”文案。未能唯一确认主按钮时使用默认尺寸。
- 展开圆环为 160px，以小圆环原位置为中心放大；外环调整推理等级，当前等级、模型名称和团队协作开关位于内圈。
- 模型按钮打开独立下拉列表，不替换圆环内容，也不显示搜索框。选中模型后菜单立即关闭；显示值继续以宿主读回为准。
- 菜单打开时，点击圆环内的其他控件或空白处只关闭菜单，本次点击不提交等级或团队变更；下一次操作再执行对应动作。
- 圆环内没有收起按钮，展开和退出过渡时原位置的小圆环隐藏。点击圆环与菜单之外的空白处可关闭全部；Esc 先关闭下拉菜单，再关闭圆环。
- 团队协作关闭时，当前等级使用单色及柔和辉光；团队协作开启时才使用多彩、星点与运动光点。Max 本身不会开启彩色。
- 弧长、手柄与等级文字共同表示推理等级。大小圆环使用同一份宿主状态。
- 模型和等级来自 DSH 的真实目录，不在生产代码里固定四档或预设模型清单。

右击小圆环，或聚焦后按菜单键／Shift+F10，可打开圆环设置：调节跟随方式、已达到刻度的显示、团队星点，以及恢复当前模型提供的默认等级。外环支持方向键、Home／End；Esc 依次退出当前操作或面板。动效遵循系统的减少动态效果偏好。

## 安装

完整步骤见 [INSTALL.zh-CN.md](INSTALL.zh-CN.md)。

### 已安装 0.1.0／0.1.1／0.1.2／0.1.3

请下载新的 dsh-sj-reasoning-ring-0.1.4.tgz，升级同一个 dsh-sj-reasoning-ring 包。

优先沿用当前 DSH 已支持的覆盖／替换流程，将新 TGZ 交给安装操作更新现有包；此前已经能够原地更新的环境可继续使用同一方式。只有管理器明确拒绝同名包时，才停用并卸载旧包条目，再安装新 TGZ。安装后确认版本为 0.1.4，并按宿主结果完成重载或重启。保留插件偏好、浏览器站点数据和 localStorage；新版本沿用原设置键。详见安装说明中的升级步骤。

### 首次安装

DSH Desktop 用户在应用的**插件管理页 → 添加插件**中输入以下任意一种实际绝对路径：

1. 解压 ZIP 后，直接包含 package.json 的目录。
2. 生成的 dsh-sj-reasoning-ring-0.1.4.tgz 文件。

ZIP 需要先解压，不能直接把 ZIP 路径当作 tarball 安装。安装并启用新包后，请关闭原 dsh-codex-effort-slider，减少重复控件或交互干扰；新包不会自动删除原包。是否重启以 DSH 的提示为准。

停用或卸载 SJ 推理圆环，并完成宿主要求的重载后，DSH 原生模型选择入口恢复显示。只有需要原横向滑条时，才重新启用 dsh-codex-effort-slider。

普通 CLI 不管理 Desktop 的保留 profile。非 Desktop profile 可使用：

~~~text
dsh plugin --profile web add "<包目录或 tgz 的绝对路径>"
~~~

本包没有发布到公共 npm 注册表的声明。交付文件使用本地目录或 TGZ 安装，不应仅输入包名并假定注册表已有该版本。

## 数据与状态

生产界面使用宿主的每会话模型目录和真实团队投影：

| 内容 | 宿主来源 |
| --- | --- |
| 当前模型与可用目录 | modelDirectories.directoryFor(sessionId).store |
| 当前模型的推理等级 | groups 中该模型的 reasoning.efforts |
| 模型、等级写入 | 同一 ModelDirectory.select 入口 |
| 团队状态 | 当前会话的 agentTeam 投影 |
| 团队写入 | remote.agentTeams.setEnabled |

模型与推理共享模型目录，团队使用同会话的独立投影。运行版本必须实际提供对应服务和插槽；公开源码中的接口不等于每个已安装版本都可直接使用。

模型与推理写入按会话协调，避免待发的旧等级覆盖新模型。请求超时不代表服务端已经取消。团队颜色以真实投影为准：如果保存请求报告错误但宿主投影已经改变，应保留真实状态并显示错误，不能仅凭本地按钮 class 判定开关结果。

团队仅向具有相应能力的根会话开放；保留宿主语义中的锁定、加载、保存失败和已有请求历史下的关闭确认。模型与推理选择作用于后续请求，不改变已经开始的模型步骤。

## 构建

构建要求 Node.js 22 或更高版本。生产代码没有额外 npm 运行时依赖，React 与 ReactDOM 由 DSH 提供。

确认弹窗优先使用宿主的 Modal／Button；宿主没有提供该 UI 模块时使用包内兼容弹窗。团队服务本身缺失时不开启本地模拟开关。

~~~text
npm run build
npm test
~~~

构建脚本将 src/core.cjs、src/placement.cjs、src/styles.css、src/icons.json 和 src/client.js 合成为 lib/client.js。输出使用 DSH 的 ModuleLoader factory 格式，不会执行浏览器代码或下载 React。

修改 src 后需要重新构建；安装包加载的是 lib/client.js。

## 离线预览

完整 ZIP 内置 preview 目录和独立的离线预览运行时。完整解压后，直接双击 preview/index.html 即可打开离线预览，不需要安装 Node.js 或下载框架。请保留解压后的目录结构；页面通过相对路径加载内置 React、模拟宿主和同一份 lib/client.js。

也可以使用 Node.js 22+ 的本机服务，在解压后的插件目录运行：

~~~text
npm run dev -- --host 127.0.0.1 --port 4173
~~~

需要固定端口时追加 --strictPort；不追加时，端口被占用会尝试后续端口，并在终端打印实际地址。

预览使用**模拟宿主数据**运行同一生产组件，可切换暗色、透明玻璃、浅色三种主题，并带有模拟麦克风按钮以观察内盘遮挡。它不会修改真实 DSH 配置，也不能代替安装版本的接口验收。预览使用的 React 镜像与生产宿主隔离。

生产 TGZ 不包含 preview 目录，以上两种预览方式适用于完整 ZIP／源码交付。预览运行时的完整许可位于 preview/LICENSES.txt。

## 打包

~~~text
npm run pack
~~~

脚本先构建，再用 npm pack --ignore-scripts 生成标准 TGZ；ZIP 使用 Python 3 标准库生成。打包不会安装插件或改动 DSH profile。

| 产物 | 内容与用途 |
| --- | --- |
| dist/dsh-sj-reasoning-ring-0.1.4.tgz | 可直接交给 DSH 安装器；包含生产入口、源码、测试、安装说明、验证报告及许可，排除预览运行时 |
| dist/dsh-sj-reasoning-ring-0.1.4.zip | 包含上述文件与完整 preview，适合解压安装、查看源码和直接打开离线预览 |

两种产物均排除 node_modules、Git 元数据、缓存与临时文件。打包完成会输出 SHA-256。若 ZIP 含 preview/vendor.js，必须同时提供 preview/LICENSES.txt。

## 验证范围

具体结果、执行条件与未完成项见 [VALIDATION.md](VALIDATION.md) 和 [design-qa.md](design-qa.md)。

自动化检查覆盖代码构建、目录／状态逻辑以及安装包结构。package 测试对生成的 ModuleLoader bundle 做装载格式检查。组件测试使用真实 React／ReactDOM 与 JSDOM，检查组件 DOM 和事件；模拟宿主数据用于隔离控制器行为。

组件测试需要将环境变量 SJRR_TEST_RUNTIME 设为已经提供 react、react-dom、jsdom 的独立 package 根目录。普通 npm test 在未提供该变量时会明确跳过该组，不会把跳过记录为通过；生产包不为此安装测试框架。

0.1.4 的实际测试执行和浏览器观察结果以本包验证报告为准。JSDOM 检查不能证明浏览器中的布局、绘制和实际观感，也不能作为真实 DSH 集成通过的证据。

旧版本的安装截图用于定位本次显示问题，不能代替升级后 0.1.4 的验收。真实环境仍应核对：小环与发送按钮的尺寸、160px 原位展开与收起动画、15px 环线与内盘相接、下拉菜单的关闭层级和点击隔离、环端点击与拖动、两种团队状态的视觉反馈，以及当前模型读回、等级保存、切换会话、团队开关读回、关闭确认和卸载恢复。

## 来源与许可

- 原插件：[Microqian2th/dsh-codex-effort-slider](https://github.com/Microqian2th/dsh-codex-effort-slider)，版本 1.1.5，commit fd1b78a73322c9686301e4ba9da0db85d60559ae。
- 原版权与 MIT 全文保存在 [LICENSE](LICENSE)。
- Lucide 的 ISC 及 Feather 派生图标的 MIT 全文保存在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- 包体／安装依据：[DSH Client 模块](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/client-modules.zh.md)、[插件管理器](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/plugin-manager/README.zh.md)。
- 本地包管理参考：[DSH 插件管理页](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-plugin-manager/README.zh.md)；具体覆盖／替换方式以当前运行版本的实际能力和返回结果为准。
- 宿主显示兼容依据：[圆角规范](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/ui-radius.zh.md)、[全局边角样式](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/src/styles/corner-shape.css)、[输入卡片结构](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-conversation/src/client/skeleton/InputBar.tsx)、[发送／停止按钮尺寸](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-conversation/src/client/skeleton/InputBar.module.css)。
- 接口依据：[模型目录](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-model-selection/src/client/directory.ts)、[团队 UI 接入](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-agent-team/src/client/mount.ts)、[标准插槽 props](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/slots.zh.md)。

## 单文件交互预览

交付中的 dsh-sj-reasoning-ring-0.1.4-preview.html 可直接用本机浏览器打开，不需要安装插件或启动服务器。它内嵌同一生产组件、独立 React 运行时及模拟宿主，仅用于查看布局、点选和动效，不连接真实 DSH。

完整源码 ZIP 在构建后可运行 npm run preview:export 重新导出该文件到 dist/；预览文件不进入生产 TGZ。
