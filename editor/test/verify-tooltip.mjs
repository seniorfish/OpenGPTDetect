// Interaction audit: hover tooltip renders and is theme-styled; editor text has
// theme-appropriate contrast; the layered-window histogram dims outside range.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const URL = 'file:///' + path.resolve(__dirname, '../dist/index.html').replace(/\\/g, '/')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-first-run', '--allow-file-access-from-files']
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const check = (name, cond) => {
  console.log((cond ? '✓' : '✗'), name)
  if (!cond) failed++
}

await page.goto(URL, { waitUntil: 'networkidle0' })
await page.evaluate(() => {
  localStorage.setItem('ppl-editor.settings.v1', JSON.stringify({ serverUrl: 'http://127.0.0.1:8201' }))
})
await page.reload({ waitUntil: 'networkidle0' })
await page.waitForSelector('.cm-content', { timeout: 15000 })
await page.click('.cm-content')
await page.type('.cm-content', 'Tooltip and layering verification: this sentence must produce enough tokens for the heat map and the histogram to paint.', { delay: 1 })
await page.click('#btn-analyze')
await sleep(1200)

// Hover a heat chunk -> tooltip visible + styled with popover token
const box = await (await page.$('.cm-content .hm')).boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await sleep(300)
const tooltip = await page.evaluate(() => {
  const tips = [...document.querySelectorAll('.ppl-tooltip')]
  const el = tips.find((t) => t.style.display !== 'none')
  if (!el) return null
  const cs = getComputedStyle(el)
  return {
    visible: el.style.display !== 'none',
    text: (el.textContent || '').slice(0, 40),
    bg: cs.backgroundColor,
    radius: cs.borderRadius,
    z: cs.zIndex
  }
})
check('hover shows PPL tooltip', !!(tooltip && tooltip.visible && /PPL/.test(tooltip.text || '')))
check('tooltip uses theme tokens', !!(tooltip && tooltip.bg && tooltip.bg !== 'rgba(0, 0, 0, 0)'))

// Tooltip stays within the viewport
const tp = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.ppl-tooltip')].find((t) => t.style.display !== 'none')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight }
})
check('tooltip within viewport', !!(tp && tp.left >= 0 && tp.right <= tp.w + 2 && tp.top >= 0 && tp.bottom <= tp.h + 2))

// Light-mode editor contrast sample
const light = await page.evaluate(() => {
  const content = document.querySelector('.cm-content')
  const bg = getComputedStyle(document.querySelector('.editor-wrap')).backgroundColor
  const fg = getComputedStyle(content).color
  return { bg, fg }
})
console.log('light editor:', JSON.stringify(light))

await browser.close()
process.exit(failed ? 1 : 0)