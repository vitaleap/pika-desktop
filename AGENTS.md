# AGENTS.md

本文件为 AI Coding 在本仓库中工作时提供指导。

## 基础

### 项目简介

Pika 是一个基于 Tauri 2 的桌面 Agent 应用：前端为 Vue 3 + TypeScript 的 WebView 界面，桌面端为 Rust 实现的 Tauri 宿主。

### 项目结构

```ini
src/                # 前端项目（Vite + Vue3 + Naive UI + UnoCSS），见 ./src/AGENTS.md
src-tauri/          # 桌面端项目（Tauri 2 + Rust），见 ./src-tauri/AGENTS.md
```

### 常用命令

```bash
# 前端开发（仅浏览器，不含 Tauri 能力）
bun run dev

# 桌面端开发（启动 Tauri + 前端）
bun tauri dev

# 代码检查（格式化 + 类型，等价 CI 的 bun check）
bun check

# 代码格式化
bun lint

# 构建前端产物
bun run build

# 构建桌面端安装包
bun tauri build
```

### 运行时 & 工具

- **仅使用 Bun** - 严禁使用 npm、pnpm 或 yarn
- 路径别名：`@` 指向 `src/`
- 提交信息遵循 Conventional Commits（由 commitlint + git hooks 强制）

### 文档

优先使用 llmstxt-mcp 相关工具查询文档：

- tauri: https://tauri.app/llms.txt
- vue: https://cn.vuejs.org/llms.txt
- vue-router: https://router.vuejs.org/llms.txt
- unocss: https://unocss.dev/llms.txt

## src

完整前端规范查看 `./src/AGENTS.md`

## src-tauri

完整桌面端规范查看 `./src-tauri/AGENTS.md`

## 注意

全程使用中文交流

- 开始前

使用 `karpathy-guidelines` skill

- 完成后，按照以下步骤进行：
  1. 使用 `code-simplifier` skill 对代码进行简化。
  2. 使用 `bun lint` 对代码进行格式化，确保符合项目的代码规范。
  3. 使用 `bun check` 对代码进行检查，确保符合项目的类型规范。
