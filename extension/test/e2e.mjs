// Extension e2e: load the built MV3 unpacked, open local sample pages and
// assert the annotation pipeline (background proxy -> mock service -> inline
// heat map + labels) and the floating block-detail UI (ShadowRoot + Radix
// portal, rem-trap regression on a large root font-size page).
// Prereq: mock service on :8000 (BACKEND=mock python api.py) and this static
// site on :8123 (python -m http.server 8123 --directory test/site).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../.output/chrome-mv3')
const CHROME =
  process.env.HOME + '/.cache/puppeteer/chrome/win64-143.0.7499.40/chrome-win64/chrome.exe'

let passed = 0
const failures = []
const check = (name, cond) => {
  console.log(cond ? '✓' : '✗', name)
  if (cond) passed++
  else failures.push(name)
}

/** Read the floating-block-detail card out of the extension's shadow root. */
function readDetailCard(page) {
  return page.evaluate(() => {
    const host = document.querySelector('ppl-block-detail')
    const card = host?.shadowRoot?.querySelector('[data-testid="ppl-block-detail"]')
    if (!card) return null
    return {
      text: card.textContent,
      fontSize: getComputedStyle(card).fontSize,
      width: card.getBoundingClientRect().width,
      headersPresent: !!host.shadowRoot.querySelector('[data-slot="popover-content"]'),
    }
  })
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    `--disable-extensions-except=${OUT}`,
    `--load-extension=${OUT}`,
    '--no-first-run',
    '--window-size=1280,900',
  ],
})

const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })

// ---------- Site 1: normal root font-size ----------
await page.goto('http://127.0.0.1:8123/sample.html', { waitUntil: 'networkidle0' })
await page.waitForSelector('span.ppl-tok', { timeout: 20000 })

check('heat map spans painted', (await page.$$('.ppl-tok')).length > 0)
const style = await page.$eval(
  '.ppl-tok',
  (el) => el.style.backgroundColor || el.style.borderBottom,
)
check('inline-styled (no CSS injection needed)', style.includes('rgba(') || style.includes('solid'))
const state = await page.$$eval('[data-ppl-state]', (els) =>
  els.every((el) => ['done', 'skipped'].includes(el.getAttribute('data-ppl-state'))),
)
check('blocks settled (done/skipped, none error/measuring)', state)
const finished = await page.$$eval('[data-ppl-state="done"]', (els) => els.length)
check('at least one block measured', finished > 0)
const labels = await page.$$('.ppl-label')
check('ppl labels rendered', labels.length > 0)

// Floating detail: click the first block label -> popover card appears inside
// the shadow root, correctly sized (px, not page-relative rem).
await page.click('.ppl-label')
await page.waitForFunction(
  () => {
    const host = document.querySelector('ppl-block-detail')
    return !!host?.shadowRoot?.querySelector('[data-testid="ppl-block-detail"]')
  },
  { timeout: 10000 },
)
const card1 = await readDetailCard(page)
check('detail popover opens on label click', !!card1)
check('detail shows ppl stats', !!card1 && /平均困惑度/.test(card1.text))
check('detail shows verdict badge', !!card1 && /疑似|不确定|无判定/.test(card1.text))
check('detail card text-size is 14px (text-sm, rem frozen)', !!card1 && card1.fontSize === '14px')

// Escape dismisses the popover (Radix escape key handling through the shadow root).
await page.keyboard.press('Escape')
await page.waitForFunction(
  () => {
    const host = document.querySelector('ppl-block-detail')
    return !host?.shadowRoot?.querySelector('[data-testid="ppl-block-detail"]')
  },
  { timeout: 5000 },
)
check('escape closes the detail popover', true)

// ---------- Site 2: root font-size 24px (rem-trap regression) ----------
await page.goto('http://127.0.0.1:8123/font-size.html', { waitUntil: 'networkidle0' })
await page.waitForSelector('span.ppl-tok', { timeout: 20000 })
await page.click('.ppl-label')
await page.waitForFunction(
  () => {
    const host = document.querySelector('ppl-block-detail')
    return !!host?.shadowRoot?.querySelector('[data-testid="ppl-block-detail"]')
  },
  { timeout: 10000 },
)
const card2 = await readDetailCard(page)
check('large-root page: popover opens', !!card2)
check(
  'large-root page: card text-size still 14px (rem trap fixed)',
  !!card2 && card2.fontSize === '14px',
)
check(
  'large-root page: card width identical',
  !!card1 && !!card2 && Math.abs(card2.width - card1.width) < 1,
)

await browser.close()

if (failures.length) {
  console.error('FAILED:', failures)
  process.exit(1)
}
console.log(`${passed} 项通过,0 项失败`)
