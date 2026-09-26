import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import VueRouter from 'vue-router/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import { VueRouterAutoImports } from 'vue-router/unplugin'
import process from 'node:process'

const host = process.env.TAURI_DEV_HOST

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [
    vue(),
    UnoCSS(),
    VueRouter({
      routesFolder: [{ src: 'src/pages' }],
      exclude: ['**/components/*'],
      dts: 'src/typed-router.d.ts',
    }),
    AutoImport({
      imports: ['vue', 'pinia', VueRouterAutoImports],
      dirs: ['src/stores/**', 'src/composables/**'],
      dts: 'src/auto-imports.d.ts',
    }),
    Components({
      dirs: ['src/components'],
      resolvers: [NaiveUiResolver()],
      dts: 'src/components.d.ts',
    }),
  ],
  build: {
    target: 'es2020',
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        update: fileURLToPath(new URL('./update.html', import.meta.url)),
      },
      output: {
        minify: true,
        codeSplitting: {
          groups: [
            { name: 'vendor-vue', test: /[\\/](?:vue|pinia|vue-router|@vue)[\\/]/ },
            { name: 'vendor-utils', test: /[\\/](?:dayjs|es-toolkit|@vueuse)[\\/]/ },
            { name: 'vendor-naive', test: /[\\/](?:naive-ui)[\\/]/ },
          ],
        },
      },
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 2420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 2421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
}))
