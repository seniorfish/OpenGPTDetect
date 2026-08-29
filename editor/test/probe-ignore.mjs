// Contract probe: ignore selection -> badge count -> ignore-list dialog.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const URL = 'file:///' + path.resolve(__dirname, '../dist/index.html').replaceAll('\\', '/')
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-first-run', '--allow-file-access-from-files'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
let failed = 0
const check = (n, c) => { console.log((c ? '✓' : '✗'), n); if (!c) failed++ }

const OPEN = '[data-slot="dropdown-menu-content"][data-state="open"]'
const anyOpenItem = () => page.waitForFunction(
  (sel) => {
    const el = document.querySelector(sel)
    return el && el.querySelectorAll('[role="menuitem"]').length > 0
  },
  { timeout: 4000 },
  OPEN
)
const waitMenuClosed = () => page.waitForFunction(
  () => !document.querySelector('[data-slot="dropdown-menu-content"][data-state="open"]'),
  { timeout: 4000 }
)
const openIgnoreMenu = async () => {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('header button')]
    const t = btns.find((b) => /忽略/.test(b.textContent || ''))
    t.click()
  })
  await anyOpenItem()
}
const clickMenuItem = (needle) => page.evaluate((n) => {
  const el = [...document.querySelectorAll('[data-slot="dropdown-menu-content"][data-state="open"] [role="menuitem"]')]
    .find((x) => (x.textContent || '').includes(n))
  if (el) el.click()
  return !!el
}, needle)
const badge = () => page.$eval('header', (h) => { const b = h.querySelector('[data-slot="badge"]'); return b ? b.textContent.trim() : '0' }).catch(() => '0')

await page.goto(URL, { waitUntil: 'networkidle0' })
await page.evaluate(() => localStorage.setItem('ppl-editor.settings.v1', JSON.stringify({ serverUrl: 'http://127.0.0.1:8201' })))
await page.reload({ waitUntil: 'networkidle0' })
await page.waitForSelector('.cm-content', { timeout: 15000 })
await page.click('.cm-content')
await page.type('.cm-content', 'ignore probe text selection here', { delay: 1 })
await page.click('#btn-analyze')
await new Promise((r) => setTimeout(r, 1200))

// Select the last 5 chars and ignore them via the header menu
await page.click('.cm-content')
await page.keyboard.down('Control'); await page.keyboard.press('End'); await page.keyboard.up('Control')
await page.keyboard.down('Shift')
for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft')
await page.keyboard.up('Shift')
await new Promise((r) => setTimeout(r, 150))
await openIgnoreMenu()
check('ignore selection menu item found', await clickMenuItem('选区'))
await waitMenuClosed()
check('ignore count badge shows 1', (await badge()) === '1')
check('coverage drops after ignore', !(await page.$eval('#st-cov', (el) => el.textContent)).includes('100%'))

// Open the ignore-list dialog (item becomes available once a range exists)
await openIgnoreMenu()
check('ignore-list item found', await clickMenuItem('清单'))
await page.waitForSelector('.ignore-row', { timeout: 4000 })
const rows = await page.$$eval('.ignore-row', (els) => els.length).catch(() => 0)
check('ignore-list dialog lists the span', rows === 1)

console.log('errors:', errors.length ? errors.slice(0, 8) : 'none')
await browser.close()
process.exit(failed ? 1 : 0)