const enabledEl = document.getElementById("enabled");
const darkModeEl = document.getElementById("darkMode");
const tuneEnabledEl = document.getElementById("tuneEnabled");
const autoNightEl = document.getElementById("autoNight");
const autoNightStartEl = document.getElementById("autoNightStart");
const autoNightEndEl = document.getElementById("autoNightEnd");
const searchEl = document.getElementById("search");
const listEl = document.getElementById("site-list");
const emptyEl = document.getElementById("empty");
const showDefaultPresetsEl = document.getElementById("showDefaultPresets");
const presetListEl = document.getElementById("preset-list");
const presetEmptyEl = document.getElementById("preset-empty");
const newPresetNameEl = document.getElementById("new-preset-name");
const addPresetEl = document.getElementById("add-preset");
const newPresetFormEl = document.getElementById("new-preset-dialog");
const saveNewPresetEl = document.getElementById("save-new-preset");
const closeNewPresetEl = document.getElementById("close-new-preset");
const cancelNewPresetEl = document.getElementById("cancel-new-preset");
const newPresetSliderIds = ["new-brightness", "new-contrast", "new-warmth", "new-dim"];
const editingPresetIds = new Set();

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

function showTab(name) {
  const allowed = new Set(["settings", "sites", "presets", "help"]);
  const tab = allowed.has(name) ? name : "settings";
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    const active = panel.id === `panel-${tab}`;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
  if (location.hash !== `#${tab}`) {
    try {
      history.replaceState(null, "", `#${tab}`);
    } catch {
      /* ignore */
    }
  }
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});

window.addEventListener("hashchange", () => {
  showTab(location.hash.replace("#", ""));
});

showTab(location.hash.replace("#", ""));

