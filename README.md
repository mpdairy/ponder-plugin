# Ponder

**Automatically pauses videos after a set amount of playtime so you can actually think about what you just watched.**

Ever find yourself 3 hours deep into a YouTube binge without a single original thought? Ponder fixes that. It tracks how long your video has been playing and auto-pauses it after a configurable interval (default: 3 minutes), giving you a moment to reflect before you hit play again.

> This project was 100% vibe coded. The author didn't even read this README.

## How It Works

1. You open a video on a supported site (YouTube, Tubi, etc.)
2. Ponder quietly tracks actual playtime in the background
3. After your configured interval, it pauses the video and shows a "Time to Ponder" overlay
4. When you're done thinking, hit play — the timer resets and starts counting again
5. Pausing the video yourself doesn't count — only actual playtime is tracked

The toolbar icon changes to show whether Ponder is active (colorful thinker) or disabled (greyed out).

## Supported Sites

- YouTube
- Tubi
- More can be added via the module system (see [Extending Ponder](#extending-ponder) below)

## Browser Compatibility

Ponder is built as a **Manifest V3** Chrome extension. It works with:

- **Google Chrome** (recommended)
- **Microsoft Edge**
- **Brave**
- **Opera**
- **Vivaldi**
- **Arc**
- Any other **Chromium-based browser** that supports Manifest V3 extensions

**Not supported:** Firefox, Safari, or other non-Chromium browsers.

## Installation

Since Ponder isn't on the Chrome Web Store, you'll need to install it manually as an unpacked extension:

1. **Download or clone** this repository
2. Open your browser and go to `chrome://extensions` (or `edge://extensions` for Edge, `brave://extensions` for Brave, etc.)
3. Enable **Developer mode** using the toggle in the top-right corner
4. Click **"Load unpacked"**
5. Select the `ponder/` folder inside this repository (not the root folder — the `ponder/` subfolder)
6. Ponder should now appear in your extensions list with the thinker icon

### Updating

After pulling new changes or making edits:

1. Go to `chrome://extensions`
2. Find the Ponder card
3. Click the **reload** button (circular arrow icon)

### Pinning (recommended)

Click the puzzle piece icon in your toolbar and pin Ponder so you can see the icon and quickly toggle it on/off.

## Usage

Click the Ponder icon in your toolbar to open the settings popup:

- **Enable/Disable toggle** — Turn Ponder on or off globally
- **Playtime interval** — Set the minutes and seconds before auto-pause (minimum 10 seconds)

Settings are saved automatically and sync across your browser profile.

## Extending Ponder

Ponder uses a module system to support different sites. Each module is a small JS file that tells Ponder how to find and interact with the video player on a specific site.

### Adding a New Site Module

1. Copy `ponder/modules/_template.js` to `ponder/modules/your-site.js`
2. Fill in the required fields:
   - `name` — unique lowercase identifier (e.g. `'netflix'`)
   - `displayName` — human-readable name (e.g. `'Netflix'`)
   - `matchesSite(location)` — return `true` if the current page belongs to your site
   - `init(callbacks)` — find the `<video>` element and call `callbacks.onVideoFound(videoEl)`
3. Add your file to `manifest.json` in the `content_scripts[0].js` array (before `core/ponder-timer.js`)
4. Reload the extension

For detailed documentation, common patterns (SPA handling, MutationObserver, custom pause), and a full checklist, see [`ponder/docs/CREATING_MODULES.md`](ponder/docs/CREATING_MODULES.md).

### Quick Example

```js
PonderModuleRegistry.register({
  name: 'netflix',
  displayName: 'Netflix',
  _callbacks: null,

  matchesSite(location) {
    return location.hostname.includes('netflix.com');
  },

  init(callbacks) {
    this._callbacks = callbacks;
    const video = document.querySelector('video');
    if (video) callbacks.onVideoFound(video);
  }
});
```

## Project Structure

```
ponder/
  manifest.json          # Extension manifest (Manifest V3)
  background.js          # Service worker — defaults & icon management
  popup/                 # Settings UI
  core/                  # Timer, overlay, module registry
  modules/               # Site-specific modules (youtube, tubi, etc.)
    _template.js         # Template for creating new modules
  icons/                 # Extension icons
  docs/
    CREATING_MODULES.md  # Detailed module authoring guide
```

## License

Do whatever you want with it.
