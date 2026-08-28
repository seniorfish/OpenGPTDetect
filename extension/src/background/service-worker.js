// src/background/service-worker.js
// 代理本地模型服务的 /ppl 与 /health 请求（避开页面 CSP / 混合内容 / CORS），
// 并处理快捷键开关。
(function () {
  "use strict";

  const DEFAULTS = /* injected via shared defaults at install */ {
    apiBaseUrl: "http://127.0.0.1:8000",
    enabled: true,
    shortcutEnabled: true
  };

  async function getSettings() {
    const stored = await chrome.storage.local.get(null);
    return Object.assign({}, DEFAULTS, stored);
  }

  async function callPpl(baseUrl, text) {
    const url = baseUrl.replace(/\/+$/, "") + "/ppl";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 300);
      } catch (e) {}
      return { ok: false, status: res.status, error: detail || res.statusText };
    }
    const data = await res.json();
    return { ok: true, data };
  }

  async function callHealth(baseUrl) {
    const url = baseUrl.replace(/\/+$/, "") + "/health";
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) return { ok: false, status: res.status };
      const data = await res.json();
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    (async () => {
      const s = await getSettings();
      if (msg.type === "ppl") {
        const r = await callPpl(msg.baseUrl || s.apiBaseUrl, msg.text);
        sendResponse(r);
      } else if (msg.type === "health") {
        const r = await callHealth(msg.baseUrl || s.apiBaseUrl);
        sendResponse(r);
      } else if (msg.type === "get-settings") {
        sendResponse({ ok: true, data: s });
      } else if (msg.type === "set-settings") {
        await chrome.storage.local.set(msg.patch || {});
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "unknown-type" });
      }
    })();
    return true; // async
  });

  // 快捷键：切换 enabled
  chrome.commands.onCommand.addListener(async (cmd) => {
    if (cmd !== "toggle-enabled") return;
    const s = await getSettings();
    if (!s.shortcutEnabled) return;
    const next = !s.enabled;
    await chrome.storage.local.set({ enabled: next });
    // 通知当前标签页
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: "enabled-toggled", enabled: next }).catch(() => {});
      }
    } catch (e) {}
  });

  // 安装时写入默认值
  chrome.runtime.onInstalled.addListener(async () => {
    const cur = await chrome.storage.local.get(null);
    const merged = Object.assign(
      {
        apiBaseUrl: "http://127.0.0.1:8000",
        enabled: true,
        shortcutEnabled: true,
        textBlockMode: "article",
        minParagraphChars: 20,
        mergeAdjacentShortParagraphs: true,
        mergeMaxGapChars: 60,
        maxBlocksPerPage: 2000,
        englishCharRatioThreshold: 0.5,
        maxCharsPerRequest: 1500,
        initialMeasureWords: 300,
        measureConcurrency: 1,
        viewportRootMargin: "600px",
        annotateThresholdChars: 30,
        showPplLabel: true,
        aiDetectEnabled: true,
        aiMinReliableTokens: 20,
        reliableMinChars: 40,
        aiThresholdZh: 18,
        aiThresholdEn: 6,
        aiTagEnabled: true,
        aiBorderEnabled: true,
        aiBorderColor: "#8b5cf6",
        heatmapEnabled: true,
        heatmapStyle: "background",
        heatmapOpacity: 0.35,
        smoothingMode: "token",
        smoothingWindowSize: 2,
        colorScaleZh: [
          { ppl: 0, color: "#22c55e" },
          { ppl: 35, color: "#facc15" },
          { ppl: 50, color: "#ef4444" }
        ],
        colorScaleEn: [
          { ppl: 0, color: "#22c55e" },
          { ppl: 18, color: "#facc15" },
          { ppl: 25, color: "#ef4444" }
        ],
        listMode: "blacklist",
        whitelist: [],
        blacklist: [],
        loadingIndicator: "icon"
      },
      cur
    );
    await chrome.storage.local.set(merged);
  });
})();
