// Extension e2e: load the built MV3 unpacked, open a local sample page and
// assert the annotation pipeline (background proxy -> mock service -> inline
// heat map + labels) paints the page.
// Prereq: mock service on :8000 (BACKEND=mock python api.py) and this static
// site on :8123 (python -m http.server 8123 --directory test/site).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../.output/chrome-mv3')
const CHROME = process.env.HOME + '/.cache/puppeteer/chrome/win64-143.0.7499.40/chrome-win64/chrome.exe'

let passed = 0
const failures = []
const check = (name, cond) => {
  console.log(cond ? '✓' : '✗', name)
  if (cond) passed++
  else failures.push(name)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    `--disable-extensions-except=${OUT}`,
    `--load-extension=${OUT}`,
    '--no-first-run',
    '--window-size=1280,900'
  ]
})

const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })

// Give the background/content scripts a moment after load.
await page.goto('http://127.0.0.1:8123/sample.html', { waitUntil: 'networkidle0' })
await page.waitForSelector('span.ppl-tok', { timeout: 20000 })

check('heat map spans painted', (await page.$$('.ppl-tok')).length > 0)
const style = await page.$eval('.ppl-tok', (el) => el.style.backgroundColor || el.style.borderBottom)
check('inline-styled (no CSS injection needed)', style.includes('rgba(') || style.includes('solid'))
const state = await page.$$eval('[data-ppl-state]', (els) =>
  els.every((el) => ['done', 'skipped'].includes(el.getAttribute('data-ppl-state')))
)
check('blocks settled (done/skipped, none error/measuring)', state)
const finished = await page.$$eval('[data-ppl-state="done"]', (els) => els.length)
check('at least one block measured', finished > 0)
const labels = await page.$$('.ppl-label')
check('ppl labels rendered', labels.length > 0)

await browser.close()

if (failures.length) {
  console.error('FAILED:', failures)
  process.exit(1)
}
console.log(`${passed} 项通过,0 项失败`)