const versionEl = document.getElementById("app-version");
if (versionEl && chrome.runtime?.getManifest) {
  versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
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

function paintGlobals() {
  enabledEl.checked = Boolean(stored.enabled);
  darkModeEl.checked = Boolean(stored.darkMode);
  tuneEnabledEl.checked = Boolean(stored.tuneEnabled);
  autoNightEl.checked = Boolean(stored.autoNight);
  autoNightStartEl.value = stored.autoNightStart;
  autoNightEndEl.value = stored.autoNightEnd;
  setSlider("brightness", stored.brightness);
  setSlider("contrast", stored.contrast);
  setSlider("warmth", stored.warmth);
  setSlider("dim", stored.dim);
  if (showDefaultPresetsEl) showDefaultPresetsEl.checked = stored.showDefaultPresets !== false;
}

function setNewPresetSlider(id, value) {
  const el = document.getElementById(id);
  const label = document.getElementById(`${id}-val`);
  if (!el || !label) return;
  el.value = String(value);
  if (id === "new-brightness" || id === "new-contrast") {
    label.textContent = `${value}%`;
  } else {
    label.textContent = String(value);
  }
}

function currentNewPresetSliders() {
  return {
    brightness: Number(document.getElementById("new-brightness")?.value),
    contrast: Number(document.getElementById("new-contrast")?.value),
    warmth: Number(document.getElementById("new-warmth")?.value),
    dim: Number(document.getElementById("new-dim")?.value),
  };
}

function setNewPresetFormOpen(open) {
  if (!newPresetFormEl || !addPresetEl) return;
  const atLimit = (stored.customPresets || []).length >= DARKSIDE_MAX_CUSTOM_PRESETS;
  if (open && atLimit) open = false;
  if (open) {
    if (!newPresetFormEl.open) newPresetFormEl.showModal();
    setNewPresetSlider("new-brightness", stored.brightness);
    setNewPresetSlider("new-contrast", stored.contrast);
    setNewPresetSlider("new-warmth", stored.warmth);
    setNewPresetSlider("new-dim", stored.dim);
    if (newPresetNameEl) {
      if (!newPresetNameEl.value.trim()) {
        newPresetNameEl.placeholder = `Custom ${(stored.customPresets || []).length + 1}`;
      }
      newPresetNameEl.focus();
      newPresetNameEl.select();
    }
  } else if (newPresetFormEl.open) {
    newPresetFormEl.close();
  }
  addPresetEl.setAttribute("aria-expanded", String(Boolean(newPresetFormEl.open)));
}

function formatPresetValue(key, value) {
  return key === "brightness" || key === "contrast" ? `${value}%` : String(value);
}

function renderCustomPresets() {
  if (!presetListEl || !presetEmptyEl || !addPresetEl) return;
  const presets = stored.customPresets || [];
  const atLimit = presets.length >= DARKSIDE_MAX_CUSTOM_PRESETS;
  presetListEl.replaceChildren();

  presets.forEach((preset) => {
    const item = document.createElement("li");
    item.className = "preset-card";

    const head = document.createElement("div");
    head.className = "preset-head";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.maxLength = 24;
    nameInput.value = preset.name;
    nameInput.setAttribute("aria-label", "Preset name");
    nameInput.addEventListener("change", async () => {
      const name = nameInput.value.trim().slice(0, 24) || "Custom";
      nameInput.value = name;
      await updateCustomPreset(preset.id, { name });
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "preset-edit";
    const editing = editingPresetIds.has(preset.id);
    editBtn.textContent = editing ? "Done" : "Edit";
    editBtn.setAttribute("aria-expanded", String(editing));
    editBtn.setAttribute("aria-controls", `preset-sliders-${preset.id}`);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "preset-remove";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", async () => {
      const next = darksideNormalize(stored);
      next.customPresets = next.customPresets.filter((item) => item.id !== preset.id);
      editingPresetIds.delete(preset.id);
      await persist(next);
      renderCustomPresets();
    });

    head.append(nameInput, editBtn, removeBtn);

    const sliders = document.createElement("div");
    sliders.className = "sliders";
    sliders.id = `preset-sliders-${preset.id}`;
    sliders.hidden = !editing;
    const sliderDefs = [
      { key: "brightness", label: "Brightness", min: 25, max: 150 },
      { key: "contrast", label: "Contrast", min: 50, max: 150 },
      { key: "warmth", label: "Warmth", min: 0, max: 80 },
      { key: "dim", label: "Dim", min: 0, max: 70 },
    ];

    sliderDefs.forEach((def) => {
      const label = document.createElement("label");
      const span = document.createElement("span");
      const valueEl = document.createElement("b");
      valueEl.textContent = formatPresetValue(def.key, preset[def.key]);
      span.append(document.createTextNode(`${def.label} `), valueEl);

      const input = document.createElement("input");
      input.type = "range";
      input.min = String(def.min);
      input.max = String(def.max);
      input.value = String(preset[def.key]);
      input.addEventListener("input", () => {
        const value = Number(input.value);
        valueEl.textContent = formatPresetValue(def.key, value);
        debouncePersist(() => updateCustomPreset(preset.id, { [def.key]: value }), 200);
      });
      input.addEventListener("change", () => {
        cancelDebouncedPersist();
        updateCustomPreset(preset.id, { [def.key]: Number(input.value) });
      });

      label.append(span, input);
      sliders.appendChild(label);
    });

    editBtn.addEventListener("click", () => {
      const open = sliders.hidden;
      sliders.hidden = !open;
      item.classList.toggle("is-editing", open);
      editBtn.textContent = open ? "Done" : "Edit";
      editBtn.setAttribute("aria-expanded", String(open));
      if (open) editingPresetIds.add(preset.id);
      else editingPresetIds.delete(preset.id);
    });

    item.classList.toggle("is-editing", editing);
    item.append(head, sliders);
    presetListEl.appendChild(item);
  });

  presetEmptyEl.classList.toggle("show", presets.length === 0);
  addPresetEl.disabled = atLimit;
  if (newPresetNameEl) newPresetNameEl.disabled = atLimit;
  if (saveNewPresetEl) saveNewPresetEl.disabled = atLimit;
  newPresetSliderIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = atLimit;
  });
  if (atLimit) setNewPresetFormOpen(false);
}

async function updateCustomPreset(id, partial) {
  const next = darksideNormalize(stored);
  next.customPresets = next.customPresets.map((preset) =>
    preset.id === id ? { ...preset, ...partial } : preset
  );
  await persist(next);
}

