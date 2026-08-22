(() => {
  const html = document.documentElement;
  let lastSettings = DARKSIDE_DEFAULTS;
  let skippedAlreadyDark = false;
  let darkSkipReason = "";
  let userForcedInvert = null;

  function currentHost() {
    try {
      return location.hostname || "";
    } catch {
      return "";
    }
  }

  function shouldSkipPage() {
    try {
      return darksideIsRestrictedUrl(location.href);
    } catch {
      return true;
    }
  }

  function markedDarkReason() {
    const attrs = [
      ["data-color-mode", html.getAttribute("data-color-mode")],
      ["data-theme", html.getAttribute("data-theme")],
      ["data-bs-theme", html.getAttribute("data-bs-theme")],
      ["data-color-scheme", html.getAttribute("data-color-scheme")],
      ["theme", html.getAttribute("theme")],
    ];
    for (const [name, value] of attrs) {
      const mode = String(value || "").toLowerCase();
      if (mode === "dark" || mode === "darker") return `${name}="${mode}"`;
    }
    if (html.hasAttribute("dark")) return "<html dark>";
    for (const cls of ["dark", "dark-theme", "theme-dark", "darkmode"]) {
      if (html.classList.contains(cls)) return `class .${cls}`;
    }

    const colorScheme = (html.getAttribute("color-scheme") || "").toLowerCase();
    if (colorScheme === "dark") return 'color-scheme="dark"';

    const meta = document.querySelector('meta[name="color-scheme"]');
    const metaContent = (meta?.getAttribute("content") || "").toLowerCase();
    if (metaContent.split(/[,\s]+/).includes("dark") && !metaContent.includes("light")) {
      return "meta color-scheme: dark";
    }
    return "";
  }

  function alreadyDarkReason() {
    const marked = markedDarkReason();
    if (marked) return marked;

    const weInverted = html.getAttribute("data-darkside-invert") === "1";
    if (!weInverted) {
      try {
        const scheme = String(getComputedStyle(html).colorScheme || "");
        if (/\bdark\b/i.test(scheme) && !/\blight\b/i.test(scheme)) return "color-scheme: dark";
      } catch {
        /* ignore */
      }
    }

    html.removeAttribute("data-darkside-fill");
    const htmlL = luminance(getComputedStyle(html).backgroundColor);
    const bodyL = document.body
      ? luminance(getComputedStyle(document.body).backgroundColor)
      : null;
    if (bodyL != null && bodyL < 0.28) return "dark background";
    if (htmlL != null && htmlL < 0.28) return "dark background";
    return "";
  }

  function setDarkSkip(reason) {
    darkSkipReason = reason || "";
    skippedAlreadyDark = Boolean(darkSkipReason);
  }

  function parseColor(color) {
    const m = String(color).match(
      /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)/i
    );
    if (!m) return null;
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] === undefined ? 1 : Number(m[4]),
    };
  }

  function luminance(color) {
    const c = parseColor(color);
    if (!c || c.a < 0.15) return null;
    return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  }

  function htmlNeedsFill() {
    return luminance(getComputedStyle(html).backgroundColor) == null;
  }

  function clearFilters() {
    html.removeAttribute("data-darkside");
    html.removeAttribute("data-darkside-invert");
    html.removeAttribute("data-darkside-fill");
    html.style.removeProperty("--ds-invert");
    html.style.removeProperty("--ds-hue");
    html.style.removeProperty("--ds-brightness");
    html.style.removeProperty("--ds-contrast");
    html.style.removeProperty("--ds-sepia");
    stopBgObserver();
  }

  function paint(effective) {
    if (!effective.enabled) {
      clearFilters();
      return;
    }

    const vars = darksideCssVars(effective);
    let invert = vars.invert;
    if (userForcedInvert === true) invert = 1;
    else if (userForcedInvert === false) invert = 0;
    else if (skippedAlreadyDark) invert = 0;

    html.setAttribute("data-darkside", "");
    html.setAttribute("data-darkside-invert", String(invert));
    html.style.setProperty("--ds-invert", String(invert));
    html.style.setProperty("--ds-hue", invert ? "180deg" : "0deg");
    html.style.setProperty("--ds-brightness", vars.brightness);
    html.style.setProperty("--ds-contrast", vars.contrast);
    html.style.setProperty("--ds-sepia", vars.sepia);

    if (invert && htmlNeedsFill()) {
      html.setAttribute("data-darkside-fill", "1");
    } else {
      html.removeAttribute("data-darkside-fill");
    }

    if (invert) {
      startBgObserver();
      if (document.body) queueBgWork(document.body, false);
    } else {
      stopBgObserver();
    }
  }

  function apply(stored) {
    if (shouldSkipPage()) {
      clearFilters();
      return;
    }
    lastSettings = stored;
    paint(darksideEffective(stored, currentHost()));
  }

  function detectAlreadyDark() {
    if (userForcedInvert !== null) {
      setDarkSkip("");
      paint(darksideEffective(lastSettings, currentHost()));
      return;
    }
    const effective = darksideEffective(lastSettings, currentHost());
    if (!effective.enabled || !effective.darkMode) {
      setDarkSkip("");
      paint(effective);
      return;
    }
    setDarkSkip(alreadyDarkReason());
    paint(effective);
  }

  const BG_ATTR = "data-darkside-bg";
  const SKIP_BG_TAGS = new Set([
    "HTML",
    "HEAD",
    "BODY",
    "SCRIPT",
    "STYLE",
    "LINK",
    "META",
    "TITLE",
    "NOSCRIPT",
    "IMG",
    "VIDEO",
    "CANVAS",
    "IFRAME",
    "EMBED",
    "OBJECT",
    "SVG",
  ]);

  let bgObserver = null;
  let bgIdleHandle = 0;
  let bgRaf = 0;
  let bgRescanAll = false;
  let bgItems = [];
  let bgCursor = 0;
  const bgPendingTrees = new Set();
  const bgPendingSelf = new Set();

  function hasUrlImage(value) {
    return Boolean(value) && /url\s*\(/i.test(value);
  }

  function computedBackgroundImage(el, pseudo) {
    try {
      return getComputedStyle(el, pseudo).backgroundImage || "";
    } catch {
      return "";
    }
  }

  // 1. Inline / script: element.style or style="background-image: url(...)"
  function hasScriptBackgroundImage(el) {
    const inline = `${el.style?.backgroundImage || ""} ${el.style?.background || ""}`;
    if (hasUrlImage(inline)) return true;
    const attr = el.getAttribute("style") || "";
    return /background(?:-image)?\s*:[^;]*url\s*\(/i.test(attr);
  }

  // 2. CSS class / stylesheet: computed style (and ::before / ::after)
  function hasCssBackgroundImage(el) {
    return (
      hasUrlImage(computedBackgroundImage(el)) ||
      hasUrlImage(computedBackgroundImage(el, "::before")) ||
      hasUrlImage(computedBackgroundImage(el, "::after"))
    );
  }

  function elementHasBackgroundImage(el) {
    if (!(el instanceof Element)) return false;
    if (SKIP_BG_TAGS.has(el.tagName)) return false;
    return hasScriptBackgroundImage(el) || hasCssBackgroundImage(el);
  }

  function textLenCapped(el, max) {
    try {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n = 0;
      let node;
      while ((node = walker.nextNode())) {
        const value = node.nodeValue;
        if (!value) continue;
        n += value.replace(/\s+/g, "").length;
        if (n > max) return n;
      }
      return n;
    } catch {
      return max + 1;
    }
  }

  function shouldUninvertBackground(el) {
    if (!(el instanceof Element)) return false;
    if (SKIP_BG_TAGS.has(el.tagName)) return false;
    if (el.parentElement?.closest(`[${BG_ATTR}]`)) return false;
    if (!elementHasBackgroundImage(el)) return false;
    if (textLenCapped(el, 24) > 24) return false;
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.width < 40 && rect.height < 40) {
        return false;
      }
    } catch {
      /* ignore */
    }
    return true;
  }

  function setBgMark(el, on) {
    if (on) {
      if (el.getAttribute(BG_ATTR) !== "1") el.setAttribute(BG_ATTR, "1");
    } else if (el.hasAttribute(BG_ATTR)) {
      el.removeAttribute(BG_ATTR);
    }
  }

  function inspectBg(el) {
    if (!(el instanceof Element)) return;
    setBgMark(el, shouldUninvertBackground(el));
  }

  function inspectBgTree(root) {
    if (!(root instanceof Element)) return;
    bgPendingTrees.add(root);
    scheduleBgPump();
  }

  function clearBgMarks() {
    document.querySelectorAll(`[${BG_ATTR}]`).forEach((el) => el.removeAttribute(BG_ATTR));
  }

  function cancelBgWork() {
    if (bgIdleHandle && typeof cancelIdleCallback === "function") {
      cancelIdleCallback(bgIdleHandle);
    }
    bgIdleHandle = 0;
    if (bgRaf) {
      cancelAnimationFrame(bgRaf);
      bgRaf = 0;
    }
  }

  function collectTree(root) {
    if (!(root instanceof Element)) return;
    bgItems.push(root);
    const nodes = root.querySelectorAll("*");
    for (let i = 0; i < nodes.length; i += 1) bgItems.push(nodes[i]);
  }

  function scheduleBgPump() {
    if (bgIdleHandle || bgRaf) return;
    const pump = (deadline) => {
      bgIdleHandle = 0;
      bgRaf = 0;

      if (bgRescanAll) {
        bgRescanAll = false;
        bgPendingTrees.clear();
        bgPendingSelf.clear();
        bgItems = [];
        bgCursor = 0;
        if (document.body) collectTree(document.body);
      } else {
        if (bgPendingTrees.size) {
          bgPendingTrees.forEach((el) => {
            if (el.isConnected) collectTree(el);
          });
          bgPendingTrees.clear();
        }
        if (bgPendingSelf.size) {
          bgPendingSelf.forEach((el) => {
            if (el.isConnected) bgItems.push(el);
          });
          bgPendingSelf.clear();
        }
      }

      const hasBudget = () => !deadline || deadline.timeRemaining() > 3;
      let n = 0;
      while (bgCursor < bgItems.length && (hasBudget() || n < 40)) {
        inspectBg(bgItems[bgCursor]);
        bgCursor += 1;
        n += 1;
      }
      if (bgCursor >= bgItems.length) {
        bgItems = [];
        bgCursor = 0;
      }
      if (bgCursor < bgItems.length || bgRescanAll || bgPendingTrees.size || bgPendingSelf.size) {
        scheduleBgPump();
      }
    };

    if (typeof requestIdleCallback === "function") {
      bgIdleHandle = requestIdleCallback(pump, { timeout: 180 });
    } else {
      bgRaf = requestAnimationFrame(() => pump(null));
    }
  }

  function queueBgWork(el, rescanAll) {
    if (rescanAll) bgRescanAll = true;
    else if (el instanceof Element) bgPendingTrees.add(el);
    scheduleBgPump();
  }

  function queueBgSelf(el) {
    if (el instanceof Element) bgPendingSelf.add(el);
    scheduleBgPump();
  }

  function startBgObserver() {
    if (bgObserver || !document.documentElement) return;
    bgObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const target = mutation.target;
          if (target === html || target === document.body) queueBgWork(null, true);
          else queueBgSelf(target);
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          const tag = node.tagName;
          if (tag === "STYLE" || tag === "LINK") {
            queueBgWork(null, true);
            if (tag === "LINK") node.addEventListener("load", () => queueBgWork(null, true), { once: true });
          } else {
            queueBgWork(node, false);
          }
        }
      }
    });
    bgObserver.observe(html, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    if (document.body) inspectBgTree(document.body);
    else queueBgWork(html, true);
  }

  function stopBgObserver() {
    if (bgObserver) {
      bgObserver.disconnect();
      bgObserver = null;
    }
    cancelBgWork();
    bgPendingTrees.clear();
    bgPendingSelf.clear();
    bgItems = [];
    bgCursor = 0;
    bgRescanAll = false;
    clearBgMarks();
  }

  function whenReady(callback) {
    if (document.body) {
      callback();
      return;
    }
    const observer = new MutationObserver(() => {
      if (document.body) {
        observer.disconnect();
        callback();
      }
    });
    observer.observe(html, { childList: true });
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  }

  let nightTimer = 0;
  function syncNightTimer(stored) {
    const want = Boolean(stored && stored.autoNight);
    if (want && !nightTimer) {
      nightTimer = setInterval(() => apply(lastSettings), 60000);
    } else if (!want && nightTimer) {
      clearInterval(nightTimer);
      nightTimer = 0;
    }
  }

  setDarkSkip(markedDarkReason());
  apply(DARKSIDE_DEFAULTS);

  chrome.storage.local.get(null, (stored) => {
    apply(stored);
    syncNightTimer(lastSettings);
    whenReady(() => {
      detectAlreadyDark();
      setTimeout(detectAlreadyDark, 350);
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    apply(darksideMergeChanges(lastSettings, changes));
    syncNightTimer(lastSettings);
    if (userForcedInvert === null) detectAlreadyDark();
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") return;
    if (sender.id && sender.id !== chrome.runtime.id) return;
    if (message.type === "darkside-user-invert") {
      userForcedInvert = Boolean(message.invert);
      setDarkSkip("");
      apply(lastSettings);
      return;
    }
    if (message.type === "darkside-preview") {
      if (shouldSkipPage()) return;
      if (message.effective && typeof message.effective === "object") {
        paint(message.effective);
      }
      return;
    }
    if (message.type === "darkside-apply") {
      apply(message.settings || lastSettings);
      if (userForcedInvert === null) detectAlreadyDark();
      return;
    }
    if (message.type === "darkside-status") {
      const skipped = skippedAlreadyDark && userForcedInvert !== true;
      sendResponse({
        skippedAlreadyDark: skipped,
        invert: html.getAttribute("data-darkside-invert") === "1",
        reason: skipped ? darkSkipReason : "",
      });
    }
  });
})();
