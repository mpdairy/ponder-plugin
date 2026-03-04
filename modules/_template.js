/**
 * Ponder module — [Site Name]
 *
 * See docs/CREATING_MODULES.md for full instructions.
 *
 * To use this template:
 * 1. Copy this file to modules/your-site.js
 * 2. Fill in the fields below
 * 3. Add your-site.js to the content_scripts list in manifest.json
 */
PonderModuleRegistry.register({
  // REQUIRED: Unique identifier (lowercase, no spaces)
  name: 'your-site',

  // REQUIRED: Human-readable name shown in logs
  displayName: 'Your Site',

  // Internal state — prefix with _ to indicate private
  _callbacks: null,
  _observer: null,
  _currentVideo: null,

  // REQUIRED: Return true if this module should handle the current page.
  matchesSite(location) {
    return location.hostname === 'www.example.com' ||
           location.hostname === 'example.com';
  },

  // REQUIRED: Find the <video> element and call callbacks.onVideoFound(video).
  // Also set up observers for SPA navigation or dynamic DOM changes.
  init(callbacks) {
    this._callbacks = callbacks;

    // Try to find the video immediately
    const video = this._findVideo();
    if (video) {
      this._setVideo(video);
    }

    // Watch for dynamically added video elements
    this._observer = new MutationObserver(() => {
      const v = this._findVideo();
      if (v) this._setVideo(v);
    });
    this._observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  },

  // Helper: locate the <video> element on the page.
  // Customize this for the site's DOM structure.
  _findVideo() {
    // Try site-specific selectors first, then fall back to generic <video>
    // Example: return document.querySelector('.player-wrapper video');
    return document.querySelector('video');
  },

  // Helper: notify the core about a new or changed video.
  _setVideo(video) {
    if (video === this._currentVideo) return;

    if (this._currentVideo) {
      this._currentVideo = video;
      this._callbacks.onVideoChanged(video);
    } else {
      this._currentVideo = video;
      this._callbacks.onVideoFound(video);
    }
  },

  // OPTIONAL: Custom pause behaviour (e.g. click a site-specific pause button).
  // If omitted, the core will call video.pause() directly.
  // pause() {
  //   this._currentVideo?.pause();
  // },

  // OPTIONAL: Return the container element where the overlay should be placed.
  // If omitted, the overlay is placed on the video's parent element.
  getOverlayContainer() {
    // Example: return document.querySelector('.player-wrapper');
    return null;
  },

  // OPTIONAL: Clean up observers, intervals, and event listeners.
  destroy() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    this._currentVideo = null;
    this._callbacks = null;
  }
});
