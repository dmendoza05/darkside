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
const DARKSIDE_HOST_BLOCKLIST = new Set(["__proto__", "constructor", "prototype"]);

function darksideClamp(value, min, max, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function darksideNormalizeTime(value, fallback) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return fallback;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function darksideIsSafeHostKey(host) {
  if (typeof host !== "string" || !host || host.length > 253) return false;
  if (DARKSIDE_HOST_BLOCKLIST.has(host)) return false;
  if (/[\s/\\]/.test(host)) return false;
  return true;
}

function darksideNormalizeOverride(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  if ("enabled" in raw) out.enabled = Boolean(raw.enabled);
  if ("darkMode" in raw) out.darkMode = Boolean(raw.darkMode);
  if ("tuneEnabled" in raw) out.tuneEnabled = raw.tuneEnabled !== false;
  if ("brightness" in raw) out.brightness = darksideClamp(raw.brightness, 25, 150, DARKSIDE_DEFAULTS.brightness);
  if ("contrast" in raw) out.contrast = darksideClamp(raw.contrast, 50, 150, DARKSIDE_DEFAULTS.contrast);
  if ("warmth" in raw) out.warmth = darksideClamp(raw.warmth, 0, 80, DARKSIDE_DEFAULTS.warmth);
  if ("dim" in raw) out.dim = darksideClamp(raw.dim, 0, 70, DARKSIDE_DEFAULTS.dim);
  return out;
}

function darksideNormalizeOverrides(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = Object.create(null);
  for (const host of Object.keys(raw)) {
    if (!darksideIsSafeHostKey(host)) continue;
    out[host] = darksideNormalizeOverride(raw[host]);
  }
  return out;
}

function darksideNormalize(stored) {
  const raw = stored && typeof stored === "object" ? stored : {};
  return {
    enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : DARKSIDE_DEFAULTS.enabled,
    darkMode: raw.darkMode !== undefined ? Boolean(raw.darkMode) : DARKSIDE_DEFAULTS.darkMode,
    tuneEnabled: raw.tuneEnabled !== false,
    brightness: darksideClamp(raw.brightness, 25, 150, DARKSIDE_DEFAULTS.brightness),
    contrast: darksideClamp(raw.contrast, 50, 150, DARKSIDE_DEFAULTS.contrast),
    warmth: darksideClamp(raw.warmth, 0, 80, DARKSIDE_DEFAULTS.warmth),
    dim: darksideClamp(raw.dim, 0, 70, DARKSIDE_DEFAULTS.dim),
    autoNight: Boolean(raw.autoNight),
    autoNightStart: darksideNormalizeTime(raw.autoNightStart, DARKSIDE_DEFAULTS.autoNightStart),
    autoNightEnd: darksideNormalizeTime(raw.autoNightEnd, DARKSIDE_DEFAULTS.autoNightEnd),
    siteOverrides: darksideNormalizeOverrides(raw.siteOverrides),
  };
}

function darksideStoragePatch(prev, next) {
  const patch = {};
  for (const key of Object.keys(DARKSIDE_DEFAULTS)) {
    if (JSON.stringify(prev?.[key]) !== JSON.stringify(next[key])) {
      patch[key] = next[key];
    }
  }
  return patch;
}

function darksideMergeChanges(current, changes) {
  const next = { ...current };
  for (const key of Object.keys(changes || {})) {
    if (changes[key].newValue === undefined) delete next[key];
    else next[key] = changes[key].newValue;
  }
  return next;
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
  const combined = (brightnessVal / 100) * dimFactor;
  const safe = Number.isFinite(combined) ? combined : 1;
  // Filter brightness floors out on inverted pages (background already black).
  // Darken below 100% with an overlay so the slider keeps working to 25%.
  const filterBrightness = safe >= 1 ? safe : 1;
  const shade = safe >= 1 ? 0 : 1 - safe;
  const contrast = contrastVal / 100;
  const sepia = (warmthVal / 100) * 0.65;
  return {
    invert,
    hue: invert ? "180deg" : "0deg",
    brightness: filterBrightness.toFixed(3),
    shade: shade.toFixed(3),
    contrast: (Number.isFinite(contrast) ? contrast : 1).toFixed(3),
    sepia: (Number.isFinite(sepia) ? sepia : 0).toFixed(3),
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
