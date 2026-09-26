import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useUpdateStore } from '@/stores/update'

/** 前端轮询退避：起始 10s，每次 +10s，封顶 300s（与后端下载重试保持一致） */
const POLL_BASE_MS = 10_000
const POLL_MAX_MS = 300_000
const POLL_STEP_MS = 10_000

/** 无更新时重新检测间隔：8 小时，避免 macOS 用户长期待机错过更新 */
const RECHECK_DELAY_MS = 8 * 60 * 60 * 1000

/** 模块作用域轮询句柄，避免 runFlow 重入时定时器泄漏 */
let pollTimer: ReturnType<typeof setTimeout> | null = null

function cancelPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

/**
 * 主窗口更新流程：检测 → 启动后台下载（含后端退避重试） → 退避轮询查 ready → 弹窗
 */
export function useUpdateFlow() {
  const store = useUpdateStore()

  async function showUpdateWindow() {
    const win = await WebviewWindow.getByLabel('update')
    if (!win) return
    await win.show()
    await win.setFocus()
  }

  async function hideUpdateWindow() {
    const win = await WebviewWindow.getByLabel('update')
    if (win) await win.hide()
  }

  function scheduleCheckInstallNext(delayMs: number) {
    pollTimer = setTimeout(async () => {
      pollTimer = null
      const ready = await store.checkInstall(false)
      if (ready) {
        await showUpdateWindow()
        return
      }
      scheduleCheckInstallNext(Math.min(delayMs + POLL_STEP_MS, POLL_MAX_MS))
    }, delayMs)
  }

  /** 主窗口 entry：检测 → 启动下载 → 退避轮询直到 ready → 弹窗；无更新时 8h 后重检 */
  async function runFlow() {
    cancelPolling()

    // force=true：周期性复检必须真查 updater，命中缓存会让 8h 重检永远拿不到新版本
    const hasUpdate = await store.checkUpdate(true)
    if (!hasUpdate) {
      pollTimer = setTimeout(() => {
        pollTimer = null
        runFlow().catch((e) => console.error('[update] runFlow failed:', e))
      }, RECHECK_DELAY_MS)
      return
    }

    if (await store.checkInstall(true)) {
      await showUpdateWindow()
      return
    }

    scheduleCheckInstallNext(POLL_BASE_MS)
  }

  return {
    runFlow,
    showUpdateWindow,
    hideUpdateWindow,
  }
}
