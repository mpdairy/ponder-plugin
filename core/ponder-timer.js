/**
 * PonderTimer — Core timer that accumulates playtime via timeupdate events
 * and auto-pauses the video when the configured limit is reached.
 *
 * This is the main entry point. It:
 * 1. Loads the playtime setting from chrome.storage.sync
 * 2. Asks PonderModuleRegistry to find and init the matching site module
 * 3. Listens to timeupdate on the <video> to accumulate playtime
 * 4. Pauses and shows the overlay when the limit is hit
 * 5. Resets the accumulator so the cycle repeats
 */
(() => {
  const DEFAULT_PLAYTIME_SECONDS = 180; // 3 minutes

  let playtimeLimit = DEFAULT_PLAYTIME_SECONDS;
  let enabled = true;
  let accumulatedTime = 0;
  let lastTimeUpdate = null;
  let currentVideo = null;
  let activeModule = null;

  // --- Settings -----------------------------------------------------------

  function loadSettings() {
    chrome.storage.sync.get({ playtimeSeconds: DEFAULT_PLAYTIME_SECONDS, ponderEnabled: true }, (result) => {
      playtimeLimit = result.playtimeSeconds;
      enabled = result.ponderEnabled;
      console.log(`[Ponder] Playtime limit: ${playtimeLimit}s, enabled: ${enabled}`);
    });
  }

  // Listen for setting changes in real time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.playtimeSeconds) {
      playtimeLimit = changes.playtimeSeconds.newValue;
      // Reset accumulated time so the new limit takes effect immediately
      // instead of auto-pausing based on time already watched under the old limit
      accumulatedTime = 0;
      lastTimeUpdate = currentVideo && !currentVideo.paused ? currentVideo.currentTime : null;
      console.log(`[Ponder] Playtime limit updated: ${playtimeLimit}s`);
    }
    if (area === 'sync' && changes.ponderEnabled) {
      console.log(`[Ponder] ${changes.ponderEnabled.newValue ? 'Enabled' : 'Disabled'}`);
    }
  });

  // --- Video event handlers ------------------------------------------------

  function onTimeUpdate() {
    if (!enabled || !currentVideo || currentVideo.paused) return;

    const now = currentVideo.currentTime;

    if (lastTimeUpdate !== null) {
      const delta = now - lastTimeUpdate;
      // Only accumulate small positive deltas (normal playback).
      // Ignore seeks (large jumps) and negative deltas (seeking backward).
      if (delta > 0 && delta < 2) {
        accumulatedTime += delta;
      }
    }

    lastTimeUpdate = now;

    if (accumulatedTime >= playtimeLimit) {
      autoPause();
    }
  }

  function onPlay() {
    // Every time the video starts playing (manual resume or after auto-pause),
    // reset the timer so the user gets a full playtime interval.
    accumulatedTime = 0;
    lastTimeUpdate = currentVideo ? currentVideo.currentTime : null;
  }

  function onPause() {
    // Freeze lastTimeUpdate — will reset on next play
    lastTimeUpdate = null;
  }

  function onSeeked() {
    // After a seek, reset lastTimeUpdate to avoid counting the jump
    lastTimeUpdate = currentVideo ? currentVideo.currentTime : null;
  }

  // --- Auto-pause ----------------------------------------------------------

  function autoPause() {
    if (!currentVideo) return;

    // Use module-specific pause if available, else standard pause
    if (activeModule && activeModule.pause) {
      activeModule.pause();
    } else {
      currentVideo.pause();
    }

    // Show overlay
    const container = (activeModule && activeModule.getOverlayContainer)
      ? activeModule.getOverlayContainer()
      : null;
    PonderOverlay.show(currentVideo, container);

    // Reset accumulator for next cycle
    accumulatedTime = 0;
    lastTimeUpdate = null;

    console.log('[Ponder] Auto-paused. Time to ponder!');
  }

  // --- Attach / detach video -----------------------------------------------

  function attachVideo(video) {
    detachVideo();
    currentVideo = video;
    accumulatedTime = 0;
    lastTimeUpdate = video.paused ? null : video.currentTime;

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);

    console.log('[Ponder] Attached to video element');
  }

  function detachVideo() {
    if (currentVideo) {
      currentVideo.removeEventListener('timeupdate', onTimeUpdate);
      currentVideo.removeEventListener('play', onPlay);
      currentVideo.removeEventListener('pause', onPause);
      currentVideo.removeEventListener('seeked', onSeeked);
      currentVideo = null;
    }
    accumulatedTime = 0;
    lastTimeUpdate = null;
    PonderOverlay.hide();
  }

  // --- Module callbacks ----------------------------------------------------

  const moduleCallbacks = {
    /** Called when a module finds a <video> element. */
    onVideoFound(video) {
      attachVideo(video);
    },

    /** Called when the video changes (e.g. SPA navigation to a new video). */
    onVideoChanged(video) {
      attachVideo(video);
    },

    /** Called when the video is lost (e.g. navigated away from player page). */
    onVideoLost() {
      detachVideo();
    }
  };

  // --- Initialisation ------------------------------------------------------

  function init() {
    loadSettings();
    activeModule = PonderModuleRegistry.init(moduleCallbacks);
    if (activeModule) {
      console.log(`[Ponder] Running on ${activeModule.displayName}`);
    }
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
