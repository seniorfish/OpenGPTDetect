// Design screenshot / smoke driver: drives the built single-file app with the
// mock backend (port 8201) and captures the redesigned UI. Also asserts the key
// interactions still work (analyze -> heat colors, token-mode layered window,
// palette, settings dialog, dark theme).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const URL = 'file:///' + path.resolve(__dirname, '../dist/index.html').replace(/\\/g, '/')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = (name) => path.resolve(__dirname, name)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-first-run', '--window-size=1440,900', '--allow-file-access-from-files']
})

const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })

const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console.error: ' + m.text())
})

const text = (sel) => page.$eval(sel, (el) => el.textContent).catch(() => null)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const check = (name, cond) => {
  console.log((cond ? '✓' : '✗'), name)
  if (!cond) failed++
}

// Point settings at the mock backend (port 8201), then reload so the health
// poll reports online.
await page.goto(URL, { waitUntil: 'networkidle0' })
await page.evaluate(() => {
  localStorage.setItem('ppl-editor.settings.v1', JSON.stringify({ serverUrl: 'http://127.0.0.1:8201' }))
})
await page.reload({ waitUntil: 'networkidle0' })
await page.waitForSelector('.cm-content', { timeout: 15000 })

check('editor mounted', !!(await page.$('.cm-editor')))
check('header present', !!(await page.$('header')))
check('status bar present', !!(await page.$('footer')))

// Backend online
await page.waitForFunction(
  () => {
    const el = document.querySelector('#st-backend')
    return el && (/online|在线/.test(el.textContent))
  },
  { timeout: 8000 }
)
check('backend online (mock /health)', true)

// Type sample text
const sample =
  '大语言模型的困惑度是衡量文本复杂性的有效信号。AI-generated content often patterns differently from human writing. The perplexity of this document is computed token by token, using a local language model on your own machine.\n\n第二段继续说明：文本与结果不会离开你的设备。This is a second paragraph as well, long enough to make paragraph chunking meaningful.'
await page.click('.cm-content')
await page.type('.cm-content', sample, { delay: 1 })
check('chars stat updates', (await text('#st-chars')) !== null)

// Analyze
await page.click('#btn-analyze')
await page.waitForFunction(
  () => {
    const el = document.querySelector('#st-tokens')
    return el && /Token|tokens|Token \d+/.test(el.textContent) && !el.textContent.includes('—')
  },
  { timeout: 20000 }
)
const colored = await page.$$eval('.cm-content .hm', (els) =>
  els.filter((el) => /background-color: rgba\((?!138)/.test(el.getAttribute('style') || '')).length)
check('heat colors painted', colored > 0)
check('avg PPL visible', !(await text('#st-ppl')).includes('—'))
check('coverage 100%', (await text('#st-cov')).includes('100%'))

// Screenshot 1: analyzed light theme
await sleep(400)
await page.screenshot({ path: OUT('design-screenshot.png') })
console.log('saved design-screenshot.png')

// Open the settings dialog
await page.click('[data-testid="btn-settings"]')
await page.waitForSelector('#set-url', { timeout: 5000 })
check('settings dialog opens with color-stop rows', await page.$$eval('.stop-row', (els) => els.length).catch(() => 0))
await sleep(250)
await page.screenshot({ path: OUT('design-screenshot-2.png') })
console.log('saved design-screenshot-2.png')
await page.keyboard.press('Escape')
await sleep(200)

// Command palette (Ctrl+K)
await page.keyboard.down('Control')
await page.keyboard.press('k')
await page.keyboard.up('Control')
await page.waitForSelector('[data-slot="command-input"]', { timeout: 5000 })
check('command palette opens', true)
await sleep(250)
await page.screenshot({ path: OUT('design-screenshot-3-palette.png') })
console.log('saved design-screenshot-3-palette.png')

// Use the palette to switch to token mode (also validates a command run)
await page.type('[data-slot="command-input"]', 'token')
await sleep(300)
await page.keyboard.press('Enter')
await sleep(250)
check('token mode via palette', await page.$$eval('[data-slot="toggle-group-item"]', (els) =>
  els.find((el) => el.getAttribute('data-state') === 'on' && /token/i.test(el.textContent))).catch(() => false))

// Escape closes the palette; token-mode histogram controls must now be enabled
await page.keyboard.press('Escape')
await sleep(250)
check('window shift button enabled (token mode)', await page.$eval('#btn-win-up', (el) => !el.disabled).catch(() => false))
await page.screenshot({ path: OUT('design-screenshot-4-token.png') })
console.log('saved design-screenshot-4-token.png')

// Toast smoke: clear the editor and analyze -> empty-text warning toast must render
await page.click('.cm-content')
await page.keyboard.down('Control')
await page.keyboard.press('KeyA')
await page.keyboard.up('Control')
await page.keyboard.press('Backspace')
await page.click('#btn-analyze')
await sleep(600)
const toastText = await page.evaluate(() => {
  const list = document.querySelector('[data-sonner-toaster]')
  return list ? list.textContent : ''
}).catch(() => '')
check('warn toast renders via sonner', /empty|文本为空|Cannot reach|分析失败/.test(toastText))

// Dark theme: persist choice, reload, re-type a sample so the shot has content.
await page.evaluate(() => localStorage.setItem('ppl-editor.theme.v1', 'dark'))
await page.reload({ waitUntil: 'networkidle0' })
await page.waitForSelector('.cm-content', { timeout: 15000 })
await sleep(400)
check('dark class applied', await page.evaluate(() => document.documentElement.classList.contains('dark')))
await page.click('.cm-content')
await page.type('.cm-content', 'A dark-theme shot: the heat map stays readable in both color schemes.', { delay: 1 })
await page.click('#btn-analyze')
await sleep(1200)
await page.keyboard.down('Control')
await page.keyboard.press('k')
await page.keyboard.up('Control')
await page.waitForSelector('[data-slot="command-input"]', { timeout: 5000 })
await sleep(250)
await page.screenshot({ path: OUT('design-screenshot-5-dark.png') })
console.log('saved design-screenshot-5-dark.png')

console.log('\n--- console/page errors ---')
if (errors.length) {
  for (const e of errors.slice(0, 20)) console.log('ERR:', e)
  failed++
} else {
  console.log('none')
}

console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : failed + ' check(s) FAILED'}`)
await browser.close()
process.exit(failed ? 1 : 0)