importScripts("shared/defaults.js");

async function ensureDefaults() {
  const stored = await chrome.storage.local.get(null);
  const next = darksideNormalize(stored);
  const toSet = {};
  for (const key of Object.keys(DARKSIDE_DEFAULTS)) {
    if (!(key in stored)) toSet[key] = next[key];
  }
  if (Object.keys(toSet).length) {
    await chrome.storage.local.set(toSet);
  }
  await syncBadge(next);
}

async function syncBadge(stored) {
  const settings = stored || darksideNormalize(await chrome.storage.local.get(null));
  const on = Boolean(settings.enabled);
  await chrome.action.setBadgeText({ text: on ? "" : "OFF" });
  await chrome.action.setBadgeBackgroundColor({ color: "#2a2a2a" });
  if (chrome.action.setBadgeTextColor) {
    await chrome.action.setBadgeTextColor({ color: "#F5C75D" });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaults();
});

chrome.runtime.onStartup.addListener(() => {
  ensureDefaults();
});

chrome.storage.onChanged.addListener(async (_changes, area) => {
  if (area !== "local") return;
  await syncBadge();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-dark") return;

  const stored = darksideNormalize(await chrome.storage.local.get(null));
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const hostname = tab?.url ? darksideHostnameFromUrl(tab.url) : "";
  const restricted = darksideIsRestrictedUrl(tab?.url);

  if (!restricted && hostname && stored.siteOverrides[hostname]) {
    const override = { ...stored.siteOverrides[hostname] };
    const current = override.darkMode ?? stored.darkMode;
    override.darkMode = !current;
    if (override.enabled === false) override.enabled = true;
    stored.siteOverrides[hostname] = override;
    await chrome.storage.local.set({ siteOverrides: stored.siteOverrides });
    return;
  }

  await chrome.storage.local.set({ darkMode: !stored.darkMode, enabled: true });
});

ensureDefaults();
