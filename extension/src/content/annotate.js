// src/content/annotate.js
// 段落旁小字 ppl 标注、AI 标签、左侧边框、加载/错误指示。
(function (root) {
  "use strict";

  const LABEL_CLASS = "ppl-label";
  const AI_TAG_CLASS = "ppl-ai-tag";
  const LOADING_CLASS = "ppl-loading";
  const ERROR_CLASS = "ppl-error-tag";

  function removeByClass(el, cls) {
    if (!el) return;
    const arr = el.querySelectorAll("." + cls);
    for (const n of arr) n.remove();
  }

  function clearAll(blockEl) {
    removeByClass(blockEl, LABEL_CLASS);
    removeByClass(blockEl, AI_TAG_CLASS);
    removeByClass(blockEl, LOADING_CLASS);
    removeByClass(blockEl, ERROR_CLASS);
    blockEl.classList.remove("ppl-ai");
  }

  function addLabel(blockEl, avgPpl, lang, settings) {
    if (!settings.showPplLabel) return;
    if (avgPpl == null || !isFinite(avgPpl)) return;
    removeByClass(blockEl, LABEL_CLASS);
    const span = document.createElement("span");
    span.className = LABEL_CLASS;
    span.textContent = `ppl ${avgPpl.toFixed(1)}`;
    span.title = `平均困惑度 ${avgPpl.toFixed(2)}（${lang === "en" ? "英文" : "中文"}段）`;
    blockEl.appendChild(span);
  }

  function markAI(blockEl, isAI, settings) {
    if (!isAI) return;
    if (settings.aiBorderEnabled) blockEl.classList.add("ppl-ai");
    if (settings.aiTagEnabled) {
      removeByClass(blockEl, AI_TAG_CLASS);
      const tag = document.createElement("span");
      tag.className = AI_TAG_CLASS;
      tag.textContent = "AI?";
      blockEl.appendChild(tag);
    }
  }

  function addLoading(blockEl, settings) {
    if (settings.loadingIndicator === "none") return;
    removeByClass(blockEl, LOADING_CLASS);
    const span = document.createElement("span");
    span.className = LOADING_CLASS;
    if (settings.loadingIndicator === "spinner") span.classList.add("ppl-loading-spinner");
    else span.classList.add("ppl-loading-icon");
    blockEl.appendChild(span);
  }

  function removeLoading(blockEl) {
    removeByClass(blockEl, LOADING_CLASS);
  }

  function addError(blockEl) {
    removeByClass(blockEl, ERROR_CLASS);
    const span = document.createElement("span");
    span.className = ERROR_CLASS;
    span.textContent = "ppl测量失败";
    span.title = "本地模型服务返回错误或超时";
    blockEl.appendChild(span);
  }

  root.annotate = { clearAll, addLabel, markAI, addLoading, removeLoading, addError };
})(window.PPLExt || (window.PPLExt = {}));
