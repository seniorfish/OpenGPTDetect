// src/content/viewport.js
// IntersectionObserver（视口跟随懒测量）+ MutationObserver（动态内容补扫）。
(function (root) {
  "use strict";

  function createObserver(rootMargin, onIntersect) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            onIntersect(e.target);
          }
        }
      },
      { rootMargin: rootMargin || "600px", root: null, threshold: 0 }
    );
    return io;
  }

  // 启动时从顶部按词数选出立即测量的块
  function pickInitial(candidates, words) {
    const out = [];
    let acc = 0;
    for (const c of candidates) {
      out.push(c);
      acc += c.words || 0;
      if (acc >= words) break;
    }
    return out;
  }

  // 监听 DOM 新增节点，回调返回新增的可测量元素根（由调用方再扫描）
  function startMutationWatch(onMutated) {
    let timer = null;
    const mo = new MutationObserver((muts) => {
      let hasNew = false;
      for (const m of muts) {
        if (m.addedNodes && m.addedNodes.length) {
          hasNew = true;
          break;
        }
      }
      if (!hasNew) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        try {
          onMutated();
        } catch (e) {
          /* ignore */
        }
      }, 400);
    });
    mo.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });
    return mo;
  }

  root.viewport = { createObserver, pickInitial, startMutationWatch };
})(window.PPLExt || (window.PPLExt = {}));
