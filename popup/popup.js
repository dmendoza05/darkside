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
const presetsEl = document.querySelector(".presets");
const presetsEmptyEl = document.getElementById("presets-empty");
const createPresetEl = document.getElementById("create-preset");
const createPresetFormEl = document.getElementById("create-preset-form");
const createPresetNameEl = document.getElementById("create-preset-name");
const savePresetEl = document.getElementById("save-preset");

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
  setCreatePresetInteractive(on);
  document.querySelectorAll(".presets button").forEach((btn) => {
    btn.disabled = !on;
  });
}

function setCreatePresetInteractive(on) {
  const atLimit = atCustomPresetLimit();
  if (createPresetEl) createPresetEl.disabled = !on || atLimit;
  if (createPresetNameEl) createPresetNameEl.disabled = !on || atLimit;
  if (savePresetEl) savePresetEl.disabled = !on || atLimit;
  if ((!on || atLimit) && createPresetFormEl && !createPresetFormEl.hidden) {
    setCreatePresetFormOpen(false);
  }
}

function setCreatePresetFormOpen(open) {
  if (!createPresetFormEl || !createPresetEl) return;
  createPresetFormEl.hidden = !open;
  createPresetEl.setAttribute("aria-expanded", String(open));
  if (open && createPresetNameEl) {
    if (!createPresetNameEl.value.trim()) {
      createPresetNameEl.value = `Custom ${(stored.customPresets || []).length + 1}`;
    }
    createPresetNameEl.focus();
    createPresetNameEl.select();
  }
  fitPopup();
}

function atCustomPresetLimit() {
  return (stored.customPresets || []).length >= DARKSIDE_MAX_CUSTOM_PRESETS;
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
  renderPresets();
  setTunePanel();
  highlightPreset(effective);
}

function renderPresets() {
  if (!presetsEl) return;
  const listed = darksideListedPresets(stored);
  const interactive = !restricted;
  presetsEl.replaceChildren();
  listed.forEach((preset) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.preset = preset.id;
    btn.textContent = preset.name;
    btn.disabled = !interactive;
    btn.addEventListener("click", () => applyPreset(preset.id));
    presetsEl.appendChild(btn);
  });
  if (presetsEmptyEl) presetsEmptyEl.hidden = listed.length > 0;
  setCreatePresetInteractive(interactive);
}

function highlightPreset(tune) {
  document.querySelectorAll(".presets button").forEach((btn) => {
    const preset = darksidePresetById(stored, btn.dataset.preset);
    const values = darksidePresetTune(preset);
    const match =
      values &&
      Number(values.brightness) === Number(tune.brightness) &&
      Number(values.contrast) === Number(tune.contrast) &&
      Number(values.warmth) === Number(tune.warmth) &&
      Number(values.dim) === Number(tune.dim);
    btn.classList.toggle("active", Boolean(match));
  });
}

async function applyPreset(id) {
  if (restricted) return;
  const values = darksidePresetTune(darksidePresetById(stored, id));
  if (!values) return;
  setSlider("brightness", values.brightness);
  setSlider("contrast", values.contrast);
  setSlider("warmth", values.warmth);
  setSlider("dim", values.dim);
  highlightPreset(values);
  await persist(nextPayload(values));
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

createPresetEl?.addEventListener("click", () => {
  if (restricted || atCustomPresetLimit()) return;
  setCreatePresetFormOpen(createPresetFormEl.hidden);
});

async function saveCreatedPreset() {
  if (restricted || atCustomPresetLimit()) return;
  const name = (createPresetNameEl?.value || "").trim().slice(0, 24);
  if (!name) {
    createPresetNameEl?.focus();
    return;
  }
  const next = darksideNormalize(stored);
  next.customPresets = [
    ...next.customPresets,
    { id: darksideNewPresetId(next.customPresets), name, ...currentSliders() },
  ];
  if (createPresetNameEl) createPresetNameEl.value = "";
  setCreatePresetFormOpen(false);
  await persist(next);
  renderPresets();
  highlightPreset(currentSliders());
  fitPopup();
}

savePresetEl?.addEventListener("click", () => {
  saveCreatedPreset();
});

createPresetNameEl?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  saveCreatedPreset();
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
