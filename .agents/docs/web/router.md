# 前端路由与布局规范

前端使用 Vue Router 5 的文件路由（`vue-router/vite` 插件）+ 自定义布局装配，核心逻辑在 `src/router/`。

## 一、路由来源

- 扫描目录：`src/pages`（见 `vite.config.ts` 的 `VueRouter({ routesFolder })`）。
- 排除规则：`**/components/*` 不生成路由。
- 类型产物：`src/typed-router.d.ts`（自动生成，勿手改）。
- 兜底路由：`/:pathMatch(.*)*` 指向 `src/pages/404.vue`。

## 二、页面元信息

页面通过 `definePage()` 声明 `RouteMeta`（类型见 `src/router/index.ts`）：

```ts
definePage({
  meta: {
    title: '页面标题',
    layout: 'empty',
    keepAlive: false,
    authRequired: true,
  },
})
```

| 字段           | 说明                                                        | 当前状态       |
| -------------- | ----------------------------------------------------------- | -------------- |
| `title`        | 文档标题，最终渲染为 `标题 - Pika`，缺省时为 `Pika`         | 已生效         |
| `layout`       | 指定布局名（对应 `src/layouts/<name>.vue`），仅对根页面有效 | 已生效         |
| `keepAlive`    | 是否缓存页面                                                | 预留，尚未实现 |
| `authRequired` | 是否需要登录                                                | 预留，尚未实现 |

## 三、布局装配流程（`src/router/layout.ts`）

1. **收集布局**：`import.meta.glob('../layouts/*.vue')` 扫描 `src/layouts/`，以文件名（不含扩展名）作为布局名。
   - 若不存在 `default.vue`，会自动注册一个直接渲染 `<RouterView>` 的默认布局。
   - `src/layouts/` 目录当前未创建，按需新增即可。
2. **扁平化路由**：递归处理文件路由结果。带有 `name` 的节点被提升为顶层路由，且 `path` 重置为 `name` 去掉末尾 `/`（用于把 `pages/user/index.vue` 的 `/user/` 规范为 `/user`）；无 `name` 的中间节点被丢弃，仅保留其子路由。
3. **按布局分组**：
   - **default 组**：`meta.layout` 未声明，且路径首段不属于任何布局名。
   - **其他布局组**：满足其一即归入该布局：
     - `meta.layout === 布局名`（显式指定）；
     - `meta.layout` 未声明，且路径以 `/<布局名>` 开头（按路径前缀匹配）。
   - 分组后没有子路由的布局会被过滤，不产生空路由。
4. 每个布局组都是 `path: '/'` 的父路由，`name` 为 `layout_<布局名>`。

## 四、匹配优先级示例

假设存在 `src/layouts/admin.vue` 与 `src/layouts/empty.vue`：

| 页面路径            | 声明                          | 归入布局 | 原因                    |
| ------------------- | ----------------------------- | -------- | ----------------------- |
| `pages/index.vue`   | 无                            | default  | 前缀 `/` 不匹配任何布局 |
| `pages/admin/a.vue` | 无                            | admin    | 路径前缀匹配 `/admin`   |
| `pages/login.vue`   | `meta: { layout: 'empty' }`   | empty    | 显式指定优先            |
| `pages/admin/b.vue` | `meta: { layout: 'default' }` | default  | 显式指定覆盖前缀匹配    |

## 五、注意事项

- `meta.layout` 只在根页面（如 `pages/xxx.vue`、`pages/xxx/index.vue`）上生效；在子页面声明不会改变布局。
- 布局名与路径首段同名时会产生隐式绑定，新增布局前先确认不会误伤已有路由。
- 修改 `layout.ts` 后需验证：首页、带前缀页面、显式 `layout` 页面、404 兜底四类场景。
