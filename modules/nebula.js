/**
 * Ponder module — Nebula
 *
 * Nebula is a creator-owned streaming platform (nebula.tv / nebula.app).
 * It uses a React SPA with client-side routing and a standard HTML5 video
 * player inside a #video-player container. This module uses a
 * MutationObserver + URL polling to handle SPA navigation.
 */
PonderModuleRegistry.register({
  name: 'nebula',
  displayName: 'Nebula',

  _callbacks: null,
  _observer: null,
  _currentVideo: null,
  _pollInterval: null,
  _lastUrl: null,

  matchesSite(location) {
    return location.hostname === 'nebula.tv' ||
           location.hostname === 'www.nebula.tv' ||
           location.hostname === 'nebula.app' ||
           location.hostname === 'www.nebula.app';
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

    // Poll for URL changes (Nebula uses client-side routing)
    this._pollInterval = setInterval(() => {
      if (window.location.href !== this._lastUrl) {
        this._lastUrl = window.location.href;
        this._onUrlChange();
      }
    }, 1000);
  },

  _onUrlChange() {
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
    // Nebula's player uses a #video-player container
    var player = document.querySelector('#video-player');
    if (player) {
      var v = player.querySelector('video');
      if (v) return v;
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
    return document.querySelector('#video-player') || null;
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
