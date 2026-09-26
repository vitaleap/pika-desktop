import 'virtual:uno.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { pinia } from './stores'
import { useThemeStore } from '@/stores/theme'
import { setupConsoleBridge } from '@/utils/log'

// 在最早阶段接管 console.log/info/warn/error/debug，转发到后端日志文件
// （%APPDATA%/com.seepine.pika-desktop/logs/pika.log），原始行为保留不变。
setupConsoleBridge()

const app = createApp(App)
app.use(pinia)
app.use(router)

// mount 之前把主题模式写到 <html>，避免首次渲染瞬间主题闪烁
const themeStore = useThemeStore(pinia)
themeStore.init()
if (themeStore.isDark) {
  document.documentElement.setAttribute('theme-mode', 'dark')
} else {
  document.documentElement.removeAttribute('theme-mode')
}

app.mount('#app')
