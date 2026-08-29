// ---------- Entry: bootstrap the Vue app ----------
import './style.css'
// Apply the persisted theme before the first render so no theme flash occurs.
import './theme.ts'
import { createApp } from 'vue'
import App from './App.vue'
import { i18n, initI18nSideEffects } from './i18n.ts'

// Apply locale detection side effects (<html lang>, <title>, persistence watcher)
// before the first render so the initial document metadata is correct.
initI18nSideEffects()

createApp(App).use(i18n).mount('#app')