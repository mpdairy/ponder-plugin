/**
 * Ponder module — YouTube
 *
 * Detects video playback on YouTube and provides a pause method.
 *
 * Key challenges on YouTube:
 * - SPA navigation: YouTube doesn't do full page reloads, so we listen for
 *   yt-navigate-finish and also poll for URL changes.
 * - Video element replacement: YouTube may swap out the <video> element
 *   during player initialization, so we keep the MutationObserver running
 *   and also use a capture-phase "play" listener as a safety net.
 * - Pausing: calling video.pause() directly causes YouTube's player to
 *   detect an "unexpected" pause and resume. Content scripts can't call
 *   YouTube's pauseVideo() API (isolated world). Instead we click
 *   YouTube's own pause button, which goes through their normal flow.
 */
PonderModuleRegistry.register({
  name: 'youtube',
  displayName: 'YouTube',

  _callbacks: null,
  _observer: null,
  _currentVideo: null,
  _navigationHandler: null,
  _playCapture: null,
  _pollInterval: null,
  _lastUrl: null,

  matchesSite(location) {
    return location.hostname === 'www.youtube.com' ||
           location.hostname === 'youtube.com' ||
           location.hostname === 'm.youtube.com';
  },

  init(callbacks) {
    this._callbacks = callbacks;
    this._lastUrl = window.location.href;

    // Listen for YouTube's SPA navigation event
    this._navigationHandler = () => this._onNavigate();
    document.addEventListener('yt-navigate-finish', this._navigationHandler);

    // Poll for URL changes as a fallback (some navigations may not fire the event)
    this._pollInterval = setInterval(() => {
      if (window.location.href !== this._lastUrl) {
        this._lastUrl = window.location.href;
        this._onNavigate();
      }
    }, 1000);

    // Capture-phase "play" listener: catches play events from ANY <video>,
    // even ones added after our MutationObserver ran. This is a safety net
    // for cases where YouTube replaces the video element.
    this._playCapture = (e) => {
      if (e.target && e.target.tagName === 'VIDEO') {
        this._setVideo(e.target);
      }
    };
    document.addEventListener('play', this._playCapture, true);

    // Try to find a video right now
    this._onNavigate();
  },

  _isVideoPage() {
    var p = window.location.pathname;
    return p.startsWith('/watch') || p.startsWith('/shorts');
  },

  _onNavigate() {
    this._lastUrl = window.location.href;

    if (!this._isVideoPage()) {
      if (this._currentVideo) {
        this._currentVideo = null;
        this._callbacks.onVideoLost();
      }
      this._stopObserver();
      return;
    }

    // Try to find the video now, and also keep observing for it
    var video = this._findVideo();
    if (video) {
      this._setVideo(video);
    }
    // Always keep observing — YouTube may replace the video element
    this._observeForVideo();
  },

  _findVideo() {
    var player = document.querySelector('#movie_player');
    if (player) {
      return player.querySelector('video');
    }
    // Also check the shorts player
    var shorts = document.querySelector('#shorts-player');
    if (shorts) {
      return shorts.querySelector('video');
    }
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

  _observeForVideo() {
    // Don't create a second observer if one is already running
    if (this._observer) return;

    this._observer = new MutationObserver(() => {
      var video = this._findVideo();
      if (video) {
        this._setVideo(video);
      }
    });

    this._observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  },

  _stopObserver() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  },

  pause() {
    // Click YouTube's own pause button. This goes through YouTube's normal
    // pause flow, so the player won't fight back and resume.
    // Works from the content script's isolated world since .click() is a
    // DOM method, not a YouTube JS API.
    var btn = document.querySelector('.ytp-play-button');
    if (btn) {
      // Only click if the video is actually playing (button shows "Pause")
      var title = btn.getAttribute('title') || '';
      var label = btn.getAttribute('aria-label') || '';
      var isPauseBtn = title.toLowerCase().indexOf('pause') !== -1 ||
                       label.toLowerCase().indexOf('pause') !== -1;
      if (isPauseBtn) {
        btn.click();
        return;
      }
    }
    // Fallback: direct pause on the video element
    if (this._currentVideo) {
      this._currentVideo.pause();
    }
  },

  getOverlayContainer() {
    return document.querySelector('#movie_player') || null;
  },

  destroy() {
    if (this._navigationHandler) {
      document.removeEventListener('yt-navigate-finish', this._navigationHandler);
      this._navigationHandler = null;
    }
    if (this._playCapture) {
      document.removeEventListener('play', this._playCapture, true);
      this._playCapture = null;
    }
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    this._stopObserver();
    this._currentVideo = null;
    this._callbacks = null;
  }
});
