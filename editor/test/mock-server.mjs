// 模拟 PPL 后端：GET /health、POST /ppl（确定性伪随机 nll）
// 用法：node test/mock-server.mjs [port]
import http from 'node:http'

const PORT = Number(process.argv[2]) || 8000

// 分词：汉字逐字、非空白的非汉字连续成词、空白连续成词
function tokenize(text) {
  const re = /[\u4e00-\u9fff]|[^\s\u4e00-\u9fff]+|\s+/gu
  const tokens = []
  let m
  while ((m = re.exec(text))) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length })
  }
  return tokens
}

function pseudoNll(tokText, i) {
  // 确定性伪随机：ppl 落在 1.5 ~ 130
  let h = 2166136261
  for (let k = 0; k < tokText.length; k++) {
    h ^= tokText.charCodeAt(k)
    h = Math.imul(h, 16777619)
  }
  h = (h >>> 0) + i * 7919
  const ppl = 1.5 + ((h % 1000) / 1000) * 128.5
  return Math.log(ppl)
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({
      status: 'ok', model: 'Mock-1B', n_ctx: 2048, max_char_count: 2200,
      n_vocab: 151936, nll_backend: 'mock'
    }))
  }
  if (req.method === 'POST' && req.url === '/ppl') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const { text } = JSON.parse(body || '{}')
      if (!text || !text.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ detail: '文本为空' }))
      }
      const toks = tokenize(text)
      let sum = 0
      const details = toks.map((t, i) => {
        const nll = i === 0 ? null : pseudoNll(t.text, i)
        if (nll != null) sum += nll
        return {
          token_index: i, token_id: i, token_text: t.text,
          nll, ppl: nll == null ? null : Math.exp(nll),
          char_start: t.start, char_end: t.end
        }
      })
      const avgNll = toks.length > 1 ? sum / (toks.length - 1) : 0
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        average_ppl: Math.exp(avgNll), average_nll: avgNll,
        token_count: toks.length, char_count: [...text].length,
        token_details: details
      }))
    })
    return
  }
  res.writeHead(404)
  res.end()
})

server.listen(PORT, () => console.log(`mock ppl server on :${PORT}`))
