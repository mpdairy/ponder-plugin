# Creating Ponder Modules

This guide explains how to add support for a new website to the Ponder extension. Each supported site is a "module" — a small JavaScript file that tells Ponder how to find and interact with the video player on that site.

## Quick Start

1. Copy `modules/_template.js` to `modules/your-site.js`
2. Fill in the required fields (see below)
3. Add your file to `manifest.json` in the `content_scripts[0].js` array
4. Reload the extension in `chrome://extensions`

## Module Interface

Every module must call `PonderModuleRegistry.register({ ... })` with an object containing these fields:

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Unique identifier, lowercase, no spaces (e.g. `'netflix'`) |
| `displayName` | `string` | Human-readable name for logs (e.g. `'Netflix'`) |
| `matchesSite(location)` | `function → boolean` | Returns `true` if this module handles the current page. Receives `window.location`. |
| `init(callbacks)` | `function` | Called when the module is activated. Must find the `<video>` element and call `callbacks.onVideoFound(videoEl)`. |

### Callbacks Object (passed to `init`)

Your `init` function receives a `callbacks` object with three methods:

| Callback | When to call it |
|----------|----------------|
| `callbacks.onVideoFound(videoEl)` | When you first locate the `<video>` element on the page |
| `callbacks.onVideoChanged(videoEl)` | When the video element changes (e.g. SPA navigation to a different video) |
| `callbacks.onVideoLost()` | When the video is no longer present (e.g. user navigated away from the player) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `pause()` | `function` | Custom pause logic. Use this if the site requires clicking a specific button or calling a site API instead of `video.pause()`. If omitted, the core calls `video.pause()` directly. |
| `getOverlayContainer()` | `function → HTMLElement\|null` | Returns the DOM element where the "Time to Ponder" overlay should be placed. If omitted or returns null, the overlay is placed on the video's parent element. |
| `destroy()` | `function` | Called when the module is being deactivated. Clean up any observers, intervals, and event listeners here. |

## How the Core Works

Understanding the core helps you write better modules:

1. **Module selection**: On page load, the core iterates through all registered modules and calls `matchesSite()`. The first module that returns `true` is activated.

2. **Timer**: Once you call `onVideoFound(video)`, the core attaches a `timeupdate` listener to the video. It accumulates the actual played time (ignoring seeks, pauses, and buffering). When accumulated time reaches the user's configured limit, it auto-pauses.

3. **Overlay**: On auto-pause, the core shows a "Time to Ponder" overlay on the container you provide (or the video's parent). The overlay uses `pointer-events: none` so users can click through it to hit play.

4. **Reset**: After auto-pausing, the timer resets to zero and starts counting again on the next play.

## Common Patterns

### Standard Sites (simple DOM)

For sites with a standard HTML5 video player and no SPA navigation:

```js
PonderModuleRegistry.register({
  name: 'example',
  displayName: 'Example',
  _callbacks: null,
  _observer: null,
  _currentVideo: null,

  matchesSite(location) {
    return location.hostname.includes('example.com');
  },

  init(callbacks) {
    this._callbacks = callbacks;
    const video = document.querySelector('video');
    if (video) {
      this._currentVideo = video;
      callbacks.onVideoFound(video);
    }
  }
});
```

### SPA Sites (dynamic navigation)

For single-page apps where the URL changes without a full page reload (like YouTube):

```js
init(callbacks) {
  this._callbacks = callbacks;

  // Watch for URL changes
  this._lastUrl = location.href;
  this._pollInterval = setInterval(() => {
    if (location.href !== this._lastUrl) {
      this._lastUrl = location.href;
      this._onNavigate();
    }
  }, 1000);

  this._onNavigate();
},

_onNavigate() {
  const video = document.querySelector('video');
  if (video && video !== this._currentVideo) {
    this._setVideo(video);
  } else if (!video && this._currentVideo) {
    this._currentVideo = null;
    this._callbacks.onVideoLost();
  }
}
```

Some SPAs fire custom events (YouTube fires `yt-navigate-finish`). Listen for those if available — it's more reliable than polling.

### Late-Loading Videos (MutationObserver)

For sites where the video element is added to the DOM after page load:

```js
init(callbacks) {
  this._callbacks = callbacks;

  this._observer = new MutationObserver(() => {
    const video = document.querySelector('video');
    if (video && video !== this._currentVideo) {
      this._currentVideo = video;
      callbacks.onVideoFound(video);
    }
  });

  this._observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}
```

### Sites That Need Custom Pause

Some sites override `video.pause()` or require interacting with their own player API:

```js
pause() {
  // Click the site's pause button instead of calling video.pause()
  const pauseBtn = document.querySelector('.custom-pause-button');
  if (pauseBtn) {
    pauseBtn.click();
  } else {
    this._currentVideo?.pause();
  }
}
```

## Step-by-Step: Adding a New Module

### 1. Identify the video element

Open the target site in Chrome, play a video, then open DevTools (F12) and run:

```js
document.querySelectorAll('video')
```

Note:
- How many `<video>` elements exist
- What container they're inside (for the overlay)
- Whether the video element changes when navigating to a new video

### 2. Check for SPA behavior

Navigate to a different video and check if the page does a full reload (check the DevTools Network tab). If the page doesn't fully reload, you need SPA handling (URL polling or custom events).

### 3. Create your module file

Copy `modules/_template.js` and customize:
- `name` and `displayName`
- `matchesSite()` — match the hostname
- `_findVideo()` — use site-specific selectors
- `init()` — add SPA handling if needed
- `getOverlayContainer()` — return the player container
- `destroy()` — clean up everything

### 4. Register in manifest.json

Add your file to the content scripts array:

```json
"content_scripts": [
  {
    "js": [
      "core/module-registry.js",
      "core/overlay.js",
      "core/ponder-timer.js",
      "modules/youtube.js",
      "modules/tubi.js",
      "modules/your-site.js"
    ]
  }
]
```

### 5. Test

1. Go to `chrome://extensions`, enable Developer mode, click "Load unpacked", select the `ponder/` folder
2. After changes, click the reload button on the extension card
3. Open the target site and play a video
4. Open DevTools console and look for `[Ponder]` log messages
5. Verify auto-pause triggers after the configured interval
6. Verify the overlay appears and dismisses on play
7. Test SPA navigation (if applicable) — the timer should reset on video change

## Debugging Tips

- All Ponder log messages are prefixed with `[Ponder]`
- `PonderModuleRegistry.list()` in the console shows all registered modules
- `PonderModuleRegistry.getActive()` shows which module is active
- If the module isn't activating, check that `matchesSite()` returns `true` for the current URL
- If the timer isn't working, verify that the correct `<video>` element was passed to `onVideoFound`
- The timer only counts time from `timeupdate` events with small positive deltas (< 2 seconds), so seeks are automatically ignored

## Checklist for Module Authors

- [ ] `name` is unique and lowercase
- [ ] `matchesSite()` matches all relevant hostnames for the site
- [ ] `init()` calls `onVideoFound()` when the video element is available
- [ ] SPA navigation is handled (if applicable)
- [ ] `destroy()` cleans up all observers, intervals, and listeners
- [ ] Module file is listed in `manifest.json`
- [ ] Tested: auto-pause works at the configured interval
- [ ] Tested: overlay appears and can be clicked through
- [ ] Tested: navigation between videos resets the timer
