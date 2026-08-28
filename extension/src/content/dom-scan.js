// src/content/dom-scan.js
// 文本块检测与纯文本抽取。仿翻译插件启发式。
(function (root) {
  "use strict";

  const BLOCK_TAGS_ARTICLE = new Set([
    "P", "LI", "H1", "H2", "H3", "H4", "H5", "H6",
    "BLOCKQUOTE", "DD", "DT", "FIGCAPTION", "TD", "TH", "CAPTION"
  ]);
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "OBJECT", "SVG", "CANVAS",
    "BUTTON", "INPUT", "TEXTAREA", "SELECT", "OPTION",
    "NAV", "HEADER", "FOOTER", "ASIDE"
  ]);
  const STATE_ATTR = "data-ppl-state";

  function isHidden(el) {
    if (!el || el.nodeType !== 1) return true;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return true;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return true;
    return false;
  }

  function shouldSkip(el) {
    if (!el || el.nodeType !== 1) return false;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.isContentEditable) return true;
    if (el.getAttribute("role") === "navigation") return true;
    if (el.closest && el.closest("[contenteditable=true]")) return true;
    return false;
  }

  // 块内是否有「直系」文本（非全为子元素包裹）
  function directTextLength(el) {
    let n = 0;
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) n += (c.nodeValue || "").trim().length;
    }
    return n;
  }

  function isCandidate(el, mode) {
    if (isHidden(el) || shouldSkip(el)) return false;
    if (BLOCK_TAGS_ARTICLE.has(el.tagName)) return true;
    if (mode === "all") {
      // div/span 含直系文本
      if ((el.tagName === "DIV" || el.tagName === "SPAN" || el.tagName === "SECTION") && directTextLength(el) >= 4) {
        return true;
      }
    }
    return false;
  }

  // 遍历元素文本节点，构造扁平文本与「字符索引 -> (文本节点, 本地偏移)」映射。
  // 以此作为发送给 API 与着色回填的共同基准，避免 innerText/归一化不一致。
  // 仅压缩连续空白为单空格（保留可读性，不影响 token 偏移对齐）。
  function getFlatText(el) {
    const textParts = [];
    const nodes = []; // {node, start, end, rawMap}
    let pos = 0;
    let lastWasSpace = false;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n = walker.nextNode();
    while (n) {
      const raw = n.nodeValue || "";
      if (!raw.length) {
        n = walker.nextNode();
        continue;
      }
      // 压缩连续空白为单空格；rawMap 记录每个压缩字符对应的原始偏移，用于回填切片
      let local = "";
      const rawMap = [];
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (/\s/.test(ch)) {
          if (!lastWasSpace) {
            local += " ";
            rawMap.push(i);
            lastWasSpace = true;
          }
        } else {
          local += ch;
          rawMap.push(i);
          lastWasSpace = false;
        }
      }
      if (local.length) {
        const start = pos;
        textParts.push(local);
        pos += local.length;
        nodes.push({ node: n, start, end: pos, rawMap });
      }
      n = walker.nextNode();
    }
    const text = textParts.join("");
    return { text, nodes };
  }

  function extractText(el) {
    return getFlatText(el).text;
  }

  function charCount(text) {
    return text.length;
  }

  function wordCount(text) {
    const m = text.match(/\S+/g);
    return m ? m.length : 0;
  }

  // 扫描文档，返回候选块元素列表（按文档顺序，去重）
  function scan(root, settings) {
    const mode = settings.textBlockMode || "article";
    const minChars = settings.minParagraphChars || 0;
    const maxBlocks = settings.maxBlocksPerPage || 2000;
    root = root || document.body;
    if (!root) return [];
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (shouldSkip(node)) return NodeFilter.FILTER_REJECT;
        if (isCandidate(node, mode)) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
    });
    const seen = new Set();
    let n = 0;
    let cur = walker.nextNode();
    while (cur && n < maxBlocks) {
      if (!seen.has(cur) && cur.getAttribute(STATE_ATTR) !== "done" && cur.getAttribute(STATE_ATTR) !== "measuring") {
        const text = extractText(cur);
        if (charCount(text) >= Math.max(1, minChars)) {
          seen.add(cur);
          out.push({ el: cur, text });
          n++;
        } else {
          // 标记过短，避免重复处理
          cur.setAttribute(STATE_ATTR, "skipped");
        }
      }
      cur = walker.nextNode();
    }
    return out;
  }

  // 将相邻短块合并为测量单元。返回单元数组：{ blocks:[{el,text}], text, offsets:[{start,end}] }
  function groupUnits(candidates, settings) {
    if (!settings.mergeAdjacentShortParagraphs) {
      return candidates.map((c) => ({
        blocks: [{ el: c.el, text: c.text }],
        text: c.text,
        offsets: [{ start: 0, end: c.text.length }]
      }));
    }
    const gap = settings.mergeMaxGapChars || 60;
    const units = [];
    let cur = null;
    for (const c of candidates) {
      const short = c.text.length <= gap;
      if (short && cur && cur.text.length + c.text.length + 1 <= (settings.maxCharsPerRequest || 1500)) {
        const start = cur.text.length + 1;
        cur.text = cur.text + "\n" + c.text;
        cur.blocks.push({ el: c.el, text: c.text });
        cur.offsets.push({ start, end: cur.text.length });
      } else {
        if (cur) units.push(cur);
        cur = {
          blocks: [{ el: c.el, text: c.text }],
          text: c.text,
          offsets: [{ start: 0, end: c.text.length }]
        };
      }
    }
    if (cur) units.push(cur);
    return units;
  }

  function setState(el, state) {
    if (el && el.setAttribute) el.setAttribute(STATE_ATTR, state);
  }
  function getState(el) {
    return el && el.getAttribute ? el.getAttribute(STATE_ATTR) : null;
  }

  root.domScan = {
    scan,
    groupUnits,
    extractText,
    getFlatText,
    charCount,
    wordCount,
    setState,
    getState,
    STATE_ATTR
  };
})(window.PPLExt || (window.PPLExt = {}));
