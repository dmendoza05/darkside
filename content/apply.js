(() => {
  const html = document.documentElement;
  let lastSettings = DARKSIDE_DEFAULTS;
  let skippedAlreadyDark = false;

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

  function originallyDark() {
    html.removeAttribute("data-darkside-fill");
    const htmlL = luminance(getComputedStyle(html).backgroundColor);
    const bodyL = document.body
      ? luminance(getComputedStyle(document.body).backgroundColor)
      : null;
    if (bodyL != null && bodyL < 0.28) return true;
    if (htmlL != null && htmlL < 0.28) return true;
    return false;
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
  }

  function paint(effective) {
    if (!effective.enabled) {
      clearFilters();
      return;
    }

    const vars = darksideCssVars(effective);
    const invert = skippedAlreadyDark && !effective._explicitDark ? 0 : vars.invert;

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
    const effective = darksideEffective(lastSettings, currentHost());
    if (!effective.enabled || !effective.darkMode || effective._explicitDark) {
      skippedAlreadyDark = false;
      paint(effective);
      return;
    }
    skippedAlreadyDark = originallyDark();
    paint(effective);
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

  apply(DARKSIDE_DEFAULTS);

  chrome.storage.local.get(null, (stored) => {
    skippedAlreadyDark = false;
    apply(stored);
    whenReady(() => {
      detectAlreadyDark();
      setTimeout(detectAlreadyDark, 350);
    });
  });

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area !== "local") return;
    chrome.storage.local.get(null, (stored) => {
      skippedAlreadyDark = false;
      apply(stored);
      detectAlreadyDark();
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "darkside-apply") return;
    skippedAlreadyDark = false;
    apply(message.settings || lastSettings);
  });

  setInterval(() => {
    apply(lastSettings);
  }, 60000);
})();
