// src/content/heatmap.js
// ppl -> 颜色插值、平滑（token 窗口 / 句子）、按字符区间包裹 span 着色。
(function (root) {
  "use strict";

  function hexToRgb(hex) {
    let h = (hex || "").replace("#", "").trim();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    if (isNaN(n) || h.length !== 6) return [128, 128, 128];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(rgb) {
    return (
      "#" +
      rgb
        .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
        .join("")
    );
  }

  // 在锚点间线性插值，返回 [r,g,b]
  function pplToRgb(ppl, scale) {
    if (ppl == null || !scale || !scale.length) return [180, 180, 180];
    const s = scale.slice().sort((a, b) => a.ppl - b.ppl);
    if (ppl <= s[0].ppl) return hexToRgb(s[0].color);
    if (ppl >= s[s.length - 1].ppl) return hexToRgb(s[s.length - 1].color);
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i];
      const b = s[i + 1];
      if (ppl >= a.ppl && ppl <= b.ppl) {
        const t = (ppl - a.ppl) / (b.ppl - a.ppl || 1);
        const ca = hexToRgb(a.color);
        const cb = hexToRgb(b.color);
        return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
      }
    }
    return hexToRgb(s[s.length - 1].color);
  }

  function rgba(rgb, opacity) {
    return `rgba(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])},${opacity})`;
  }

  // 计算每个 token 的平滑 ppl
  function smoothTokens(tokens, mode, windowSize) {
    const out = new Array(tokens.length).fill(null);
    const ppls = tokens.map((t) => (t && t.ppl != null ? t.ppl : null));

    if (mode === "sentence") {
      // 由 token_text 的句界切分句子（简易）
      let curStart = 0;
      const groups = [];
      for (let i = 0; i < tokens.length; i++) {
        const txt = tokens[i].token_text || "";
        if (/[。！？!?;\n]/.test(txt)) {
          groups.push([curStart, i]);
          curStart = i + 1;
        }
      }
      if (curStart <= tokens.length - 1) groups.push([curStart, tokens.length - 1]);
      if (!groups.length) groups.push([0, tokens.length - 1]);
      for (const [s, e] of groups) {
        const vals = [];
        for (let i = s; i <= e; i++) if (ppls[i] != null) vals.push(ppls[i]);
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        for (let i = s; i <= e; i++) out[i] = avg;
      }
      return out;
    }

    // token 窗口（居中）
    const w = Math.max(1, windowSize | 0);
    const half = Math.floor((w - 1) / 2);
    for (let i = 0; i < tokens.length; i++) {
      const vals = [];
      for (let j = i - half; j <= i + (w - 1 - half); j++) {
        if (j >= 0 && j < tokens.length && ppls[j] != null) vals.push(ppls[j]);
      }
      out[i] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    return out;
  }

  // 在 blockEl 内对 local 范围 [a,b) 着色。chars 为整块 per-char 颜色数组（null 表示不着色）。
  // nodes: getFlatText 返回的节点映射（start/end 相对 blockFlat）。
  // 在 blockEl 内按 per-char 颜色数组 chars（下标=块扁平文本索引）着色。
  // nodes: getFlatText 返回的节点映射，每个含 start/end（块扁平索引）与 rawMap（压缩字符 -> 原始偏移）。
  function wrapRanges(blockEl, blockLen, chars, nodes) {
    for (const nd of nodes) {
      const ns = nd.start;
      const ne = nd.end;
      if (ne <= ns || ns >= blockLen || ne <= 0) continue;
      const segStart = Math.max(0, ns);
      const segEnd = Math.min(blockLen, ne);
      if (segStart >= segEnd) continue;

      // 将节点拆为「同色段」，并用 rawMap 把扁平索引换算回原始文本偏移
      const segments = []; // {color, rawStart, rawEnd}
      let i = segStart;
      while (i < segEnd) {
        const col = chars[i] || null;
        let j = i + 1;
        while (j < segEnd && (chars[j] || null) === col) j++;
        // i..j 为本段扁平索引（半开），对应本节点内本地索引 i-ns .. j-ns
        const localStart = i - ns;
        const localEnd = j - ns;
        const rawStart = nd.rawMap[localStart];
        // 段末对应的原始偏移：取本段最后一个压缩字符的原始偏移 +1，或下一段起点
        const rawEnd =
          localEnd < nd.rawMap.length
            ? nd.rawMap[localEnd]
            : (nd.node.nodeValue || "").length;
        segments.push({ color: col, rawStart, rawEnd });
        i = j;
      }
      if (!segments.length) continue;

      const frag = document.createDocumentFragment();
      const raw = nd.node.nodeValue || "";
      for (const seg of segments) {
        const text = raw.slice(seg.rawStart, seg.rawEnd);
        if (seg.color == null) {
          frag.appendChild(document.createTextNode(text));
        } else {
          const span = document.createElement("span");
          span.className = "ppl-tok";
          span.style.backgroundColor = seg.color;
          span.style.borderBottomColor = seg.color;
          span.style.textDecorationColor = seg.color;
          span.textContent = text;
          frag.appendChild(span);
        }
      }
      const parent = nd.node.parentNode;
      if (parent) parent.replaceChild(frag, nd.node);
    }
  }

  // 渲染一个块。
  // unitTokens: 相对单元文本的 token；blockOffset: 该块在单元文本中的起始偏移；blockLen: 块文本长度。
  function renderBlock(blockEl, blockFlat, blockNodes, unitTokens, blockOffset, blockLen, settings, lang) {
    if (!settings.heatmapEnabled) return;
    const scale = lang === "en" ? settings.colorScaleEn : settings.colorScaleZh;
    const opacity = settings.heatmapOpacity != null ? settings.heatmapOpacity : 0.35;

    // 取出属于本块的 token，并将 char 范围转为块内 local 索引
    const localTokens = [];
    for (const t of unitTokens) {
      if (t.char_start == null || t.char_end == null) continue;
      const a = t.char_start - blockOffset;
      const b = t.char_end - blockOffset;
      const a2 = Math.max(0, a);
      const b2 = Math.min(blockLen, b);
      if (a2 >= b2) continue;
      localTokens.push({ a: a2, b: b2, ppl: t.ppl });
    }
    if (!localTokens.length) return;

    // 平滑（在 token 维度；以 localTokens 顺序为序列，近似原 token 顺序）
    const smoothed = smoothTokens(localTokens, settings.smoothingMode, settings.smoothingWindowSize);

    // per-char 颜色数组
    const chars = new Array(blockLen).fill(null);
    for (let i = 0; i < localTokens.length; i++) {
      const tok = localTokens[i];
      const ppl = smoothed[i];
      if (ppl == null) continue;
      const rgb = pplToRgb(ppl, scale);
      const color = rgba(rgb, opacity);
      for (let c = tok.a; c < tok.b; c++) chars[c] = color;
    }

    // 应用样式类（控制 underline/bottombar/background）
    blockEl.classList.remove("ppl-style-underline", "ppl-style-bottombar");
    if (settings.heatmapStyle === "underline") blockEl.classList.add("ppl-style-underline");
    else if (settings.heatmapStyle === "bottombar") blockEl.classList.add("ppl-style-bottombar");

    wrapRanges(blockEl, blockLen, chars, blockNodes);
  }

  root.heatmap = { renderBlock, pplToRgb, hexToRgb, rgbToHex, rgba, smoothTokens };
})(window.PPLExt || (window.PPLExt = {}));
