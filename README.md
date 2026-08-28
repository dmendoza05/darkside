# Darkside

Darkside is a Chrome extension that makes any website easier on the eyes. Turn on Dark Mode to invert a page (photos and videos stay true-color), or leave invert off and only use brightness, contrast, warmth, and dim. Presets change those eye-care sliders and do not turn invert on. Each site keeps its own slider and Dark Mode settings.

This project is still in the works and unpublished. If you want to use it, clone the repo and run the extension locally — see [Run locally](#run-locally).

## UI

Popup — dark mode, this-site toggle, presets, and sliders:

<img src="docs/popup.png" alt="Darkside popup" width="360" />

Settings — global defaults, site preferences, custom presets, and help:

<table>
  <tr>
    <td align="center"><img src="docs/settings.png" alt="Settings" width="400" /><br/>Settings</td>
    <td align="center"><img src="docs/site-preferences.png" alt="Site Preferences" width="400" /><br/>Site Preferences</td>
  </tr>
  <tr>
    <td align="center"><img src="docs/custom-presets.png" alt="Custom Presets" width="400" /><br/>Custom Presets</td>
    <td align="center"><img src="docs/help.png" alt="Help" width="400" /><br/>Help</td>
  </tr>
</table>

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

## Publishing

Chrome Web Store uploads are a ZIP with `manifest.json` at the root, and only the files the extension needs to run. `"version"` in `manifest.json` must be 1–4 integers (for example `1.0.0`). Each new version has to be higher than the last.

**Locally** (needs `python3` and `zip`):

```bash
bash scripts/package-extension.sh
```

That writes `dist/darkside-<version>.zip`. Load the unzipped folder as an unpacked extension and try it before you upload.

**On GitHub:** push a `release/*` branch (for example `release/1.0.1`). Actions checks the version, bumps it if that number was already released, and publishes a new [GitHub Release](https://github.com/dmendoza05/darkside/releases) with the ZIP. Existing releases are left alone.

Upload that ZIP in the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).

## Browser Extension

- **Dark Mode** — invert the current page; images and video stay true-color
- **This site** — turn Darkside off for the current hostname
- **Presets** — Soft, Night, Sunset, Contrast, Reading (eye-care only; does not turn on invert)
- **Sliders** — Brightness, Contrast, Warmth, Dim (work with Dark Mode off). Changes save for the current site
- **Settings** (gear) — global defaults, auto-night window, and a list of per-site settings

Keyboard shortcut: `Alt` + `Shift` + `D` toggles dark mode on the current tab. Change it at `chrome://extensions/shortcuts`.

A few canvas-heavy apps or unusual CSS pages may look off. Turn the site off in the popup, or remove it under Settings → Site Preferences.

## License

MIT. See [LICENSE](LICENSE).

<a href="https://www.buymeacoffee.com/deamondoza"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=deamondoza&button_colour=ceba36&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00" /></a>