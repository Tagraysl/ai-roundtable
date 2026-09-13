# macOS · 同桌 AI / AI Roundtable

## 中文

- Apple 芯片（M 系列）选择 `macOS-arm64.dmg`；Intel 处理器选择 `macOS-x64.dmg`。可在苹果菜单的“关于本机”查看芯片类型。
- 打开 DMG，把 **AI Roundtable.app** 拖到 **Applications（应用程序）**，然后从应用程序打开。ZIP 是备用下载，解压后同样把完整 `.app` 放入应用程序。
- 软件设置中的“创建桌面快捷方式”会创建指向应用的链接，显示应用图标。移动应用后需重新创建；也可把应用保留在 Dock。
- 默认数据保存在 `~/Library/Application Support/AI Roundtable/data`，与应用包分离。升级前退出并备份数据，再替换应用。不要把数据放在 DMG 内。
- 密钥使用操作系统安全存储能力加密。不要复制 Windows 的加密密钥到 Mac；请在 Mac 重新填写。无须注册本软件账号。
- 支持 Command+Enter 发送、Command+= 放大、Command+- 缩小、Command+0 恢复和 Esc 退出全屏。
- Codex 需要用户在本机另行安装并登录。若无法自动发现，在管理 AI 中选择本机 `codex` 可执行文件；不使用 Windows 的 `.exe`。
- 同一服务商、同一模型可用于多个工作流节点；有依赖的步骤按顺序，无依赖的步骤可并行。

**测试版说明：** 本应用包仅有本地临时签名（ad-hoc），没有 Apple Developer ID 签名或 Apple 公证。首次打开可能被 Gatekeeper 阻止。请确认来源和 SHA-256；如决定继续，仅使用 macOS“系统设置 → 隐私与安全”提供的针对该应用的打开选项。不要关闭全局安全防护。如系统没有提供允许打开选项，请暂勿使用该测试包。

GitHub Mac 构建和隔离启动测试不能覆盖所有真实 Mac、服务商连接和系统权限组合；本版本不宣称完成所有实体设备兼容性测试。实际最低系统版本以应用包 Info.plist 的 LSMinimumSystemVersion 为准。

## English

Choose `macOS-arm64.dmg` for Apple silicon (M-series), or `macOS-x64.dmg` for Intel. Check About This Mac if unsure. Open the DMG and drag **AI Roundtable.app** into **Applications**, then launch it there. ZIP files are an alternative; keep the entire app bundle together.

Settings can create a desktop link using the app icon. Recreate it after moving the app, or keep the app in the Dock. Data is stored separately at `~/Library/Application Support/AI Roundtable/data`. Quit and back up data before replacing the app. Re-enter API credentials on Mac; Windows-encrypted credentials are not portable.

Use Command+Enter to send, Command+= / Command+- to zoom, Command+0 to reset, and Esc to exit full screen. Install and sign into Codex separately if needed; select the local `codex` executable if discovery fails. A single model can serve multiple workflow steps.

**Preview:** ad-hoc signed, without Apple Developer ID signing or notarization. Gatekeeper may block the first launch. Verify the source and SHA-256; if you decide to proceed, use the per-app opening option provided in System Settings → Privacy & Security. Do not disable system-wide protections. If macOS offers no opening option, do not use this preview package.

GitHub-hosted Mac builds and isolated launch checks do not establish compatibility with every physical device, provider or permission configuration. The app bundle's LSMinimumSystemVersion records the minimum macOS version required by its runtime.
