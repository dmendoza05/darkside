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

  const invert = !restricted && hostname && stored.siteOverrides[hostname]
    ? !(stored.siteOverrides[hostname].darkMode ?? stored.darkMode)
    : !stored.darkMode;

  if (!restricted && hostname && stored.siteOverrides[hostname]) {
    const override = { ...stored.siteOverrides[hostname] };
    override.darkMode = invert;
    if (override.enabled === false) override.enabled = true;
    stored.siteOverrides[hostname] = override;
    await chrome.storage.local.set({ siteOverrides: stored.siteOverrides });
  } else {
    await chrome.storage.local.set({ darkMode: invert, enabled: true });
  }

  if (tab?.id && !restricted) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "darkside-user-invert", invert });
    } catch {
      /* no content script on this tab */
    }
  }
});

ensureDefaults();
