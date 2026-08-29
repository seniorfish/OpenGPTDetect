import { defineConfig } from 'vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Build output is a single HTML file (all JS/CSS inlined).
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    // Pre-compile locale messages at build time so the runtime drops the message compiler.
    VueI18nPlugin({
      include: resolve(dirname(fileURLToPath(import.meta.url)), 'src/locales/**')
    }),
    viteSingleFile()
  ],
  resolve: {
    alias: {
      '@': resolve(dirname(fileURLToPath(import.meta.url)), 'src')
    }
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 100 * 1024 * 1024
  }
})