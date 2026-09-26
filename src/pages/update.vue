<script setup lang="ts">
import { marked } from 'marked'
import { openUrl } from '@tauri-apps/plugin-opener'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { invoke } from '@tauri-apps/api/core'
import type { UpdateMetadata } from '@/stores/update'
import vueLogo from '@/assets/vue.svg'

definePage({
  meta: {
    title: '软件更新',
  },
})

// 给链接加上 title / target=_blank，鼠标移上去有提示，
// 且 Tauri webview 中点击能在系统浏览器打开而不是在窗口内跳转。
// 代码块用 <div> 代替 <pre><code>，避免 macOS WKWebView 中 pre 元素只能选择一次的 bug。
marked.use({
  renderer: {
    link({ href, title, tokens }) {
      const linkTitle = title || href
      const text = this.parser.parseInline(tokens)
      return `<a href="${href}" title="${linkTitle}" target="_blank" rel="noopener noreferrer">${text}</a>`
    },
    code({ text, lang }) {
      const langAttr = lang ? ` data-lang="${lang}"` : ''
      // text 已被 marked 转义，直接输出即可
      return `<div class="pre"${langAttr}><div class="code">${text}</div></div>\n`
    },
  },
})

const store = useUpdateStore()
const flow = useUpdateFlow()

// 元信息 / ready 状态直接 invoke 获取，不走 store 中转。
// `force=false` 命中后端进程内缓存，避免每次 focus 切换都重走 `updater().check()`。
const meta = ref<UpdateMetadata | null>(null)
const ready = ref(false)

// 拦截 markdown 内的链接点击，调用系统默认应用打开
function handleMarkdownClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  const anchor = target?.closest('a')
  if (anchor?.href) {
    e.preventDefault()
    openUrl(anchor.href).catch((err) => console.error('[openUrl]', err))
  }
}

async function refreshMeta() {
  // force=false 命中后端缓存不重走 updater().check()；
  // 下载状态由返回的 hasDownload 给出（与 check_install 查同一把 PkgBytes 锁），省一次 IPC。
  // update 窗口仅在主窗口 PkgBytes 就绪后才被 show，故此处足够即时。
  meta.value = await invoke<UpdateMetadata>('fetch_update_metadata', { force: false })
  ready.value = meta.value?.hasDownload ?? false
  await nextTick()
}

// 不能在 onMounted 异步回调里直接调 onUnmounted：lifecycle hook 须在 setup 同步阶段注册，
// 否则可能因 effect scope 已过期而失效。故暂存取消函数到顶层变量。
let unlistenFocus: () => void = () => {}

onMounted(async () => {
  // 监听当前 webview focus 变化模拟 onShow（Tauri 2 无 onShow 事件）：
  // update 窗口启动时即创建（隐藏），主窗口 runFlow 检测到 ready 后
  // 才调 show() + setFocus()，此时再拉最新状态，时序才正确。
  //
  // 先注册监听器再异步刷新：监听器注册不依赖网络，启动期 fetch 失败
  // 也不会阻塞后续 focus 触发的刷新链路。
  const win = getCurrentWebviewWindow()
  unlistenFocus = await win.onFocusChanged(({ payload: focused }) => {
    if (!focused) {
      return
    }
    if (ready.value) {
      return
    }
    refreshMeta().catch((e) => console.error('[update] refresh failed:', e))
  })
  refreshMeta().catch((e) => console.error('[update] initial refresh failed:', e))
})

onUnmounted(() => {
  unlistenFocus()
})

const canInstall = computed(
  () =>
    ready.value &&
    !!meta.value?.latestVersion &&
    meta.value.latestVersion !== meta.value.currentVersion,
)

const renderedNotes = computed(() => {
  if (!meta.value?.notes) {
    return '_暂无信息_'
  }
  return marked.parse(meta.value.notes, { async: false, breaks: true }) as string
})

const promptText = computed(() => {
  const latest = meta.value?.latestVersion
  const current = meta.value?.currentVersion
  if (latest && current) {
    return `Pika ${latest} 已发布，您现在的版本是${current}。要现在更新吗？`
  }
  if (latest) {
    return `Pika ${latest} 已发布。要现在更新吗？`
  }
  if (current) {
    return `Pika 有新版本可用，您当前的版本是${current}。要现在更新吗？`
  }
  return 'Pika 有新版本可用，要现在更新吗？'
})

async function handleLater() {
  store.deferUpdate()
  await flow.hideUpdateWindow()
}
const loading = ref(false)
async function handleInstall() {
  if (!canInstall.value) return
  loading.value = true
  try {
    await store.runInstall()
  } catch (e) {
    loading.value = false
    console.error('[update] install failed:', e)
  }
}
</script>

