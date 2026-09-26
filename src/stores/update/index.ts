import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { useStorage } from '@/utils/storage'

/** 后端 `fetch_update_metadata` 返回结构（供 update 窗口 / 其他消费方共享） */
export interface UpdateMetadata {
  currentVersion: string
  latestVersion: string | null
  notes: string | null
  hasDownload: boolean
}

interface PendingInfo {
  version: string
  notes: string
}

/** localStorage 缓存 key：checkUpdate 写入，供 checkInstall 取 version；update 窗口已不读 */
const PENDING_KEY = 'update_pending_info'

export const useUpdateStore = defineStore('update', () => {
  const pendingInfo = useStorage<PendingInfo | null>(PENDING_KEY, null)

  /**
   * 1. 拉取元信息（Rust 端完成签名校验）。返回是否有更新。
   *
   * 默认 `force=true`：周期性复检必须真查 updater，命中缓存会让 8h 重检永远拿不到新版本。
   */
  async function checkUpdate(force = true): Promise<boolean> {
    const meta = await invoke<UpdateMetadata>('fetch_update_metadata', { force })
    if (!meta.latestVersion || meta.latestVersion === meta.currentVersion) {
      pendingInfo.value = null
      return false
    }
    pendingInfo.value = {
      version: meta.latestVersion,
      notes: meta.notes ?? '',
    }
    return true
  }

  /**
   * 2. 检查是否已就绪 + 触发后台下载。
   *
   * - `autoInstall=true`：未就绪则 spawn 后台下载（仅调用一次，避免重复）；
   *   返回当前就绪状态。
   * - `autoInstall=false`：仅查询，不启动下载；用于前端轮询。
   */
  async function checkInstall(autoInstall: boolean): Promise<boolean> {
    if (!pendingInfo.value) return false
    return invoke<boolean>('check_install', {
      version: pendingInfo.value.version,
      autoInstall,
    })
  }

  /** 用户点击「更新」时调用 */
  async function runInstall(): Promise<void> {
    await invoke('run_install')
  }

  /** 稍后提醒我 */
  function deferUpdate() {
    pendingInfo.value = null
  }

  return {
    // actions
    checkUpdate,
    checkInstall,
    runInstall,
    deferUpdate,
  }
})
