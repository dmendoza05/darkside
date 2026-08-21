const enabledEl = document.getElementById("enabled");
const darkModeEl = document.getElementById("darkMode");
const tuneEnabledEl = document.getElementById("tuneEnabled");
const autoNightEl = document.getElementById("autoNight");
const autoNightStartEl = document.getElementById("autoNightStart");
const autoNightEndEl = document.getElementById("autoNightEnd");
const searchEl = document.getElementById("search");
const listEl = document.getElementById("site-list");
const emptyEl = document.getElementById("empty");

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
  const allowed = new Set(["settings", "sites", "help"]);
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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || saving) return;
  stored = darksideNormalize(darksideMergeChanges(stored, changes));
  paintGlobals();
  renderSites();
});

(async function init() {
  stored = darksideNormalize(await chrome.storage.local.get(null));
  paintGlobals();
  renderSites();
})();