<template>
  <div class="update-window h-screen w-screen flex flex-col overflow-hidden">
    <main class="flex-1 min-h-0 flex flex-row gap-4 p-4">
      <!-- 应用图标 -->
      <aside class="w-14 h-14 mx-4 pt-2 flex-shrink-0 rounded-2xl flex items-center justify-center">
        <img :src="vueLogo" alt="Pika" class="w-full h-full" />
      </aside>

      <!-- 内容 -->
      <div class="flex-1 flex flex-col gap-1 pb-1 overflow-hidden select-none">
        <h2 class="font-bold text-base m-0 leading-tight">新版本的 Pika 已经发布</h2>
        <p class="leading-relaxed text-xs">
          {{ promptText }}
        </p>
        <div class="text-xs font-bold pb-2">更新信息：</div>
        <div class="flex-1 overflow-y-auto dark:bg-#1f1f1f rounded-md p-4 select-text">
          <div
            class="markdown break-words select-text"
            v-html="renderedNotes"
            @click="handleMarkdownClick"
          />
        </div>
      </div>
    </main>

    <footer class="px-4 pb-4 pt-4 flex items-center gap-4">
      <div class="flex-1" />
      <n-button size="small" v-if="!loading" tertiary @click="handleLater">稍后提醒我</n-button>
      <n-button
        size="small"
        type="primary"
        :disabled="!canInstall"
        :loading="loading"
        @click="handleInstall"
      >
        {{ canInstall ? '更新' : '准备中' }}
      </n-button>
    </footer>
  </div>
</template>

<style lang="scss" scoped>
/* markdown 基础样式（GitHub 风格精简版） */
.markdown {
  --md-bg-alt: rgba(175, 184, 193, 0.2);
  @apply select-text text-[13px] leading-[1.6] break-words text-gray-900 dark:text-gray-100;

  :deep(p) {
    @apply my-1.5;
  }

  /* 标题：按级别递减 */
  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    @apply font-semibold leading-[1.25] mt-3.5 mb-1.5;
  }
  /* 首个标题不带上边距 */
  :deep(h1:first-child),
  :deep(h2:first-child),
  :deep(h3:first-child),
  :deep(h4:first-child),
  :deep(h5:first-child),
  :deep(h6:first-child) {
    @apply mt-0;
  }
  :deep(h1) {
    @apply text-[20px] pb-1.5 border-b border-gray-300 dark:border-gray-700;
  }
  :deep(h2) {
    @apply text-[17px] pb-1 border-b border-gray-300 dark:border-gray-700;
  }
  :deep(h3) {
    @apply text-[15px];
  }
  :deep(h4) {
    @apply text-[14px];
  }
  :deep(h5) {
    @apply text-[13px];
  }
  :deep(h6) {
    @apply text-[13px] text-gray-500 dark:text-gray-400;
  }

  /* 加粗 / 斜体 / 删除线 */
  :deep(strong) {
    @apply font-semibold;
  }
  :deep(em) {
    @apply italic;
  }
  :deep(del) {
    @apply text-gray-500 dark:text-gray-400 line-through;
  }

  /* 列表 */
  :deep(ul),
  :deep(ol) {
    @apply pl-6 my-1.5;
  }
  :deep(ul) {
    @apply list-disc;
  }
  :deep(ol) {
    @apply list-decimal;
  }
  :deep(li) {
    @apply my-0.5;
  }
  :deep(li > p) {
    @apply m-0;
  }

  /* 引用 */
  :deep(blockquote) {
    @apply my-2 pl-3 text-gray-500 dark:text-gray-400 border-l-[3px] border-gray-300 dark:border-gray-700;
  }

  /* 链接 */
  :deep(a) {
    @apply text-blue-700 dark:text-blue-400 no-underline;
  }
  :deep(a:hover) {
    @apply underline;
  }

  /* 行内代码 */
  :deep(code) {
    @apply px-[0.35em] py-[0.15em] text-[0.92em] bg-[var(--md-bg-alt)] rounded break-all whitespace-pre-wrap;
  }

  /* 代码块（用 <div class="pre"><div class="code"> 代替原生 <pre><code>） */
  :deep(.pre) {
    @apply my-2 px-3 py-2.5 bg-[var(--md-bg-alt)] rounded overflow-x-auto select-text;
  }
  :deep(.code) {
    @apply p-0 bg-transparent text-[length:inherit] whitespace-pre break-normal select-text;
  }

  /* 分割线 */
  :deep(hr) {
    @apply my-3 border-t border-gray-300 dark:border-gray-700;
  }

  /* 表格 */
  :deep(table) {
    @apply block w-full overflow-x-auto border-collapse my-2 text-[0.95em];
  }
  :deep(th),
  :deep(td) {
    @apply px-2.5 py-1.5 border border-gray-300 dark:border-gray-700 text-left;
  }
  :deep(th) {
    @apply bg-[var(--md-bg-alt)] font-semibold;
  }

  /* 图片 */
  :deep(img) {
    @apply max-w-full h-auto rounded;
  }
}

:global(html[theme-mode='dark']) .markdown {
  --md-bg-alt: rgba(110, 118, 129, 0.2);
}
</style>
