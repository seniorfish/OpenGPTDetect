// ---------- Entry: bootstrap the React app ----------
import './style.css'
// Apply the persisted theme before the first render so no theme flash occurs.
import './theme.ts'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { initI18nSideEffects } from './i18n.ts'

// Apply locale detection side effects (<html lang>, <title>) before the first
// render so the initial document metadata is correct.
initI18nSideEffects()

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)