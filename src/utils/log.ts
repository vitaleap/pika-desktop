import { invoke } from '@tauri-apps/api/core'

/**
 * 重写浏览器 console，把 log/info/warn/error/debug 同步转发到后端 tauri-plugin-log。
 * 后端会把前后端日志写到同一个 `%APPDATA%/<bundle-id>/logs/pika.log` 文件里，
 * 前端消息自动带 `webview` 前缀以区分来源。
 *
 * 必须在应用最早处（main.ts 顶部）调用，且 await 完成后再挂载 Vue。
 */
type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** 把任意参数序列化成单行字符串（避免 structuredClone 失败 / 多行日志污染） */
function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ''}`
      if (typeof a === 'string') return a
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

/** fire-and-forget：invoke 失败不能阻塞前端 */
function send(level: Level, args: unknown[]): void {
  if (!isTauri()) return
  const message = formatArgs(args)
  invoke('plugin:log|log', { level, message }).catch(() => {
    /* 后端日志通道不可用时静默忽略，避免污染前端控制台 */
  })
}

export function setupConsoleBridge(): void {
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  }

  // 用 bind 让原始 console 的调用栈能正确指向调用方
  console.log = (...args: unknown[]) => {
    send('info', args)
    original.log.apply(console, args)
  }
  console.info = (...args: unknown[]) => {
    send('info', args)
    original.info.apply(console, args)
  }
  console.warn = (...args: unknown[]) => {
    send('warn', args)
    original.warn.apply(console, args)
  }
  console.error = (...args: unknown[]) => {
    send('error', args)
    original.error.apply(console, args)
  }
  console.debug = (...args: unknown[]) => {
    send('debug', args)
    original.debug.apply(console, args)
  }
}
