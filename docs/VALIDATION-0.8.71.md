# 0.8.71 桌面伴随移除验收

- 删除客户端「桌面伴随窗口」一级设置 TAB、配置、发布/轮询定时器和会话通信指令；不影响现有主题/外观设置。
- 删除 Host 伴随快照、会话命令/诊断 API 与订阅/数据写盘逻辑。旧 API 现在返回 404。
- 删除原生 EXE、启动器、WebView2 loader、DirectComposition 源文件以及旧演示文件。
- 保留所有其他功能及旧用户自定义主题配置。已有配置文件（`whale-dream.json`）不会自动删除；旧伴随配置即使仍保存在文件中，也不会运行。
- 安装前应完整退出 DSH（含系统托盘）；若旧悬浮进程仍存在，可在任务管理器确认并结束旧 `whale-companion-win-x64.exe` 进程。
- 验证使用 `node --test docs/qa/removal-0.8.71.mjs` 和 `npm run prepack`。
- Windows DSH 内的插件升级仍需目标环境验收。
