import { type VNode } from 'vue'
import { type RouteRecordRaw, RouterView } from 'vue-router'

const layoutsPage = import.meta.glob<VNode>(['../layouts/*.vue'])
const newLayouts: {
  [key: string]: () => Promise<VNode>
} = {}
Object.keys(layoutsPage).forEach((key) => {
  const layoutName = key.split('/').pop()?.split('.')[0]
  if (layoutName && layoutsPage[key]) {
    newLayouts[layoutName] = layoutsPage[key]
  }
})
if (!newLayouts['default']) {
  newLayouts['default'] = async () => h(RouterView)
}

const resetRoute = (route: RouteRecordRaw): RouteRecordRaw[] => {
  if (typeof route.name === 'string') {
    return [
      {
        ...route,
        path: route.name.endsWith('/')
          ? route.name.substring(0, route.name.length - 1)
          : route.name,
      },
    ]
  }
  if (!route.children) {
    return []
  }
  const arr: RouteRecordRaw[] = []
  route.children.forEach((child) => {
    arr.push(...resetRoute(child))
  })
  return arr
}
const getPathPrefix = (path: string): string => {
  if (!path.includes('/')) {
    return path
  }
  const arr = path.split('/')
  if (arr.length === 0) {
    return path
  }
  return arr[0]!
}
export const setupLayouts = (routes: readonly RouteRecordRaw[]): readonly RouteRecordRaw[] => {
  // 处理路由，例如 pages/[dir]/index.vue，首节点为路径空路由，因此需要拼接
  const newRoutes: RouteRecordRaw[] = []
  routes.forEach((route) => {
    newRoutes.push(...resetRoute(route))
  })

  const layoutKeys = Object.keys(newLayouts)
  const routesx: RouteRecordRaw[] = [
    {
      name: 'layout_default',
      path: '/',
      component: newLayouts['default'],
      children: newRoutes.filter(
        // 未设置 layout，且前缀未属于任何一个 layout，则归到 default
        (r) => r.meta?.layout === undefined && !layoutKeys.includes(getPathPrefix(r.path)),
      ),
    },
    ...Object.keys(newLayouts)
      .filter((layout) => layout !== 'default')
      .map((layoutName) => {
        return {
          name: `layout_${layoutName}`,
          path: '/',
          component: newLayouts[layoutName],
          children: newRoutes.filter((r) => {
            // 路由指定
            if (r.meta?.layout === layoutName) {
              return true
            }
            // 或者路径匹配
            return r.meta?.layout === undefined && r.path.startsWith(`/${layoutName}`)
          }),
        }
      })
      .filter((item) => item.children.length > 0),
    { path: '/:pathMatch(.*)*', component: () => import('@/pages/404.vue') },
  ]
  return routesx
}
