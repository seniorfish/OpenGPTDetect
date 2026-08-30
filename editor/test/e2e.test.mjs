// End-to-end test: real Chrome + mock backend driving the built single-file app
// Prereq: start the Python mock under server/ (full contract, no model):
//   conda activate xpu && BACKEND=mock python api.py &
// Then npm run build
// Usage: node test/e2e.test.mjs
// This drives the React build; palette-triggered flows (ignore, save preset)
// go through the Ctrl+K command registry like a real user.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const URL = 'file:///' + path.resolve(__dirname, '../dist/index.html').replace(/\\/g, '/')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

let passed = 0
const failures = []
function check(name, cond) {
  if (cond) {
    passed++
    console.log('✓', name)
  } else {
    failures.push(name)
    console.log('✗', name)
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-first-run', '--window-size=1280,900', '--allow-file-access-from-files']
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
page.on('pageerror', (e) => {
  failures.push('pageerror: ' + e.message)
  console.log('PAGE ERROR:', e.message)
})

// Force a Chinese browser locale so locale auto-detection picks zh and the
// zh-based assertions below hold regardless of the host's default language.
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'language', { get: () => 'zh-CN' })
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] })
})

await page.goto(URL, { waitUntil: 'networkidle0' })
await page.waitForSelector('.cm-content', { timeout: 10000 })

const $ = (sel) => page.$(sel)
const text = (sel) => page.$eval(sel, (el) => el.textContent)
const evalFn = (fn, ...args) => page.evaluate(fn, ...args)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- Basic rendering ----------
check('工具栏/编辑器/直方图/状态栏渲染', await evalFn(() =>
  !!(document.querySelector('header') && document.querySelector('.cm-editor') &&
     document.querySelector('#histogram') && document.querySelector('footer'))))
check('后端在线（mock /health）', (await text('#st-backend')).includes('在线'))

// ---------- Text input ----------
await page.click('.cm-content')
await page.type('.cm-content', '你好世界，这是一个测试。Hello world')
await sleep(300)
check('字符数实时更新', (await text('#st-chars')).includes('23 字符'))

// ---------- Analysis ----------
await sleep(300)
await page.click('#btn-analyze')
await sleep(5000)
const postAnalyze = await evalFn(() => ({
  tokens: document.querySelector('#st-tokens')?.textContent ?? null,
  backend: document.querySelector('#st-backend')?.textContent ?? null,
  nll: document.querySelector('#st-nll')?.textContent ?? null,
  colored: [...document.querySelectorAll('.cm-content .hm')].length
}))
console.log('POST-ANALYZE', JSON.stringify(postAnalyze))
const tokCount = postAnalyze.tokens
check('Token 数随分析更新', /\d+ Token/.test(tokCount) && !tokCount.includes('—'))
check('耗时显示', (await text('#st-elapsed')).includes('ms'))
check('后端状态仍在线', (await text('#st-backend')).includes('在线'))
check('平均 NLL 显示', !(await text('#st-nll')).includes('—'))
check('覆盖率 100%', (await text('#st-cov')).includes('100%'))

