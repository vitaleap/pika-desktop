/// <reference types="vite/client" />
/// <reference types="unocss/preset-uno" />
/// <reference types="./auto-imports.d.ts" />
/// <reference types="./components.d.ts" />
/// <reference types="./typed-router.d.ts" />

import type { LoadingBarApiInjection } from 'naive-ui/es/loading-bar/src/LoadingBarProvider'
import type { MessageApiInjection } from 'naive-ui/es/message/src/MessageProvider'
import type { NotificationApiInjection } from 'naive-ui/es/notification/src/NotificationProvider'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

export {}

declare global {
  interface Window {
    $message: MessageApiInjection
    $notification: NotificationApiInjection
    $loadingBar: LoadingBarApiInjection
  }
}
