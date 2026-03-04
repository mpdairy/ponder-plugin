/**
 * Ponder module — Tubi
 *
 * Tubi uses a fairly standard HTML5 video player. This module uses a
 * MutationObserver + URL polling to detect when a video appears on the page,
 * since Tubi uses client-side routing.
 */
PonderModuleRegistry.register({
  name: 'tubi',
  displayName: 'Tubi',

  _callbacks: null,
  _observer: null,
  _currentVideo: null,
  _pollInterval: null,
  _lastUrl: null,

  matchesSite(location) {
    return location.hostname === 'tubitv.com' || location.hostname === 'www.tubitv.com';
  },

  init(callbacks) {
    this._callbacks = callbacks;
    this._lastUrl = window.location.href;

    // Try to find video now
    this._tryFindVideo();

    // Observe DOM for dynamically added video elements
    this._observer = new MutationObserver(() => this._tryFindVideo());
    this._observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Poll for URL changes (Tubi uses client-side routing)
    this._pollInterval = setInterval(() => {
      if (window.location.href !== this._lastUrl) {
        this._lastUrl = window.location.href;
        this._onUrlChange();
      }
    }, 1000);
  },

  _onUrlChange() {
    // Re-check for video on URL change
    const video = this._findVideo();
    if (video) {
      this._setVideo(video);
    } else if (this._currentVideo) {
      this._currentVideo = null;
      this._callbacks.onVideoLost();
    }
  },

  _tryFindVideo() {
    const video = this._findVideo();
    if (video) {
      this._setVideo(video);
    }
  },

  _findVideo() {
    // Tubi's player container
    const player = document.querySelector('.player-container') ||
                   document.querySelector('[data-testid="video-player"]');
    if (player) {
      return player.querySelector('video');
    }
    // Fallback: any video on the page
    return document.querySelector('video');
  },

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

  getOverlayContainer() {
    return document.querySelector('.player-container') ||
           document.querySelector('[data-testid="video-player"]') ||
           null;
  },

  destroy() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    this._currentVideo = null;
    this._callbacks = null;
  }
});
