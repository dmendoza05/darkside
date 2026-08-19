const DARKSIDE_DEFAULTS = {
  enabled: true,
  darkMode: true,
  brightness: 100,
  contrast: 100,
  warmth: 20,
  dim: 0,
  autoNight: false,
  autoNightStart: "20:00",
  autoNightEnd: "07:00",
  siteOverrides: {},
};

const DARKSIDE_PRESETS = {
  soft: { darkMode: true, brightness: 100, contrast: 100, warmth: 15, dim: 0 },
  night: { darkMode: true, brightness: 85, contrast: 105, warmth: 45, dim: 25 },
  sunset: { darkMode: true, brightness: 95, contrast: 100, warmth: 70, dim: 10 },
  contrast: { darkMode: true, brightness: 105, contrast: 135, warmth: 8, dim: 0 },
  reading: { darkMode: true, brightness: 92, contrast: 110, warmth: 35, dim: 8 },
};

const DARKSIDE_TUNE_KEYS = ["darkMode", "brightness", "contrast", "warmth", "dim"];

function darksideNormalize(stored) {
  const raw = stored && typeof stored === "object" ? stored : {};
  const siteOverrides =
    raw.siteOverrides && typeof raw.siteOverrides === "object" ? raw.siteOverrides : {};
  return { ...DARKSIDE_DEFAULTS, ...raw, siteOverrides };
}

function darksideMinutes(hhmm) {
  const [h, m] = String(hhmm || "0:0")
    .split(":")
    .map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

function darksideIsAutoNight(settings, date = new Date()) {
  if (!settings || !settings.autoNight) return false;
  const current = date.getHours() * 60 + date.getMinutes();
  const start = darksideMinutes(settings.autoNightStart);
  const end = darksideMinutes(settings.autoNightEnd);
  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function darksideEffective(stored, hostname) {
  const global = darksideNormalize(stored);
  const override =
    hostname && global.siteOverrides[hostname] && typeof global.siteOverrides[hostname] === "object"
      ? global.siteOverrides[hostname]
      : null;

  const merged = override ? { ...global, ...override } : { ...global };

  if (override && override.enabled === false) {
    merged.enabled = false;
  }

  if (merged.enabled && darksideIsAutoNight(global)) {
    const userForcedLight = override && override.darkMode === false;
    if (!userForcedLight) {
      merged.darkMode = true;
      merged.warmth = Math.max(Number(merged.warmth) || 0, 45);
      merged.dim = Math.max(Number(merged.dim) || 0, 15);
    }
  }

  merged._hostname = hostname || "";
  merged._hasOverride = Boolean(override);
  merged._explicitDark = Boolean(override && override.darkMode === true);
  return merged;
}

function darksideCssVars(effective) {
  const invert = effective.enabled && effective.darkMode ? 1 : 0;
  const dimFactor = 1 - (Number(effective.dim) / 100) * 0.85;
  const brightness = (Number(effective.brightness) / 100) * dimFactor;
  return {
    invert,
    hue: invert ? "180deg" : "0deg",
    brightness: brightness.toFixed(3),
    contrast: (Number(effective.contrast) / 100).toFixed(3),
    sepia: ((Number(effective.warmth) / 100) * 0.65).toFixed(3),
  };
}

function darksideHostnameFromUrl(url) {
  try {
    return new URL(url).hostname || "";
  } catch {
    return "";
  }
}

function darksideIsRestrictedUrl(url) {
  if (!url) return true;
  return (
    /^(chrome|chrome-extension|edge|about|devtools|view-source|moz-extension):/i.test(url) ||
    url.startsWith("https://chrome.google.com/webstore") ||
    url.startsWith("https://chromewebstore.google.com")
  );
}
