// 端到端测试：真实 Chrome + mock 后端驱动打包后的单文件应用
// 前置：node test/mock-server.mjs 8000 &；npm run build
// 用法：node test/e2e.test.mjs
import puppeteer from 'puppeteer-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const URL = 'file:///D:/Projects/editor/dist/index.html'

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

await page.goto(URL, { waitUntil: 'networkidle0' })
await page.waitForSelector('.cm-content', { timeout: 10000 })

const $ = (sel) => page.$(sel)
const text = (sel) => page.$eval(sel, (el) => el.textContent)
const evalFn = (fn, ...args) => page.evaluate(fn, ...args)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- 基础渲染 ----------
check('工具栏/编辑器/直方图/状态栏渲染', await evalFn(() =>
  !!(document.querySelector('.toolbar') && document.querySelector('.cm-editor') &&
     document.querySelector('#histogram') && document.querySelector('.statusbar'))))
check('内置预设已注入（中文预设/英文预设）', await evalFn(() => {
  const opts = [...document.querySelectorAll('#sel-preset option')].map((o) => o.value)
  return opts.includes('中文预设') && opts.includes('英文预设')
}))
check('后端在线（mock /health）', (await text('#st-backend')).includes('在线'))

// ---------- 输入文本 ----------
await page.click('.cm-content')
await page.type('.cm-content', '你好世界，这是一个测试。Hello world')
check('字符数实时更新', (await text('#st-chars')).includes('字符 23'))

// ---------- 分析 ----------
await page.click('#btn-analyze')
await page.waitForFunction(
  () => /Token \d+/.test(document.querySelector('#st-tokens').textContent),
  { timeout: 15000 }
)
const tokCount = await text('#st-tokens')
check('Token 数随分析更新', /Token \d+/.test(tokCount) && !tokCount.includes('—'))
check('耗时显示', (await text('#st-elapsed')).includes('ms'))
check('后端状态仍在线', (await text('#st-backend')).includes('在线'))
check('平均 NLL 显示', !(await text('#st-nll')).includes('—'))
check('覆盖率 100%', (await text('#st-cov')).includes('100%'))

// 热力图着色：句子模式（默认）下应存在带背景色的 .hm
const coloredCount = await evalFn(() =>
  [...document.querySelectorAll('.cm-content .hm')].filter((el) =>
    /background-color: rgba\((?!138)/.test(el.getAttribute('style') || '')).length)
check('分析后出现彩色热力块', coloredCount > 0)

// ---------- 悬停提示 ----------
const box = await (await $('.cm-content .hm')).boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await sleep(200)
const tipVisible = await evalFn(() => {
  const t = [...document.querySelectorAll('.ppl-tooltip')].find((t) => t.style.display !== 'none')
  return t ? t.textContent : null
})
check('悬停显示 PPL 提示', !!tipVisible && tipVisible.includes('PPL'))
check('悬停提示含分块类型', !!tipVisible && (tipVisible.includes('句子') || tipVisible.includes('Token')))

// ---------- 编辑弄脏 token（需求 6 场景） ----------
// 在文档开头插入前缀：原有测量应保持（不脏），新文字为灰
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
check('字符数更新为 20', (await text('#st-chars')).includes('字符 20'))

// ---------- 选区平均 PPL（需求 4/13） ----------
await page.keyboard.down('Control')
await page.keyboard.press('End')
await page.keyboard.up('Control')
await page.keyboard.down('Shift')
for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft')
await page.keyboard.up('Shift')
await sleep(200)
const selTip = await evalFn(() => {
  const t = [...document.querySelectorAll('.ppl-tooltip')].find((t) => t.style.display !== 'none')
  return t ? t.textContent : null
})
check('选区显示平均 PPL 提示', !!selTip && selTip.includes('选区'))

// ---------- 忽略清单（需求 14） ----------
await page.click('#btn-ignore')
await sleep(200)
check('忽略计数为 1', (await text('#ignore-count')) === '1')
check('忽略后覆盖率下降', !(await text('#st-cov')).includes('100%'))
// 打开忽略清单弹窗
await page.click('#btn-ignore-list')
await sleep(200)
const ignoreRows = await evalFn(() => document.querySelectorAll('.ignore-row').length)
check('忽略清单弹窗有条目', ignoreRows === 1)
await page.click('.ignore-row button') // 移除
await sleep(100)
await page.click('.modal-close')
await sleep(100)
check('移除忽略后计数归零', (await text('#ignore-count')) === '0')

// ---------- 撤销/重做（需求 11） ----------
const before = await evalFn(() => document.querySelector('.cm-content').textContent)
await page.click('#btn-undo')
await page.click('#btn-undo')
const after = await evalFn(() => document.querySelector('.cm-content').textContent)
check('撤销改变文档内容', before !== after)
await page.click('#btn-redo')

// ---------- Token 模式 + 分层显示（需求 5） ----------
await page.select('#sel-mode', 'token')
await sleep(300)
const winLabel0 = await text('#window-label')
check('分层窗口默认 0-100%', winLabel0.includes('0%–100%'))
await page.click('#btn-win-up') // 从全量收缩到 [0,10]
await sleep(300)
check('上移窗口后显示 0%–10%', (await text('#window-label')).includes('0%–10%'))
await page.click('#btn-win-top') // 最高 10%
await sleep(300)
check('最高 10% → 90%–100%', (await text('#window-label')).includes('90%–100%'))
const hiddenTokens = await evalFn(() => {
  // 分层后：无背景/无下划线装饰但有 token 文本区域存在
  const els = [...document.querySelectorAll('.cm-content .hm')]
  return els.length
})
check('Token 模式分层后仍有装饰块', hiddenTokens > 0)
// 直方图 brush 模拟：拖选左半区
const hg = await (await $('#histogram')).boundingBox()
await page.mouse.move(hg.x + hg.width * 0.2, hg.y + hg.height / 2)
await page.mouse.down()
await page.mouse.move(hg.x + hg.width * 0.5, hg.y + hg.height / 2, { steps: 5 })
await page.mouse.up()
await sleep(300)
const winAfterBrush = await text('#window-label')
check('直方图 brush 改变窗口', !winAfterBrush.includes('0%–100%') && /窗口 \d+%–\d+%/.test(winAfterBrush))
await page.click('#btn-win-all')

// ---------- 保存预设（需求 12） ----------
await page.click('#btn-save-preset')
await page.type('#preset-name', 'e2e测试方案')
await page.click('#do-save')
await sleep(200)
check('新预设保存并出现在下拉中', await evalFn(() =>
  [...document.querySelectorAll('#sel-preset option')].some((o) => o.value === 'e2e测试方案')))

// ---------- 设置弹窗 ----------
await page.click('#btn-settings')
await sleep(200)
check('设置弹窗含颜色节点编辑', await evalFn(() => document.querySelectorAll('.stop-row').length === 4))
await page.click('.modal-close')

// ---------- 截图 ----------
await page.select('#sel-mode', 'sentence')
await sleep(300)
await page.screenshot({ path: 'test/e2e-screenshot.png' })

console.log(`\n${passed} 项通过，${failures.length} 项失败`)
if (failures.length) {
  console.log('失败项：\n - ' + failures.join('\n - '))
  process.exitCode = 1
}
await browser.close()
