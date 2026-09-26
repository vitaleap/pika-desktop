// 通过 vite build 流程触发 unplugin-auto-import / unplugin-vue-components 生成 .d.ts
// write: false 跳过打包产物输出
import { build } from 'vite'

await build({
  build: {
    write: false,
    minify: false,
    reportCompressedSize: false,
  },
  logLevel: 'warn',
})
