import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 构建产物为单个 HTML 文件（js/css 全部内联）
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 100 * 1024 * 1024
  }
})
