// src/shared/storage.js
// chrome.storage 封装 + onChanged 广播订阅。
(function (root) {
  "use strict";

  const AREA = "local"; // 设置量小，但 colorScale 等可能略大；用 local 避免 sync 配额

  async function getAll() {
    const stored = await chrome.storage[AREA].get(null);
    return Object.assign({}, root.DEFAULTS, stored);
  }

  async function set(partial) {
    await chrome.storage[AREA].set(partial);
  }

  async function reset() {
    await chrome.storage[AREA].set(root.DEFAULTS);
  }

  // 订阅设置变更（content 与 options 共用）。listener(newSettings, changedKeys)
  function onChange(listener) {
    if (!chrome.storage || !chrome.storage.onChanged) return () => {};
    const handler = (changes, area) => {
      if (area !== AREA) return;
      const changed = {};
      for (const k in changes) changed[k] = changes[k].newValue;
      // 合并完整设置后回调
      getAll().then((full) => listener(full, Object.keys(changed)));
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }

  root.storage = { getAll, set, reset, onChange, AREA };
})(window.PPLExt || (window.PPLExt = {}));
