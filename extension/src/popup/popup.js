// src/popup/popup.js
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const DEFAULTS = {
    apiBaseUrl: "http://127.0.0.1:8000",
    enabled: true
  };

  async function getSettings() {
    const stored = await chrome.storage.local.get(null);
    return Object.assign({}, DEFAULTS, stored);
  }

  async function checkHealth(baseUrl) {
    const dot = $("status-dot");
    const txt = $("health-text");
    const model = $("model-name");
    dot.className = "dot off";
    txt.textContent = "检测服务中…";
    try {
      const resp = await chrome.runtime.sendMessage({ type: "health", baseUrl });
      if (resp && resp.ok && resp.data) {
        dot.className = "dot on";
        txt.textContent = "本地服务在线";
        model.textContent = resp.data.model || "";
      } else {
        dot.className = "dot err";
        txt.textContent = "服务离线（" + (resp && resp.status ? resp.status : "无响应") + "）";
        model.textContent = "";
      }
    } catch (e) {
      dot.className = "dot err";
      txt.textContent = "无法连接本地服务";
      model.textContent = "";
    }
  }

  async function init() {
    const s = await getSettings();
    $("enabled").checked = !!s.enabled;
    checkHealth(s.apiBaseUrl);

    $("enabled").addEventListener("change", async (e) => {
      await chrome.storage.local.set({ enabled: e.target.checked });
      // 通知当前标签页
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: "enabled-toggled", enabled: e.target.checked }).catch(() => {});
        }
      } catch (err) {}
    });

    $("remeasure").addEventListener("click", async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: "remeasure" }).catch(() => {
            chrome.tabs.reload(tab.id);
          });
        }
      } catch (e) {}
    });

    $("options").addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
  }

  init();
})();
