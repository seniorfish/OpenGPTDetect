import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'PPL 热力图',
    description:
      '配合本地因果语言模型服务测量网页文本困惑度,以低饱和热力图与小字标注提示复杂度,并识别疑似 AI 生成内容。',
    permissions: ['storage'],
    host_permissions: ['http://127.0.0.1/*', 'http://localhost/*'],
    action: {
      default_title: 'PPL 热力图'
    },
    commands: {
      'toggle-enabled': {
        suggested_key: { default: 'Ctrl+Shift+L', mac: 'Command+Shift+L' },
        description: '开启/关闭 PPL 热力图'
      }
    }
  },
  vite: () => ({
    plugins: [tailwindcss()]
  })
})
