const darkModeEl = document.getElementById("darkMode");
const tuneEnabledEl = document.getElementById("tuneEnabled");
const siteEnabledEl = document.getElementById("siteEnabled");
const siteStateEl = document.getElementById("site-state");
const hostnameEl = document.getElementById("hostname");
const restrictedEl = document.getElementById("restricted");
const mainEl = document.getElementById("main");
const pageControlsEl = document.getElementById("page-controls");
const tunePanelEl = document.getElementById("tune-panel");
const slidersToggleEl = document.getElementById("sliders-toggle");
const presetsToggleEl = document.getElementById("presets-toggle");
const slidersBodyEl = document.getElementById("sliders-body");
const presetsBodyEl = document.getElementById("presets-body");
const alreadyDarkEl = document.getElementById("already-dark");
const alreadyDarkToggleEl = document.getElementById("already-dark-toggle");
const alreadyDarkDetailEl = document.getElementById("already-dark-detail");
const alreadyDarkReasonEl = document.getElementById("already-dark-reason");

const sliderIds = ["brightness", "contrast", "warmth", "dim"];

let hostname = "";
let restricted = true;
let stored = darksideNormalize({});
let saving = false;
let persistTimer = 0;

function debouncePersist(fn, ms) {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(fn, ms);
}

function cancelDebouncedPersist() {
  clearTimeout(persistTimer);
  persistTimer = 0;
}

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
  document.querySelectorAll(".presets button").forEach((btn) => {
    btn.disabled = !on;
  });
}

function fitPopup() {
  const html = document.documentElement;
  const body = document.body;
  const apply = () => {
    html.style.height = "auto";
    body.style.height = "auto";
    const height = Math.ceil(Math.max(body.scrollHeight, html.scrollHeight));
    html.style.height = `${height}px`;
    body.style.height = `${height}px`;
  };
  apply();
  requestAnimationFrame(apply);
}

function setTunePanel() {
  const siteOn = siteEnabledEl.checked;
  pageControlsEl.classList.toggle("is-disabled", !restricted && !siteOn);
  tunePanelEl.hidden = restricted || !(siteOn && tuneEnabledEl.checked);
  fitPopup();
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

function setAlreadyDarkHint(show, reason) {
  if (!alreadyDarkEl) return;
  alreadyDarkEl.hidden = !show;
  if (alreadyDarkReasonEl) {
    alreadyDarkReasonEl.textContent = reason || "dark theme";
  }
  if (!show) {
    alreadyDarkEl.classList.remove("is-open");
    if (alreadyDarkToggleEl) alreadyDarkToggleEl.setAttribute("aria-expanded", "false");
    if (alreadyDarkDetailEl) alreadyDarkDetailEl.hidden = true;
  }
  fitPopup();
}

async function refreshSkipHint() {
  if (!alreadyDarkEl || restricted || !hostname) {
    setAlreadyDarkHint(false);
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setAlreadyDarkHint(false);
      return;
    }
    const status = await chrome.tabs.sendMessage(tab.id, { type: "darkside-status" }, { frameId: 0 });
    setAlreadyDarkHint(Boolean(status?.skippedAlreadyDark), status?.reason);
  } catch {
    setAlreadyDarkHint(false);
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
  cancelDebouncedPersist();
  saving = true;
  const normalized = darksideNormalize(next);
  const patch = darksideStoragePatch(stored, normalized);
  stored = normalized;
  if (Object.keys(patch).length) {
    await chrome.storage.local.set(patch);
  }
  saving = false;
  if ("darkMode" in patch || "enabled" in patch || "siteOverrides" in patch) {
    setTimeout(refreshSkipHint, 120);
  }
}

async function previewTab(next) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || restricted) return;
    await chrome.tabs.sendMessage(
      tab.id,
      { type: "darkside-preview", effective: darksideEffective(next, hostname) },
      { frameId: 0 }
    );
  } catch {
    /* page has no content script */
  }
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
    setAlreadyDarkHint(false);
    fitPopup();
    return;
  }

  await refreshSkipHint();
  fitPopup();
}

siteEnabledEl.addEventListener("change", async () => {
  if (restricted) return;
  const enabled = siteEnabledEl.checked;
  siteStateEl.textContent = enabled ? "On" : "Off";
  setTunePanel();
  await persist(nextPayload({ enabled }));
});

alreadyDarkToggleEl?.addEventListener("click", () => {
  if (!alreadyDarkEl || alreadyDarkEl.hidden) return;
  const open = alreadyDarkEl.classList.toggle("is-open");
  alreadyDarkToggleEl.setAttribute("aria-expanded", String(open));
  if (alreadyDarkDetailEl) alreadyDarkDetailEl.hidden = !open;
  fitPopup();
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

function bindTuneSection(button, body) {
  if (!button || !body) return;
  button.addEventListener("click", () => {
    const section = button.closest(".tune-section");
    const open = section.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(open));
    body.hidden = !open;
    fitPopup();
  });
}

bindTuneSection(slidersToggleEl, slidersBodyEl);
bindTuneSection(presetsToggleEl, presetsBodyEl);

sliderIds.forEach((id) => {
  const el = document.getElementById(id);
  el.addEventListener("input", () => {
    if (restricted) return;
    setSlider(id, sliderValue(id));
    highlightPreset(currentSliders());
    const next = nextPayload();
    previewTab(next);
    debouncePersist(() => persist(nextPayload()), 200);
  });
  el.addEventListener("change", () => {
    if (restricted) return;
    cancelDebouncedPersist();
    persist(nextPayload());
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

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || saving || restricted) return;
  stored = darksideNormalize(darksideMergeChanges(stored, changes));
  paintForm(darksideEffective(stored, hostname));
});

load();
