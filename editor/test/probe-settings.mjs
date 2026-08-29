// Contract probe v2: reka primitives need real pointer/keyboard events.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const check = (n, c) => { console.log((c ? '✓' : '✗'), n); if (!c) failed++ }

await page.goto(URL, { waitUntil: 'networkidle0' })
await page.evaluate(() => localStorage.setItem('ppl-editor.settings.v1', JSON.stringify({ serverUrl: 'http://127.0.0.1:8201' })))
await page.reload({ waitUntil: 'networkidle0' })
await page.waitForSelector('.cm-content', { timeout: 15000 })
await page.click('.cm-content')
await page.type('.cm-content', 'Settings interactions probe for heat style and opacity.', { delay: 1 })
await page.click('#btn-analyze')
await sleep(1200)

await page.evaluate(() => document.querySelector('[data-testid="btn-settings"]').click())
await page.waitForSelector('#set-url', { timeout: 5000 })

// --- Style Select: real click on trigger, then real click on the "下划线" item ---
const trig = await page.$('[data-slot="select-trigger"]')
const tb = await trig.boundingBox()
await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2)
await sleep(300)
const item = await page.evaluateHandle(() => {
  const items = [...document.querySelectorAll('[data-slot="select-item"]')]
  return items.find((el) => /下划线|underline/i.test(el.textContent || ''))
})
const box = await item.asElement().boundingBox()
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
await sleep(350)
const underlineUsed = await page.evaluate(() =>
  [...document.querySelectorAll('.cm-content .hm')].some((el) => /text-decoration/.test(el.getAttribute('style') || '')))
check('style select switches to underline', underlineUsed)

// --- Opacity slider: real click on the track near the left end ---
await page.evaluate(() => {
  const label = document.querySelector('#opacity-val')
  return label ? label.textContent : null
})
const before = await page.$eval('#opacity-val', (el) => el.textContent)
const slider = await page.$('[data-slot="slider"]')
const sb = await slider.boundingBox()
await page.mouse.click(sb.x + sb.width * 0.15, sb.y + 3)
await sleep(350)
const after = await page.$eval('#opacity-val', (el) => el.textContent)
console.log('opacity', before, '->', after)
check('opacity slider changes value', after !== before)

console.log('errors:', errors.length ? errors.slice(0, 8) : 'none')
await browser.close()
process.exit(failed ? 1 : 0)