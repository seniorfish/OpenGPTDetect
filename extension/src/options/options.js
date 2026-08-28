// src/options/options.js
(function () {
  "use strict";

  const PPLExt = window.PPLExt || {};
  const DEFAULTS = PPLExt.DEFAULTS || {};
  const $ = (id) => document.getElementById(id);

  const SCALAR_IDS = [
    "enabled", "shortcutEnabled", "apiBaseUrl", "textBlockMode", "minParagraphChars",
    "mergeAdjacentShortParagraphs", "mergeMaxGapChars", "maxBlocksPerPage",
    "englishCharRatioThreshold", "maxCharsPerRequest", "initialMeasureWords",
    "measureConcurrency", "viewportRootMargin", "loadingIndicator", "showPplLabel",
    "annotateThresholdChars", "aiDetectEnabled", "aiTagEnabled", "aiBorderEnabled",
    "aiBorderColor", "aiMinReliableTokens", "reliableMinChars", "aiThresholdZh",
    "aiThresholdEn", "heatmapEnabled", "heatmapStyle", "heatmapOpacity",
    "smoothingMode", "smoothingWindowSize", "listMode"
  ];

  const CHECK_IDS = new Set([
    "enabled", "shortcutEnabled", "mergeAdjacentShortParagraphs", "showPplLabel",
    "aiDetectEnabled", "aiTagEnabled", "aiBorderEnabled", "heatmapEnabled"
  ]);

  function getStored() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (s) => resolve(Object.assign({}, DEFAULTS, s)));
    });
  }

  function populate(s) {
    for (const id of SCALAR_IDS) {
      const el = $(id);
      if (!el) continue;
      if (CHECK_IDS.has(id)) el.checked = !!s[id];
      else el.value = s[id];
    }
    $("whitelist").value = (s.whitelist || []).join("\n");
    $("blacklist").value = (s.blacklist || []).join("\n");
    renderScale("Zh", s.colorScaleZh);
    renderScale("En", s.colorScaleEn);
    updateOpacity();
  }

  function collect() {
    const out = {};
    for (const id of SCALAR_IDS) {
      const el = $(id);
      if (!el) continue;
      if (CHECK_IDS.has(id)) out[id] = el.checked;
      else if (el.type === "number" || el.type === "range") out[id] = parseFloat(el.value);
      else out[id] = el.value;
    }
    out.whitelist = splitList($("whitelist").value);
    out.blacklist = splitList($("blacklist").value);
    out.colorScaleZh = collectScale("Zh");
    out.colorScaleEn = collectScale("En");
    return out;
  }

  function splitList(text) {
    return text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // ---- 颜色锚点编辑器 ----
  function renderScale(suffix, anchors) {
    const box = $("scale" + suffix);
    box.innerHTML = "";
    for (let i = 0; i < anchors.length; i++) {
      const row = document.createElement("div");
      row.className = "anchor-row";
      const ppl = document.createElement("input");
      ppl.type = "number";
      ppl.step = "0.5";
      ppl.value = anchors[i].ppl;
      const col = document.createElement("input");
      col.type = "color";
      col.value = normalizeHex(anchors[i].color);
      const rm = document.createElement("button");
      rm.type = "button";
      rm.textContent = "×";
      rm.title = "删除锚点";
      rm.addEventListener("click", () => {
        row.remove();
        updatePreview(suffix);
      });
      ppl.addEventListener("input", () => updatePreview(suffix));
      col.addEventListener("input", () => updatePreview(suffix));
      row.appendChild(ppl);
      row.appendChild(col);
      row.appendChild(rm);
      box.appendChild(row);
    }
    updatePreview(suffix);
  }

  function collectScale(suffix) {
    const box = $("scale" + suffix);
    const rows = box.querySelectorAll(".anchor-row");
    const out = [];
    rows.forEach((r) => {
      const ppl = parseFloat(r.querySelector('input[type="number"]').value);
      const color = r.querySelector('input[type="color"]').value;
      if (!isNaN(ppl)) out.push({ ppl, color });
    });
    out.sort((a, b) => a.ppl - b.ppl);
    return out;
  }

  function normalizeHex(c) {
    if (!c) return "#808080";
    if (c[0] === "#" && c.length === 7) return c;
    return "#808080";
  }

  function updatePreview(suffix) {
    const anchors = collectScale(suffix);
    const el = $("preview" + suffix);
    if (!anchors.length) {
      el.style.background = "#e5e7eb";
      return;
    }
    const max = anchors[anchors.length - 1].ppl;
    const min = anchors[0].ppl;
    const stops = anchors.map((a) => `${a.color} ${((a.ppl - min) / (max - min || 1)) * 100}%`);
    el.style.background = `linear-gradient(to right, ${stops.join(",")})`;
    el.title = anchors.map((a) => `${a.ppl}→${a.color}`).join("  ");
  }

  function updateOpacity() {
    $("opacityVal").textContent = " " + (parseFloat($("heatmapOpacity").value)).toFixed(2);
  }

  function toast(msg, isErr) {
    const t = $("toast");
    t.textContent = msg;
    t.style.color = isErr ? "#dc2626" : "#16a34a";
    setTimeout(() => (t.textContent = ""), 2000);
  }

  async function save() {
    const out = collect();
    // 合并校验
    if (!out.colorScaleZh.length || !out.colorScaleEn.length) {
      toast("颜色锚点不能为空", true);
      return;
    }
    await chrome.storage.local.set(out);
    toast("已保存");
  }

  async function reset() {
    await chrome.storage.local.set(DEFAULTS);
    populate(DEFAULTS);
    toast("已恢复默认");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const s = await getStored();
    populate(s);

    $("save").addEventListener("click", save);
    $("reset").addEventListener("click", reset);
    $("heatmapOpacity").addEventListener("input", updateOpacity);

    document.querySelectorAll(".add-anchor").forEach((btn) => {
      btn.addEventListener("click", () => {
        const suffix = btn.getAttribute("data-scale");
        const box = $("scale" + suffix);
        const row = document.createElement("div");
        row.className = "anchor-row";
        const ppl = document.createElement("input");
        ppl.type = "number";
        ppl.step = "0.5";
        ppl.value = 30;
        const col = document.createElement("input");
        col.type = "color";
        col.value = "#facc15";
        const rm = document.createElement("button");
        rm.type = "button";
        rm.textContent = "×";
        rm.addEventListener("click", () => {
          row.remove();
          updatePreview(suffix);
        });
        ppl.addEventListener("input", () => updatePreview(suffix));
        col.addEventListener("input", () => updatePreview(suffix));
        row.appendChild(ppl);
        row.appendChild(col);
        row.appendChild(rm);
        box.appendChild(row);
        updatePreview(suffix);
      });
    });
  });
})();
