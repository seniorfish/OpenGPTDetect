// src/content/content.js
// 主编排器：设置加载、名单/开关判定、扫描->分组->视口->队列->测量->渲染。
(function (root) {
  "use strict";

  const { storage, urlMatch, domScan, apiClient, heatmap, annotate, viewport } = root;

  let settings = null;
  let started = false;
  let enabled = false;
  let io = null;
  let mo = null;
  const registered = new WeakSet(); // 已注册到 IO 的元素
  const unitSeen = new WeakSet(); // 已入队/已测量的单元（以其首块元素为代表）

  function log(...a) {
    // 调试开关，默认静默
    if (settings && settings.__debug) console.log("[PPL]", ...a);
  }

  function applyEnabled(on) {
    enabled = on;
    document.documentElement.classList.toggle("ppl-disabled", !on);
    if (on && settings && urlMatch.isAllowed(location.href, settings)) {
      if (!started) start();
      else pump(); // 重新启用：恢复队列
    }
  }

  function unitWords(unit) {
    return unit.blocks.reduce((s, b) => s + domScan.wordCount(b.text), 0);
  }

  function enqueueUnit(unit) {
    const first = unit.blocks[0].el;
    if (domScan.getState(first) === "done" || domScan.getState(first) === "measuring") return;
    queue.push(unit);
    pump();
  }

  const queue = [];
  let inFlight = 0;

  function pump() {
    if (!enabled) return; // 禁用期间不发起测量
    const concurrency = Math.max(1, settings.measureConcurrency || 1);
    while (inFlight < concurrency && queue.length) {
      const unit = queue.shift();
      inFlight++;
      measureAndRender(unit).finally(() => {
        inFlight--;
        pump();
      });
    }
  }

  function isAI(result) {
    if (!settings.aiDetectEnabled) return false;
    if (result.tokenCount < (settings.aiMinReliableTokens || 0)) return false;
    if (result.charCount < (settings.reliableMinChars || 0)) return false;
    if (result.avgPpl == null) return false;
    const thr = result.lang === "en" ? settings.aiThresholdEn : settings.aiThresholdZh;
    return result.avgPpl < thr;
  }

  async function measureAndRender(unit) {
    const first = unit.blocks[0].el;
    for (const b of unit.blocks) {
      domScan.setState(b.el, "measuring");
      annotate.clearAll(b.el);
      annotate.addLoading(b.el, settings);
    }
    let result;
    try {
      result = await apiClient.measureUnit(unit.text, settings);
    } catch (e) {
      result = { avgPpl: null, tokenCount: 0, charCount: unit.text.length, tokens: [], lang: "zh", error: String(e) };
    }

    const ai = isAI(result);

    for (let i = 0; i < unit.blocks.length; i++) {
      const b = unit.blocks[i];
      const offset = unit.offsets[i].start;
      const len = b.text.length;
      try {
        const flat = domScan.getFlatText(b.el);
        heatmap.renderBlock(b.el, flat.text, flat.nodes, result.tokens, offset, len, settings, result.lang);
      } catch (e) {
        log("render error", e);
      }
      annotate.removeLoading(b.el);
      if (result.error || result.avgPpl == null) {
        if (i === 0) annotate.addError(b.el);
        domScan.setState(b.el, "error");
      } else {
        if (b.text.length >= (settings.annotateThresholdChars || 0)) {
          annotate.addLabel(b.el, result.avgPpl, result.lang, settings);
        }
        if (ai) {
          // 边框作用于全部块，AI 小标签仅首块
          if (settings.aiBorderEnabled) b.el.classList.add("ppl-ai");
          if (i === 0) annotate.markAI(b.el, true, settings);
        }
        domScan.setState(b.el, "done");
      }
    }
  }

  function start() {
    if (started) return;
    started = true;
    const unitMap = new WeakMap(); // 首块元素 -> unit
    io = viewport.createObserver(settings.viewportRootMargin, (el) => {
      // el 是某 unit 的首块；经映射取出对应单元并入队
      const u = unitMap.get(el);
      if (u) enqueueUnit(u);
    });
    const candidates = domScan.scan(document.body, settings);
    const units = domScan.groupUnits(candidates, settings);
    const initial = viewport.pickInitial(
      units.map((u) => ({ words: unitWords(u), unit: u })),
      settings.initialMeasureWords || 0
    );
    const initialSet = new Set(initial.map((x) => x.unit));
    for (const u of units) {
      const first = u.blocks[0].el;
      if (unitSeen.has(first)) continue;
      unitSeen.add(first);
      unitMap.set(first, u);
      registered.add(first);
      domScan.setState(first, "pending");
      io.observe(first);
      if (initialSet.has(u)) enqueueUnit(u);
    }

    mo = viewport.startMutationWatch(() => {
      // 增量扫描：找未注册的新候选
      const cands = domScan.scan(document.body, settings);
      if (!cands.length) return;
      const units2 = domScan.groupUnits(cands, settings);
      for (const u of units2) {
        const first = u.blocks[0].el;
        if (unitSeen.has(first)) continue;
        unitSeen.add(first);
        unitMap.set(first, u);
        domScan.setState(first, "pending");
        io.observe(first);
        enqueueUnit(u);
      }
    });
  }

  function stop() {
    started = false;
    if (io) io.disconnect();
    if (mo) mo.disconnect();
    io = null;
    mo = null;
  }

  async function init() {
    settings = await storage.getAll();
    document.documentElement.classList.add("ppl-root");

    // 名单判定
    if (!urlMatch.isAllowed(location.href, settings)) {
      log("blocked by list");
    } else {
      applyEnabled(settings.enabled);
    }

    // 监听设置变更
    storage.onChange((full, keys) => {
      const prev = settings;
      settings = full;
      if (keys.includes("enabled")) {
        applyEnabled(settings.enabled);
      }
      if (keys.includes("listMode") || keys.includes("whitelist") || keys.includes("blacklist")) {
        const allowed = urlMatch.isAllowed(location.href, settings);
        document.documentElement.classList.toggle("ppl-disabled", !(allowed && settings.enabled));
      }
      // 视觉参数变更仅影响后续测量；已渲染可通过 popup「重新测量」刷新
    });

    // 来自 background / popup 的消息
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg) return;
      if (msg.type === "enabled-toggled") {
        applyEnabled(!!msg.enabled);
      } else if (msg.type === "remeasure") {
        location.reload();
      } else if (msg.type === "ping") {
        // 用于 popup 探测 content 是否存活
      }
    });
  }

  init();
})(window.PPLExt || (window.PPLExt = {}));
