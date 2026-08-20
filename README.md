# Darkside

Darkside is a Chrome extension that makes any website easier on the eyes. It can invert a page into dark mode while keeping photos and videos looking normal, then let you tune brightness, contrast, warmth, and dim. Use a preset for a one-tap look, or save different settings per site.

Dark Mode is a switch: turn it on and the current page inverts. Sites that already look dark stay as they are until you turn Dark Mode on. Eye-care sliders still work even when invert is off.

This project is still in the works and unpublished. If you want to use it, clone the repo and run the extension locally — see [Run locally](#run-locally).

## UI

Popup — dark mode, this-site toggle, presets, and sliders:

<img src="docs/popup.png" alt="Darkside popup" width="360" />

Settings — global defaults, auto night, and site overrides:

<img src="docs/settings.png" alt="Darkside settings" width="720" />

## Run locally

1. Clone the repo:

   ```bash
   git clone git@github.com:dmendoza05/darkside.git
   cd darkside
   ```

2. Open Chrome and go to `chrome://extensions`
3. Turn on **Developer mode** (top right)
4. Click **Load unpacked** and select this `darkside` folder
5. Pin Darkside from the puzzle-piece menu and click the icon

Restricted pages (`chrome://`, the Chrome Web Store, and other extension pages) cannot be restyled.

After you change the code, click **Reload** on the Darkside card in `chrome://extensions`, then refresh the tab you are testing.

## Using it

- **Dark Mode** — invert the current page; images and video stay true-color
- **This site** — turn Darkside off for the current hostname
- **Presets** — Soft, Night, Sunset, Contrast, Reading
- **Sliders** — Brightness, Contrast, Warmth, Dim
- **Remember for this site** — keep slider/preset overrides for this hostname
- **Settings** (gear) — global defaults, auto-night window, and a list of site overrides

Keyboard shortcut: `Alt` + `Shift` + `D` toggles dark mode on the current tab. Change it at `chrome://extensions/shortcuts`.

A few canvas-heavy apps or unusual CSS pages may look off. Turn the site off in the popup, or use **Reset this site**.
