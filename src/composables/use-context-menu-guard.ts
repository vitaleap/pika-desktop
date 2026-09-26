/**
 * 全局右键守卫：默认拦截浏览器右键菜单，仅在以下情况放行：
 *  - 存在非空选中文本（含 input/textarea 内选中）
 *  - 右键目标是带 href 的链接（含其任意子元素）
 *
 * 调用 `useContextMenuGuard().enable()` 即可挂载监听；
 * composable 卸载时自动解绑，无需手动清理。
 */
export function useContextMenuGuard() {
  function isLink(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest('a')?.getAttribute('href')?.trim()
  }

  function hasTextSelection(): boolean {
    return !!window.getSelection()?.toString().trim()
  }

  function handleContextMenu(event: MouseEvent) {
    if (hasTextSelection() || isLink(event.target)) return
    event.preventDefault()
  }

  function enable() {
    onMounted(() => {
      // 使用 capture 确保即便子元素调用 stopPropagation 也能命中守卫
      window.addEventListener('contextmenu', handleContextMenu, { capture: true })
    })
    onScopeDispose(() => {
      window.removeEventListener('contextmenu', handleContextMenu, { capture: true })
    })
  }

  return { enable }
}
