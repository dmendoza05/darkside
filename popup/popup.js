const darkModeEl = document.getElementById("darkMode");
const tuneEnabledEl = document.getElementById("tuneEnabled");
const siteEnabledEl = document.getElementById("siteEnabled");
const siteStateEl = document.getElementById("site-state");
const hostnameEl = document.getElementById("hostname");
const restrictedEl = document.getElementById("restricted");
const mainEl = document.getElementById("main");
const pageControlsEl = document.getElementById("page-controls");
const tunePanelEl = document.getElementById("tune-panel");
const alreadyDarkEl = document.getElementById("already-dark");

const sliderIds = ["brightness", "contrast", "warmth", "dim"];

let hostname = "";
let restricted = true;
let stored = darksideNormalize({});
let saving = false;

function sliderValue(id) {
  const el = document.getElementById(id);
  return Number(el.value);
}

function setSlider(id, value) {
  const el = document.getElementById(id);
  const label = document.getElementById(`${id}-val`);
  el.value = String(value);
  if (id === "brightness" || id === "contrast") {
    label.textContent = `${value}%`;
  } else {
    label.textContent = String(value);
  }
}

function currentSliders() {
  return {
    brightness: sliderValue("brightness"),
    contrast: sliderValue("contrast"),
    warmth: sliderValue("warmth"),
    dim: sliderValue("dim"),
  };
}

function setInteractive(on) {
  siteEnabledEl.disabled = !on;
  darkModeEl.disabled = !on;
  tuneEnabledEl.disabled = !on;
  sliderIds.forEach((id) => {
    document.getElementById(id).disabled = !on;
  });
  document.getElementById("reset-sliders").disabled = !on;
  document.getElementById("reset-site").disabled = !on;
  document.querySelectorAll(".presets button").forEach((btn) => {
    btn.disabled = !on;
  });
}

function setTunePanel() {
  const siteOn = siteEnabledEl.checked;
  pageControlsEl.classList.toggle("is-disabled", !restricted && !siteOn);
  tunePanelEl.hidden = restricted || !(siteOn && tuneEnabledEl.checked);
}

function paintForm(effective) {
  darkModeEl.checked = Boolean(effective.darkMode);
  tuneEnabledEl.checked = Boolean(effective.tuneEnabled);
  siteEnabledEl.checked = Boolean(effective.enabled);
  siteStateEl.textContent = effective.enabled ? "On" : "Off";
  setSlider("brightness", effective.brightness);
  setSlider("contrast", effective.contrast);
  setSlider("warmth", effective.warmth);
  setSlider("dim", effective.dim);
  setTunePanel();
  highlightPreset(effective);
}

function highlightPreset(tune) {
  document.querySelectorAll(".presets button").forEach((btn) => {
    const preset = DARKSIDE_PRESETS[btn.dataset.preset];
    const match =
      preset &&
      Number(preset.brightness) === Number(tune.brightness) &&
      Number(preset.contrast) === Number(tune.contrast) &&
      Number(preset.warmth) === Number(tune.warmth) &&
      Number(preset.dim) === Number(tune.dim);
    btn.classList.toggle("active", Boolean(match));
  });
}

function nextPayload(partial = {}) {
  const tune = {
    ...currentSliders(),
    darkMode: darkModeEl.checked,
    tuneEnabled: tuneEnabledEl.checked,
    ...partial,
  };
  const next = darksideNormalize(stored);

  if (restricted || !hostname) {
    const { enabled: _ignored, ...globalTune } = tune;
    return { ...next, ...globalTune };
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

async function refreshSkipHint() {
  if (!alreadyDarkEl || restricted || !hostname) {
    if (alreadyDarkEl) alreadyDarkEl.hidden = true;
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      alreadyDarkEl.hidden = true;
      return;
    }
    const status = await chrome.tabs.sendMessage(tab.id, { type: "darkside-status" }, { frameId: 0 });
    alreadyDarkEl.hidden = !status?.skippedAlreadyDark;
    if (typeof status?.invert === "boolean") {
      darkModeEl.checked = status.invert;
    }
  } catch {
    alreadyDarkEl.hidden = true;
  }
}

async function tellTabInvert(invert) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await chrome.tabs.sendMessage(
      tab.id,
      { type: "darkside-user-invert", invert: Boolean(invert) },
      { frameId: 0 }
    );
  } catch {
    /* page has no content script */
  }
}

async function persist(next) {
  saving = true;
  stored = darksideNormalize(next);
  await chrome.storage.local.set(stored);
  saving = false;
  setTimeout(refreshSkipHint, 120);
}

async function load() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  restricted = darksideIsRestrictedUrl(tab?.url);
  hostname = restricted ? "" : darksideHostnameFromUrl(tab?.url);
  hostnameEl.textContent = darksideDisplayHost(tab?.url);

  stored = darksideNormalize(await chrome.storage.local.get(null));
  paintForm(darksideEffective(stored, hostname));

  restrictedEl.hidden = !restricted;
  mainEl.classList.toggle("is-restricted", restricted);
  setInteractive(!restricted);

  if (restricted) {
    alreadyDarkEl.hidden = true;
    return;
  }

  await refreshSkipHint();
}

siteEnabledEl.addEventListener("change", async () => {
  if (restricted) return;
  const enabled = siteEnabledEl.checked;
  siteStateEl.textContent = enabled ? "On" : "Off";
  setTunePanel();
  await persist(nextPayload({ enabled }));
});

darkModeEl.addEventListener("change", async () => {
  if (restricted) return;
  await persist(nextPayload({ darkMode: darkModeEl.checked }));
  await tellTabInvert(darkModeEl.checked);
});

tuneEnabledEl.addEventListener("change", async () => {
  if (restricted) return;
  setTunePanel();
  await persist(nextPayload({ tuneEnabled: tuneEnabledEl.checked }));
});

sliderIds.forEach((id) => {
  document.getElementById(id).addEventListener("input", async () => {
    if (restricted) return;
    setSlider(id, sliderValue(id));
    highlightPreset(currentSliders());
    await persist(nextPayload());
  });
});

document.querySelectorAll(".presets button").forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (restricted) return;
    const preset = DARKSIDE_PRESETS[btn.dataset.preset];
    if (!preset) return;
    setSlider("brightness", preset.brightness);
    setSlider("contrast", preset.contrast);
    setSlider("warmth", preset.warmth);
    setSlider("dim", preset.dim);
    highlightPreset(preset);
    await persist(nextPayload(preset));
  });
});

document.getElementById("reset-sliders").addEventListener("click", async () => {
  if (restricted) return;
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
  highlightPreset(defaults);
  await persist(nextPayload(defaults));
});

document.getElementById("reset-site").addEventListener("click", async () => {
  if (restricted || !hostname) return;
  const next = darksideNormalize(stored);
  delete next.siteOverrides[hostname];
  stored = next;
  await persist(next);
  paintForm(darksideEffective(next, hostname));
});

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== "local" || saving || restricted) return;
  chrome.storage.local.get(null, (value) => {
    stored = darksideNormalize(value);
    paintForm(darksideEffective(stored, hostname));
  });
});

load();
