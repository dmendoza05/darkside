const darkModeEl = document.getElementById("darkMode");
const siteEnabledEl = document.getElementById("siteEnabled");
const siteStateEl = document.getElementById("site-state");
const hostnameEl = document.getElementById("hostname");
const rememberEl = document.getElementById("remember");
const restrictedEl = document.getElementById("restricted");
const mainEl = document.getElementById("main");
const slidersEl = document.getElementById("sliders");
const presetsEl = document.querySelector(".presets");

const sliderIds = ["brightness", "contrast", "warmth", "dim"];

let hostname = "";
let restricted = true;
let stored = darksideNormalize({});
let saving = false;

function sliderValue(id) {
  const el = document.getElementById(id);
  return Number(el.value);
}

function setSlider(id, value, suffix = "") {
  const el = document.getElementById(id);
  const label = document.getElementById(`${id}-val`);
  el.value = String(value);
  if (id === "brightness" || id === "contrast") {
    label.textContent = `${value}%`;
  } else {
    label.textContent = `${value}${suffix}`;
  }
}

function currentTune() {
  return {
    darkMode: darkModeEl.checked,
    brightness: sliderValue("brightness"),
    contrast: sliderValue("contrast"),
    warmth: sliderValue("warmth"),
    dim: sliderValue("dim"),
  };
}

function paintForm(effective, hasOverride) {
  darkModeEl.checked = Boolean(effective.darkMode);
  siteEnabledEl.checked = Boolean(effective.enabled);
  siteStateEl.textContent = effective.enabled ? "On" : "Off";
  rememberEl.checked = Boolean(hasOverride);
  setSlider("brightness", effective.brightness);
  setSlider("contrast", effective.contrast);
  setSlider("warmth", effective.warmth);
  setSlider("dim", effective.dim);
  slidersEl.classList.toggle("is-disabled", !effective.enabled);
  presetsEl.classList.toggle("is-disabled", !effective.enabled);
  highlightPreset(effective);
}

function highlightPreset(tune) {
  document.querySelectorAll(".presets button").forEach((btn) => {
    const preset = DARKSIDE_PRESETS[btn.dataset.preset];
    const match =
      preset &&
      preset.darkMode === Boolean(tune.darkMode) &&
      Number(preset.brightness) === Number(tune.brightness) &&
      Number(preset.contrast) === Number(tune.contrast) &&
      Number(preset.warmth) === Number(tune.warmth) &&
      Number(preset.dim) === Number(tune.dim);
    btn.classList.toggle("active", Boolean(match));
  });
}

function nextPayload(partial = {}, useOverride = rememberEl.checked) {
  const tune = { ...currentTune(), ...partial };
  const next = darksideNormalize(stored);

  if (restricted || !hostname) {
    return { ...next, ...tune };
  }

  if (!useOverride) {
    return { ...next, ...tune };
  }

  const existing = next.siteOverrides[hostname] || {};
  next.siteOverrides = {
    ...next.siteOverrides,
    [hostname]: {
      ...existing,
      ...tune,
      enabled: siteEnabledEl.checked,
    },
  };
  return next;
}

async function persist(next) {
  saving = true;
  stored = darksideNormalize(next);
  await chrome.storage.local.set(stored);
  saving = false;
}

async function load() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  restricted = darksideIsRestrictedUrl(tab?.url);
  hostname = restricted ? "" : darksideHostnameFromUrl(tab?.url);
  hostnameEl.textContent = hostname || "unavailable";

  if (restricted) {
    restrictedEl.hidden = false;
    mainEl.hidden = true;
    return;
  }

  stored = darksideNormalize(await chrome.storage.local.get(null));
  const effective = darksideEffective(stored, hostname);
  paintForm(effective, effective._hasOverride);
}

siteEnabledEl.addEventListener("change", async () => {
  const next = darksideNormalize(stored);
  const enabled = siteEnabledEl.checked;
  siteStateEl.textContent = enabled ? "On" : "Off";
  slidersEl.classList.toggle("is-disabled", !enabled);
  presetsEl.classList.toggle("is-disabled", !enabled);

  const existing = next.siteOverrides[hostname] || {};
  if (enabled) {
    if (Object.keys(existing).every((key) => key === "enabled")) {
      delete next.siteOverrides[hostname];
    } else {
      next.siteOverrides[hostname] = { ...existing, enabled: true };
    }
  } else {
    next.siteOverrides[hostname] = { ...existing, enabled: false };
    rememberEl.checked = true;
  }
  await persist(next);
});

darkModeEl.addEventListener("change", async () => {
  await persist(nextPayload({ darkMode: darkModeEl.checked }));
  highlightPreset(currentTune());
});

sliderIds.forEach((id) => {
  document.getElementById(id).addEventListener("input", async () => {
    setSlider(id, sliderValue(id));
    highlightPreset(currentTune());
    await persist(nextPayload());
  });
});

document.querySelectorAll(".presets button").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const preset = DARKSIDE_PRESETS[btn.dataset.preset];
    if (!preset) return;
    paintForm({ ...preset, enabled: siteEnabledEl.checked }, rememberEl.checked);
    await persist(nextPayload(preset));
  });
});

rememberEl.addEventListener("change", async () => {
  const next = darksideNormalize(stored);
  if (rememberEl.checked) {
    next.siteOverrides[hostname] = {
      ...(next.siteOverrides[hostname] || {}),
      ...currentTune(),
      enabled: siteEnabledEl.checked,
    };
  } else if (next.siteOverrides[hostname]) {
    delete next.siteOverrides[hostname];
  }
  await persist(next);
});

document.getElementById("reset-sliders").addEventListener("click", async () => {
  const defaults = {
    brightness: DARKSIDE_DEFAULTS.brightness,
    contrast: DARKSIDE_DEFAULTS.contrast,
    warmth: DARKSIDE_DEFAULTS.warmth,
    dim: DARKSIDE_DEFAULTS.dim,
  };
  setSlider("brightness", defaults.brightness);
  setSlider("contrast", defaults.contrast);
  setSlider("warmth", defaults.warmth);
  setSlider("dim", defaults.dim);
  highlightPreset({ ...currentTune(), ...defaults });
  await persist(nextPayload(defaults));
});

document.getElementById("reset-site").addEventListener("click", async () => {
  const next = darksideNormalize(stored);
  delete next.siteOverrides[hostname];
  rememberEl.checked = false;
  stored = next;
  await persist(next);
  paintForm(darksideEffective(next, hostname), false);
});

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== "local" || saving || restricted) return;
  chrome.storage.local.get(null, (value) => {
    stored = darksideNormalize(value);
    const effective = darksideEffective(stored, hostname);
    paintForm(effective, effective._hasOverride);
  });
});

load();