// Heat-map colors: colored .hm elements must exist in sentence mode (default)
const coloredCount = await evalFn(() =>
  [...document.querySelectorAll('.cm-content .hm')].filter((el) =>
    /background-color: rgba\((?!138)/.test(el.getAttribute('style') || '')).length)
check('分析后出现彩色热力块', coloredCount > 0)

// ---------- Hover tooltip ----------
const box = await (await $('.cm-content .hm')).boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await sleep(200)
const tipVisible = await evalFn(() => {
  const t = [...document.querySelectorAll('.ppl-tooltip')].find((t) => t.style.display !== 'none')
  return t ? t.textContent : null
})
check('悬停显示 PPL 提示', !!tipVisible && tipVisible.includes('PPL'))
check('悬停提示含分块类型', !!tipVisible && (tipVisible.includes('句子') || tipVisible.includes('Token')))

// ---------- Editing dirties tokens (requirement 6 scenario) ----------
await page.keyboard.down('Control')
await page.keyboard.press('Home')
await page.keyboard.up('Control')
await page.type('.cm-content', '前缀，')
await sleep(300)
const grayInfo = await evalFn(() => {
  const els = [...document.querySelectorAll('.cm-content .hm')]
  const gray = els.filter((el) => (el.getAttribute('style') || '').includes('138, 138, 138')).length
  const colored = els.filter((el) => /background-color: rgba\((?!138)/.test(el.getAttribute('style') || '')).length
  return { total: els.length, gray, colored }
})
check('插入前缀后：新文字为灰色', grayInfo.gray > 0)
check('插入前缀后：原测量保持彩色（未被弄脏）', grayInfo.colored > 0)
check('字符数更新为 26', (await text('#st-chars')).includes('26 字符'))

// ---------- Ignore list via the command palette (requirement 14) ----------
await page.keyboard.down('Control')
await page.keyboard.press('End')
await page.keyboard.up('Control')
await page.keyboard.down('Shift')
await page.keyboard.press('ArrowLeft')
await page.keyboard.press('ArrowLeft')
await page.keyboard.press('ArrowLeft')
await page.keyboard.up('Shift')
// Open palette (Ctrl+K) and run "忽略选区"
await page.keyboard.down('Control')
await page.keyboard.press('k')
await page.keyboard.up('Control')
await sleep(250)
await page.keyboard.type('忽略选区')
await sleep(250)
await page.keyboard.press('Enter')
await sleep(300)
check('忽略计数为 1', (await text('#ignore-count')) === '1')
check('忽略后覆盖率下降', !(await text('#st-cov')).includes('100%'))
// The ignored ranges are managed inline in the header Ignore menu.
const ignoreTrig = await evalFn(() => {
  const svg = document.querySelector('svg.lucide-list-filter')
  const btn = svg.closest('button')
  const r = btn.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
await page.mouse.click(ignoreTrig.x, ignoreTrig.y)
await sleep(300)
check('忽略菜单内列出被忽略区间', await evalFn(() => document.querySelectorAll('.ignore-row').length === 1))
await page.click('.ignore-row button') // inline remove
await sleep(250)
check('移除忽略后计数归零', !(await $('#ignore-count')))
await page.keyboard.press('Escape')
await sleep(150)

// ---------- Token mode + layered display (requirement 5) ----------
await evalFn(() => {
  const item = [...document.querySelectorAll('[data-slot=toggle-group-item]')].find((el) => el.textContent.includes('Token'))
  item.click()
})
await sleep(300)
const winLabel0 = await text('#window-label')
check('分层窗口默认 0-100%', winLabel0.includes('0%–100%'))
await page.click('#btn-win-up') // shrink from full range to [0,10]
await sleep(300)
check('上移窗口后显示 0%–10%', (await text('#window-label')).includes('0%–10%'))
await page.click('#btn-win-top') // highest 10%
await sleep(300)
check('最高 10% → 90%–100%', (await text('#window-label')).includes('90%–100%'))
const hiddenTokens = await evalFn(() => {
  // after layering: no background/underline decorations, but token text regions exist
  const els = [...document.querySelectorAll('.cm-content .hm')]
  return els.length
})
check('Token 模式分层后仍有装饰块', hiddenTokens > 0)

// ---------- Save preset via the palette (requirement 12) ----------
await page.keyboard.down('Control')
await page.keyboard.press('k')
await page.keyboard.up('Control')
await sleep(250)
await page.keyboard.type('保存为方案')
await sleep(250)
await page.keyboard.press('Enter')
await sleep(250)
await page.type('#preset-name', 'e2e测试方案')
await page.click('#do-save')
await sleep(300)
// The fresh preset is now a loadable command in the palette.
await page.keyboard.down('Control')
await page.keyboard.press('k')
await page.keyboard.up('Control')
await sleep(250)
await page.keyboard.type('载入方案「e2e测试方案」')
await sleep(250)
check('新预设保存并出现在命令面板', await evalFn(() =>
  [...document.querySelectorAll('[cmdk-item], .cmdk-item')].some((el) => el.textContent.includes('e2e测试方案'))))
await page.keyboard.press('Escape')
await sleep(150)

// ---------- Settings modal ----------
await page.click('#btn-settings')
await sleep(250)
check('设置弹窗含颜色节点编辑', await evalFn(() => document.querySelectorAll('.stop-row').length === 4))
// Profile import/export entry (S7).
check('设置弹窗含导入导出按钮', await evalFn(() => !!document.querySelector('#profile-export') && !!document.querySelector('#profile-import')))
await page.click('#profile-export')
await sleep(250)
check('导出对话框可打开', await evalFn(() => !!document.querySelector('[data-slot=dialog-content]')))
await page.keyboard.press('Escape')
await sleep(150)
await page.click('.modal-close')
await sleep(150)

// ---------- Screenshot ----------
await evalFn(() => {
  const item = [...document.querySelectorAll('[data-slot=toggle-group-item]')].find((el) => el.textContent.includes('句子'))
  item.click()
})
await sleep(300)
await page.screenshot({ path: 'test/e2e-screenshot.png' })

console.log(`\n${passed} 项通过，${failures.length} 项失败`)
if (failures.length) {
  console.log('失败项：\n - ' + failures.join('\n - '))
  process.exitCode = 1
}
await browser.close()