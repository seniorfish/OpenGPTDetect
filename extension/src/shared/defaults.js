// src/shared/defaults.js
// 默认设置与中英文经验阈值。同时作为 content 经典脚本命名空间根。
// 经验数据（来自用户）：
//   中文: 低熵/AI < 18 ; 高质量 35-50 ; 难读 > 50
//   英文: 低熵/AI < 6  ; 高质量 18-25 ; 难读 > 25
(function (root) {
  "use strict";

  const DEFAULTS = {
    // 通用
    enabled: true,

    // 文本块检测
    textBlockMode: "article", // "article" | "all"
    minParagraphChars: 20, // 段落字数少于该值不测量
    mergeAdjacentShortParagraphs: true,
    mergeMaxGapChars: 60, // 相邻短段合并上限（单块字符）
    maxBlocksPerPage: 2000, // 单页测量块数硬上限

    // 语言判定
    englishCharRatioThreshold: 0.5, // 英文字符占比 >= 此值 => 英文段

    // 切分
    maxCharsPerRequest: 1500, // 超过则按句切分（API 默认上限 1500，防 OOM）

    // 视口与加载
    initialMeasureWords: 300, // 加载时立刻从头测量多少词
    measureConcurrency: 1, // 并发请求数（保护显存）
    viewportRootMargin: "600px", // 视口预取半径

    // 标注
    annotateThresholdChars: 30, // 小字 ppl 标注的段落字数阈值
    showPplLabel: true,

    // AI 检测
    aiDetectEnabled: true,
    aiMinReliableTokens: 20, // token 数低于此值不可靠
    reliableMinChars: 40, // 字符数低于此值不轻信 AI/质量结论
    aiThresholdZh: 18,
    aiThresholdEn: 6,
    aiTagEnabled: true,
    aiBorderEnabled: true,
    aiBorderColor: "#8b5cf6",

    // 热力图
    heatmapEnabled: true,
    heatmapStyle: "background", // "background" | "underline" | "bottombar"
    heatmapOpacity: 0.35,
    smoothingMode: "token", // "token" | "sentence"
    smoothingWindowSize: 2, // token 窗口 1/2/3…，1 = 逐 token

    // ppl -> 颜色锚点（按语言分别配置），ppl 升序
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

    // 名单
    listMode: "blacklist", // "blacklist" | "whitelist" | "off"
    whitelist: [],
    blacklist: [],

    // 加载指示
    loadingIndicator: "icon", // "icon" | "spinner" | "none"

    // API
    apiBaseUrl: "http://127.0.0.1:8000",

    // 快捷键
    shortcutEnabled: true
  };

  root.DEFAULTS = DEFAULTS;
  root.NS = root; // 便于其它文件挂载
})(typeof window !== "undefined" ? (window.PPLExt = window.PPLExt || {}) : (self.PPLExt = self.PPLExt || {}));
