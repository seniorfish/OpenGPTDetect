// Contract probe: presets dropdown load, save-preset dialog, settings style Select.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const URL = 'file:///' + path.resolve(__dirname, '../dist/index.html').replaceAll('\\', '/')
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-first-run', '--allow-file-access-from-files']
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const check = (n, c) => { console.log((c ? '✓' : '✗'), n); if (!c) failed++ }

await page.goto(URL, { waitUntil: 'networkidle0' })
await page.evaluate(() => {
  localStorage.setItem('ppl-editor.settings.v1', JSON.stringify({ serverUrl: 'http://127.0.0.1:8201' }))
  localStorage.removeItem('ppl-editor.presets.v1') // fresh built-ins
})
await page.reload({ waitUntil: 'networkidle0' })
await page.waitForSelector('.cm-content', { timeout: 15000 })

// Open the presets dropdown and load the English preset ('英文预设')
const clicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('header button')]
  const target = btns.find((b) => b.textContent.includes('Presets') || b.textContent.includes('方案'))
  if (!target) return false
  target.click()
  return true
})
check('presets dropdown opens', clicked)
await sleep(250)
const presetItems = await page.evaluate(() =>
  [...document.querySelectorAll('[data-slot="dropdown-menu-content"] [role="menuitem"]')].map((el) => el.textContent))
console.log('preset menu items:', JSON.stringify(presetItems))
check('built-in presets listed', presetItems.some((s) => s.includes('中文预设')) && presetItems.some((s) => s.includes('英文预设')))
// Click 英文预设
await page.evaluate(() => {
  const items = [...document.querySelectorAll('[data-slot="dropdown-menu-content"] [role="menuitem"]')]
  const t = items.find((el) => el.textContent.includes('英文预设'))
  if (t) t.click()
})
await sleep(300)
const chunkModeAfterLoad = await page.evaluate(() =>
  document.querySelector('[data-slot="toggle-group-item"][data-state="on"]')?.textContent ?? '')
console.log('chunk mode after preset load:', chunkModeAfterLoad)

// Save preset dialog
await page.click('[data-testid="btn-settings"]') // ensure we can close first
await page.keyboard.press('Escape')
await sleep(150)
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('header button')]
  const t = btns.find((b) => b.textContent.includes('Save') || b.textContent.includes('存为方案'))
})
// open save-preset via the header presets overflow: reopen dropdown and pick save item
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('header button')]
  const target = btns.find((b) => b.textContent.includes('Presets') || b.textContent.includes('方案'))
  target.click()
})
await sleep(200)
await page.evaluate(() => {
  const items = [...document.querySelectorAll('[data-slot="dropdown-menu-content"] [role="menuitem"]')]
  const t = items.find((el) => /Save|保存/.test(el.textContent))
  if (t) t.click()
})
await sleep(200)
check('save-preset dialog opens', !!(await page.$('#preset-name')))
await page.type('#preset-name', '探针方案', { delay: 1 })
await page.click('#do-save')
await sleep(200)
const savedAppears = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('header button')]
  const target = btns.find((b) => b.textContent.includes('Presets') || b.textContent.includes('方案'))
  if (!target) return false
  target.click()
  return true
})
await sleep(150)
const itemsAfter = await page.evaluate(() =>
  [...document.querySelectorAll('[data-slot="dropdown-menu-content"] [role="menuitem"]')].map((el) => el.textContent))
console.log('items after save:', JSON.stringify(itemsAfter))
check('saved preset appears in menu', itemsAfter.some((s) => s.includes('探针方案')))

console.log('errors:', errors.length ? errors.slice(0, 8) : 'none')
await browser.close()
process.exit(failed ? 1 : 0)