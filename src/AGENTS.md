# AGENTS.md - 前端（src）

## 技术栈

- **框架**: Vue 3 + TypeScript
- **构建工具**: Vite 8
- **UI 组件库**: Naive UI
- **CSS 方案**: UnoCSS（presetWind4 + presetIcons）
- **状态管理**: Pinia
- **路由**: Vue Router 5（基于文件的自动路由）
- **桌面能力**: @tauri-apps/api + @tauri-apps/plugin-opener
- **其他依赖**: unplugin-auto-import、unplugin-vue-components

## 项目结构

```ini
src/
├── assets/       # 静态资源
├── components/   # 通用组件（自动全局注册，按需创建）
├── composables/  # 可复用组合式函数（自动导入，按需创建）
├── layouts/      # 布局组件（按需创建，见 .agents/docs/web/router.md）
├── pages/        # 页面（自动生成路由，404.vue 为兜底页）
├── router/       # 路由实例与布局装配
│   ├── index.ts  # createRouter、RouteMeta 类型扩展、标题设置
│   └── layout.ts # 将 pages 路由按 layout 规则分组装配
├── stores/       # Pinia 状态模块，按功能拆分子目录
├── utils/        # 工具函数
├── App.vue       # 根组件（主题与 Naive UI Provider 装配）
├── main.ts       # 入口文件
└── vite-env.d.ts # 环境与全局类型声明
```

## 常用命令

```bash
bun run dev          # 启动开发服务器（端口 2420，strictPort）
bun run gen-types    # 触发 auto-import / components / 路由类型生成
bun run type-check   # vue-tsc 类型检查
bun run check        # 生成类型 + 类型检查
bun run lint         # prettier --write
bun run build        # vue-tsc --noEmit && vite build
```

## 自动导入与自动注册

- `vue`、`pinia`、`vue-router`（含 `useRouter`、`useRoute`、`definePage` 等）常用 API 无需手动 import。
- `src/stores/**` 与 `src/composables/**` 的导出会被自动导入，例如直接调用 `useThemeStore()`。
- `src/components/**` 下的组件会被自动全局注册，例如 `<n-button>` 与自定义组件均无需手动 import。
- 自动生成的 `src/auto-imports.d.ts`、`src/components.d.ts`、`src/typed-router.d.ts` 已加入 `.gitignore` 与 `.prettierignore`，**不要手动修改**；类型缺失时执行 `bun run gen-types`。

## 路由规则

- `src/pages/` 下的 `.vue` 文件自动生成路由，例如 `pages/index.vue` → `/`、`pages/about.vue` → `/about`。
- `**/components/*` 下的文件不会生成路由。
- 页面通过 `definePage()` 声明元信息（`title`、`layout`、`keepAlive`、`authRequired`），类型定义见 `src/router/index.ts` 的 `RouteMeta`。
- `document.title` 由全局守卫根据 `meta.title` 统一设置为 `标题 - Pika`。
- 布局装配、`layout` 匹配规则等细节见 [`.agents/docs/web/router.md`](../.agents/docs/web/router.md)。

## 编码约定

- Vue 组件统一使用 `<script setup lang="ts">` + Composition API。
- 未使用变量以 `_` 开头可豁免（`noUnusedLocals` / `noUnusedParameters`）。
- 组件允许单词命名（如 `index.vue`）。
- 状态模块在 `src/stores/` 下按功能拆分子目录，store 内优先使用 setup 语法（`defineStore('name', () => {})`）。
- 需要持久化的状态使用 `@/utils/storage` 的 `useStorage`（默认 localStorage，键前缀取 `VITE_CACHE_PREFIX`，缺省为 `pika`，可传 `isSession` 改用 sessionStorage）。

## 样式与主题

- 优先使用 UnoCSS 原子类，避免新增手写 CSS。
- 深色模式通过 `html[theme-mode="dark"]` 选择器生效（见 `uno.config.ts` 的 `dark` 配置），由 `useThemeStore().isDark` 在 `App.vue` 中同步到 `<html>`。
- 主题模式（`light` / `dark` / `system`）通过 `useThemeStore()` 读写并持久化。
- 断点额外扩展了 `xs`（30rem）。

## 全局反馈 API

- `window.$message`、`window.$notification`、`window.$loadingBar` 由 `App.vue` 通过 `createDiscreteApi` 注入，可在任意位置直接调用。
- 类型声明位于 `src/vite-env.d.ts`，新增全局 API 时同步补充。
- 组件内仍优先使用 `useMessage()` 等 Naive UI 组合式 API；非组件上下文使用 `window.$*`。

## 图标

- 使用 UnoCSS `presetIcons`，图标集为 `@iconify/json`。
- 通过类名使用，例如 `i-mdi-home`；可在 https://yesicon.app/mdi 或 https://icon-sets.iconify.design/mdi/ 查询图标名。

## Tauri 交互

- 通过 `invoke`（`@tauri-apps/api/core`）调用 Rust 命令，命令需在 `src-tauri` 中注册，详见 [`../src-tauri/AGENTS.md`](../src-tauri/AGENTS.md)。
- 新增 Tauri 插件或权限时，同步更新 `src-tauri/capabilities/default.json`。
