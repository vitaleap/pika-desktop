import { createRouter, createWebHashHistory } from 'vue-router'
import { routes as autoRoutes } from 'vue-router/auto-routes'
import { setupLayouts } from './layout'

const routes = setupLayouts(autoRoutes)

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

declare module 'vue-router' {
  /**
   * @example
   * ```ts
   * definePage({
   *   title: '页面标题',
   *   meta: {
   *     authRequired: false,
   *   },
   * })
   * ```
   */
  interface RouteMeta {
    /**
     * 布局组件名称，例如 /src/layouts/empty.vue，则为 empty
     * 注意：只对根页面有效，在子页面声明不会生效
     *   例如 /src/pages/xxx.vue
     *   或者 /src/pages/xxx/index.vue
     *
     * 也会根据路径匹配，例如存在 layouts/admin.vue
     * 则 pages/admin/xxx.vue 下都会默认使用该路由
     *
     * @default default
     */
    layout?: string
    /**
     * 标题
     */
    title?: string
    /**
     * 是否保持路由 alive
     * @default false
     */
    keepAlive?: boolean
    /**
     * 是否需要登录才能访问
     * @default true
     */
    authRequired?: boolean
  }
}

const setDocumentTitle = (title?: string) => {
  document.title = title ? `${title} - Pika` : 'Pika'
}

router.beforeEach((to) => {
  setDocumentTitle(to.meta.title)
})

export default router
