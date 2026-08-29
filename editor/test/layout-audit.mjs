// Layout audit: verifies the header/toolbar fit and no element misbehaves
// (zero size, off-screen, overflow) at common viewport widths.
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
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

for (const width of [1440, 1280, 1024]) {
  await page.setViewport({ width, height: 900 })
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await page.evaluate(() => {
    localStorage.setItem('ppl-editor.settings.v1', JSON.stringify({ serverUrl: 'http://127.0.0.1:8201' }))
  })
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.cm-content', { timeout: 15000 })

  const audit = await page.evaluate(() => {
    const out = {}
    const header = document.querySelector('header')
    if (header) {
      out.headerScrollW = header.scrollWidth
      out.headerClientW = header.clientWidth
      out.headerOverflow = header.scrollWidth > header.clientWidth + 2
    }
    const editorWrap = document.querySelector('.editor-wrap')
    if (editorWrap) {
      out.editorH = editorWrap.getBoundingClientRect().height
      out.editorW = editorWrap.getBoundingClientRect().width
    }
    const analyze = document.querySelector('#btn-analyze')
    if (analyze) {
      const r = analyze.getBoundingClientRect()
      out.analyzeRight = Math.round(r.right)
    }
    const svg = document.querySelector('#histogram')
    if (svg) out.histoH = svg.getBoundingClientRect().height
    // any fixed-position element reaching past the right edge?
    out.offRight = [...document.querySelectorAll('body *')].filter((el) => {
      const s = getComputedStyle(el)
      if (s.position !== 'fixed') return false
      const r = el.getBoundingClientRect()
      return r.left > innerWidth || r.right > innerWidth + 2 || r.bottom > innerHeight + 2
    }).slice(0, 6).map((el) => el.className || el.tagName)
    // invisible-too-small interactive elements
    out.tinyButtons = [...document.querySelectorAll('button')].filter((b) => {
      const r = b.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && (r.width < 16 || r.height < 16)
    }).length
    return out
  })
  console.log(`width=${width}`, JSON.stringify(audit))
}

console.log('errors:', errors.length ? errors.slice(0, 10) : 'none')
await browser.close()