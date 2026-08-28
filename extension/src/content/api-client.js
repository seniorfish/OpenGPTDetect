// src/content/api-client.js
// 语言判定、按句切分、请求编排（经 background 中转）、token 合并与 avg_ppl 重算。
(function (root) {
  "use strict";

  // 英文字符占比 >= 阈值 => 英文段
  function detectLang(text, threshold) {
    const letters = text.replace(/\s/g, "");
    if (!letters.length) return "zh";
    const en = (letters.match(/[A-Za-z]/g) || []).length;
    return en / letters.length >= threshold ? "en" : "zh";
  }

  // 按句界切分，保证每块 <= maxChars，尽量不拆句。
  // 返回 [{text, start}]，text 为原 text 的连续子串（保留边界空白以保证偏移精确对齐），
  // start 为该子串在原 text 中的起始偏移。发送给 API 的就是 text，故 API 返回的 token
  // char_start/end 加上 start 即得相对原 text 的偏移。
  function splitChunks(text, maxChars, lang) {
    if (text.length <= maxChars) return [{ text, start: 0 }];
    const sepRe = lang === "en" ? /[.!?;]\s+|\n+/g : /[。！？；!?]\n?|\n+/g;
    // 收集句末边界位置（分隔符结束后的 index）
    const bounds = [];
    let m;
    sepRe.lastIndex = 0;
    while ((m = sepRe.exec(text))) {
      bounds.push(sepRe.lastIndex);
      if (sepRe.lastIndex === m.index) sepRe.lastIndex++; // 防零宽
    }
    bounds.push(text.length);

    const out = [];
    let pos = 0;
    let bi = 0;
    while (pos < text.length) {
      // 找最远的句末边界 e 使得 e - pos <= maxChars
      let e = -1;
      while (bi < bounds.length && bounds[bi] - pos <= maxChars) {
        e = bounds[bi];
        bi++;
      }
      if (e <= pos) {
        // 单句超长：硬切
        e = pos + maxChars;
        // 回退 bi 到第一个 > e 的边界
        while (bi > 0 && bounds[bi - 1] > e) bi--;
      }
      out.push({ text: text.slice(pos, e), start: pos });
      pos = e;
    }
    return out;
  }

  function sendPpl(baseUrl, text) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "ppl", baseUrl, text },
        (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(resp || { ok: false, error: "no-response" });
          }
        }
      );
    });
  }

  // 测量一个单元（text 为合并后的完整文本）。返回合并结果。
  // result: { lang, avgPpl, avgNll, tokenCount, charCount, tokens:[{token_index,token_text,nll,ppl,char_start,char_end}] }
  // tokens 的 char_start/end 相对单元 text。
  async function measureUnit(text, settings) {
    const lang = detectLang(text, settings.englishCharRatioThreshold);
    const maxChars = settings.maxCharsPerRequest || 1500;
    const chunks = splitChunks(text, maxChars, lang);

    const allTokens = [];
    let offset = 0;
    let nValid = 0;
    let sumNll = 0;
    let tokenIndex = 0;
    let lastErr = null;

    for (const chunk of chunks) {
      const base = chunk.start; // 该段在原 text 中的精确起始偏移
      const resp = await sendPpl(settings.apiBaseUrl, chunk.text);
      if (!resp || !resp.ok) {
        lastErr = (resp && resp.error) || "unknown";
        // OOM 时减半重试一次
        if (resp && resp.status === 500 && chunk.text.length > 200) {
          const half = Math.ceil(chunk.text.length / 2);
          for (let i = 0; i < chunk.text.length; i += half) {
            const piece = chunk.text.slice(i, i + half);
            if (!piece.trim()) continue;
            const pieceBase = base + i;
            const r2 = await sendPpl(settings.apiBaseUrl, piece);
            if (r2 && r2.ok && r2.data) {
              for (const t of r2.data.token_details || []) {
                allTokens.push({
                  token_index: tokenIndex++,
                  token_text: t.token_text,
                  nll: t.nll,
                  ppl: t.ppl,
                  char_start: t.char_start == null ? null : t.char_start + pieceBase,
                  char_end: t.char_end == null ? null : t.char_end + pieceBase
                });
                if (t.nll != null) {
                  nValid++;
                  sumNll += t.nll;
                }
              }
            } else {
              lastErr = "oom-retry-failed";
            }
          }
        }
        offset = base + chunk.text.length;
        continue;
      }
      const data = resp.data;
      for (const t of data.token_details || []) {
        allTokens.push({
          token_index: tokenIndex++,
          token_text: t.token_text,
          nll: t.nll,
          ppl: t.ppl,
          char_start: t.char_start == null ? null : t.char_start + base,
          char_end: t.char_end == null ? null : t.char_end + base
        });
        if (t.nll != null) {
          nValid++;
          sumNll += t.nll;
        }
      }
      offset = base + chunk.length;
    }

    if (!allTokens.length) {
      return { lang, avgPpl: null, avgNll: null, tokenCount: 0, charCount: text.length, tokens: [], error: lastErr };
    }
    const avgNll = nValid ? sumNll / nValid : null;
    const avgPpl = avgNll != null ? Math.exp(avgNll) : null;
    return { lang, avgPpl, avgNll, tokenCount: allTokens.length, charCount: text.length, tokens: allTokens, error: null };
  }

  root.apiClient = { detectLang, splitChunks, measureUnit, sendPpl };
})(window.PPLExt || (window.PPLExt = {}));
