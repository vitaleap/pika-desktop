# AGENTS.md - 桌面端（src-tauri）

## 技术栈

- **框架**: Tauri 2
- **语言**: Rust（edition 2021）
- **插件**: tauri-plugin-opener
- **序列化**: serde / serde_json

## 项目结构

```ini
src-tauri/
├── src/
│   ├── main.rs        # 二进制入口，仅调用 lib 的 run()
│   └── lib.rs         # 应用装配与 #[tauri::command] 命令定义
├── capabilities/
│   └── default.json   # 主窗口的权限声明
├── icons/             # 应用图标（多平台）
├── gen/schemas/       # 自动生成的 ACL schema，不要手动修改
├── build.rs           # tauri-build
├── Cargo.toml         # 依赖与 release 优化配置
└── tauri.conf.json    # 应用配置（窗口、构建、打包）
```

## 常用命令

```bash
# 开发（在仓库根目录执行）
bun tauri dev

# 构建安装包
bun tauri build

# 仅检查 Rust 代码
cd src-tauri && cargo check

# 格式化 Rust 代码
cd src-tauri && cargo fmt
```

## 约定

- **业务逻辑写在 `lib.rs`**，`main.rs` 保持为最小入口，便于后续支持移动端入口。
- 新增命令使用 `#[tauri::command]`，并在 `run()` 的 `invoke_handler(tauri::generate_handler![...])` 中注册。
- 命令参数与返回值需可序列化（`serde`）。
- 新增插件时：在 `Cargo.toml` 添加依赖 → 在 `run()` 中 `.plugin(...)` 注册 → 在 `capabilities/default.json` 中补充 `permissions`。
- 文件命名使用 snake_case，类型使用 PascalCase，常量使用 UPPER_SNAKE_CASE。

## 配置说明

- `tauri.conf.json` 的 `build` 段已绑定前端流程：`beforeDevCommand: bun run dev`、`beforeBuildCommand: bun run build`、`frontendDist: ../dist`。
- 前端开发端口固定为 `2420`（见 `vite.config.ts`），修改时需同步 `build.devUrl`。
- `app.security.csp` 当前为 `null`，如需收紧安全策略需评估前端资源加载影响。
- release 构建已开启 `lto`、`strip`、`panic = "abort"` 等体积优化，改动前确认影响。

## 前端联调

- 前端通过 `invoke('命令名', { 参数 })` 调用命令，示例见 `../src/pages/index.vue` 的 `greet`。
- 命令签名或参数变更时，同步更新前端调用处与相关类型。
