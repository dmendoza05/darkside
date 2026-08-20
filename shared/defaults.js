const DARKSIDE_DEFAULTS = {
  enabled: true,
  darkMode: true,
  tuneEnabled: true,
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
  soft: { brightness: 100, contrast: 100, warmth: 15, dim: 0 },
  night: { brightness: 85, contrast: 105, warmth: 45, dim: 25 },
  sunset: { brightness: 95, contrast: 100, warmth: 70, dim: 10 },
  contrast: { brightness: 105, contrast: 135, warmth: 8, dim: 0 },
  reading: { brightness: 92, contrast: 110, warmth: 35, dim: 8 },
};

const DARKSIDE_TUNE_KEYS = ["darkMode", "tuneEnabled", "brightness", "contrast", "warmth", "dim"];

function darksideClamp(value, min, max, fallback) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function darksideNormalize(stored) {
  const raw = stored && typeof stored === "object" ? stored : {};
  const siteOverrides =
    raw.siteOverrides && typeof raw.siteOverrides === "object" && !Array.isArray(raw.siteOverrides)
      ? raw.siteOverrides
      : {};
  const merged = { ...DARKSIDE_DEFAULTS, ...raw, siteOverrides };
  merged.enabled = Boolean(merged.enabled);
  merged.darkMode = Boolean(merged.darkMode);
  merged.tuneEnabled = merged.tuneEnabled !== false;
  merged.autoNight = Boolean(merged.autoNight);
  merged.brightness = darksideClamp(merged.brightness, 50, 150, DARKSIDE_DEFAULTS.brightness);
  merged.contrast = darksideClamp(merged.contrast, 50, 150, DARKSIDE_DEFAULTS.contrast);
  merged.warmth = darksideClamp(merged.warmth, 0, 80, DARKSIDE_DEFAULTS.warmth);
  merged.dim = darksideClamp(merged.dim, 0, 70, DARKSIDE_DEFAULTS.dim);
  merged.autoNightStart = merged.autoNightStart || DARKSIDE_DEFAULTS.autoNightStart;
  merged.autoNightEnd = merged.autoNightEnd || DARKSIDE_DEFAULTS.autoNightEnd;
  return merged;
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
      if (merged.tuneEnabled) {
        merged.warmth = Math.max(Number(merged.warmth) || 0, 45);
        merged.dim = Math.max(Number(merged.dim) || 0, 15);
      }
    }
  }

  merged._hostname = hostname || "";
  merged._hasOverride = Boolean(override);
  merged._explicitDark = Boolean(override && override.darkMode === true);
  return merged;
}

function darksideCssVars(effective) {
  const invert = effective.enabled && effective.darkMode ? 1 : 0;
  const tuneOn = Boolean(effective.enabled && effective.tuneEnabled);
  const brightnessVal = tuneOn ? Number(effective.brightness) : 100;
  const contrastVal = tuneOn ? Number(effective.contrast) : 100;
  const warmthVal = tuneOn ? Number(effective.warmth) : 0;
  const dimVal = tuneOn ? Number(effective.dim) : 0;
  const dimFactor = 1 - (dimVal / 100) * 0.85;
  const brightness = (brightnessVal / 100) * dimFactor;
  return {
    invert,
    hue: invert ? "180deg" : "0deg",
    brightness: brightness.toFixed(3),
    contrast: (contrastVal / 100).toFixed(3),
    sepia: ((warmthVal / 100) * 0.65).toFixed(3),
  };
}

function darksideHostnameFromUrl(url) {
  try {
    return new URL(url).hostname || "";
  } catch {
    return "";
  }
}

function darksideDisplayHost(url) {
  if (!url) return "unavailable";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.hostname || "unavailable";
    }
    parsed.search = "";
    parsed.hash = "";
    return parsed.href;
  } catch {
    return url;
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