function renderSites() {
  const query = searchEl.value.trim().toLowerCase();
  const hosts = Object.keys(stored.siteOverrides || {}).sort();
  const filtered = hosts.filter((host) => host.toLowerCase().includes(query));
  listEl.innerHTML = "";

  filtered.forEach((host) => {
    const override = stored.siteOverrides[host] || {};
    const enabled = override.enabled !== false;
    const item = document.createElement("li");
    item.innerHTML = `
      <div class="site-meta">
        <span class="host"></span>
        <span class="tune"></span>
      </div>
      <span class="state"></span>
      <label class="mini-toggle">
        <input type="checkbox" class="site-on" />
        <span class="switch small"></span>
      </label>
      <button type="button">Remove</button>
    `;
    item.querySelector(".host").textContent = host;
    const brightness = override.brightness ?? stored.brightness;
    const contrast = override.contrast ?? stored.contrast;
    const warmth = override.warmth ?? stored.warmth;
    const dim = override.dim ?? stored.dim;
    item.querySelector(".tune").textContent = `B ${brightness} · C ${contrast} · W ${warmth} · D ${dim}`;
    item.querySelector(".state").textContent = enabled ? "On" : "Off";
    const toggle = item.querySelector(".site-on");
    toggle.checked = enabled;
    toggle.addEventListener("change", async () => {
      const next = darksideNormalize(stored);
      next.siteOverrides[host] = {
        ...(next.siteOverrides[host] || {}),
        enabled: toggle.checked,
      };
      await persist(next);
      renderSites();
    });
    item.querySelector("button").addEventListener("click", async () => {
      const next = darksideNormalize(stored);
      delete next.siteOverrides[host];
      await persist(next);
      renderSites();
    });
    listEl.appendChild(item);
  });

  emptyEl.classList.toggle("show", filtered.length === 0);
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
}

async function saveGlobals() {
  const next = darksideNormalize(stored);
  next.enabled = enabledEl.checked;
  next.darkMode = darkModeEl.checked;
  next.tuneEnabled = tuneEnabledEl.checked;
  next.autoNight = autoNightEl.checked;
  next.autoNightStart = autoNightStartEl.value || DARKSIDE_DEFAULTS.autoNightStart;
  next.autoNightEnd = autoNightEndEl.value || DARKSIDE_DEFAULTS.autoNightEnd;
  next.brightness = Number(document.getElementById("brightness").value);
  next.contrast = Number(document.getElementById("contrast").value);
  next.warmth = Number(document.getElementById("warmth").value);
  next.dim = Number(document.getElementById("dim").value);
  await persist(next);
}

["enabled", "darkMode", "tuneEnabled", "autoNight", "autoNightStart", "autoNightEnd"].forEach((id) => {
  document.getElementById(id).addEventListener("change", saveGlobals);
});

["brightness", "contrast", "warmth", "dim"].forEach((id) => {
  const el = document.getElementById(id);
  el.addEventListener("input", () => {
    setSlider(id, Number(el.value));
    debouncePersist(saveGlobals, 200);
  });
  el.addEventListener("change", () => {
    cancelDebouncedPersist();
    saveGlobals();
  });
});

searchEl.addEventListener("input", renderSites);

showDefaultPresetsEl?.addEventListener("change", async () => {
  const next = darksideNormalize(stored);
  next.showDefaultPresets = showDefaultPresetsEl.checked;
  await persist(next);
});

async function addCustomPreset() {
  const next = darksideNormalize(stored);
  if (next.customPresets.length >= DARKSIDE_MAX_CUSTOM_PRESETS) return;
  const name =
    (newPresetNameEl?.value || "").trim().slice(0, 24) || `Custom ${next.customPresets.length + 1}`;
  next.customPresets = [
    ...next.customPresets,
    {
      id: darksideNewPresetId(next.customPresets),
      name,
      ...currentNewPresetSliders(),
    },
  ];
  if (newPresetNameEl) newPresetNameEl.value = "";
  setNewPresetFormOpen(false);
  await persist(next);
  renderCustomPresets();
}

addPresetEl?.addEventListener("click", () => {
  if ((stored.customPresets || []).length >= DARKSIDE_MAX_CUSTOM_PRESETS) return;
  setNewPresetFormOpen(true);
});

saveNewPresetEl?.addEventListener("click", () => {
  addCustomPreset();
});

closeNewPresetEl?.addEventListener("click", () => {
  setNewPresetFormOpen(false);
});

cancelNewPresetEl?.addEventListener("click", () => {
  setNewPresetFormOpen(false);
});

newPresetFormEl?.addEventListener("click", (event) => {
  if (event.target === newPresetFormEl) setNewPresetFormOpen(false);
});

newPresetFormEl?.addEventListener("close", () => {
  addPresetEl?.setAttribute("aria-expanded", "false");
  if (newPresetNameEl) newPresetNameEl.value = "";
});

newPresetNameEl?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  addCustomPreset();
});

newPresetSliderIds.forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", () => {
    setNewPresetSlider(id, Number(el.value));
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || saving) return;
  stored = darksideNormalize(darksideMergeChanges(stored, changes));
  paintGlobals();
  renderSites();
  renderCustomPresets();
});

(async function init() {
  stored = darksideNormalize(await chrome.storage.local.get(null));
  paintGlobals();
  renderSites();
  renderCustomPresets();
})();
