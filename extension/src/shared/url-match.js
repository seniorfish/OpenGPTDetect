// src/shared/url-match.js
// 白名单/黑名单匹配。每条为 host 片段（支持前缀通配 *.example.com）。
(function (root) {
  "use strict";

  function hostOf(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return "";
    }
  }

  function matchOne(pattern, host) {
    if (!pattern) return false;
    pattern = pattern.trim().toLowerCase();
    host = host.toLowerCase();
    if (pattern.indexOf("*.") === 0) {
      const tail = pattern.slice(1); // ".example.com"
      return host === pattern.slice(2) || host.endsWith(tail);
    }
    return host === pattern || host.endsWith("." + pattern);
  }

  function listMatches(list, host) {
    return list.some((p) => matchOne(p, host));
  }

  // settings: { listMode, whitelist, blacklist }
  function isAllowed(url, settings) {
    const mode = settings.listMode || "off";
    if (mode === "off") return true;
    const host = hostOf(url);
    if (mode === "whitelist") return listMatches(settings.whitelist || [], host);
    if (mode === "blacklist") return !listMatches(settings.blacklist || [], host);
    return true;
  }

  root.urlMatch = { isAllowed, hostOf, matchOne, listMatches };
})(window.PPLExt || (window.PPLExt = {}));
