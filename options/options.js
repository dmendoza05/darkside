const enabledEl = document.getElementById("enabled");
const darkModeEl = document.getElementById("darkMode");
const autoNightEl = document.getElementById("autoNight");
const autoNightStartEl = document.getElementById("autoNightStart");
const autoNightEndEl = document.getElementById("autoNightEnd");
const searchEl = document.getElementById("search");
const listEl = document.getElementById("site-list");
const emptyEl = document.getElementById("empty");

let stored = darksideNormalize({});
let saving = false;

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
      <span class="host"></span>
      <span class="state"></span>
      <label class="mini-toggle">
        <input type="checkbox" class="site-on" />
        <span class="switch small"></span>
      </label>
      <button type="button">Remove</button>
    `;
    item.querySelector(".host").textContent = host;
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
  saving = true;
  stored = darksideNormalize(next);
  await chrome.storage.local.set(stored);
  saving = false;
}

async function saveGlobals() {
  const next = darksideNormalize(stored);
  next.enabled = enabledEl.checked;
  next.darkMode = darkModeEl.checked;
  next.autoNight = autoNightEl.checked;
  next.autoNightStart = autoNightStartEl.value || DARKSIDE_DEFAULTS.autoNightStart;
  next.autoNightEnd = autoNightEndEl.value || DARKSIDE_DEFAULTS.autoNightEnd;
  next.brightness = Number(document.getElementById("brightness").value);
  next.contrast = Number(document.getElementById("contrast").value);
  next.warmth = Number(document.getElementById("warmth").value);
  next.dim = Number(document.getElementById("dim").value);
  await persist(next);
}

["enabled", "darkMode", "autoNight", "autoNightStart", "autoNightEnd"].forEach((id) => {
  document.getElementById(id).addEventListener("change", saveGlobals);
});

["brightness", "contrast", "warmth", "dim"].forEach((id) => {
  document.getElementById(id).addEventListener("input", () => {
    setSlider(id, Number(document.getElementById(id).value));
    saveGlobals();
  });
});

searchEl.addEventListener("input", renderSites);

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== "local" || saving) return;
  chrome.storage.local.get(null, (value) => {
    stored = darksideNormalize(value);
    paintGlobals();
    renderSites();
  });
});

(async function init() {
  stored = darksideNormalize(await chrome.storage.local.get(null));
  paintGlobals();
  renderSites();
})();
