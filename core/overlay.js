/**
 * PonderOverlay — Minimal handler for auto-pause cleanup.
 *
 * No visual overlay is shown. The video simply pauses and the user
 * hits play when ready to continue.
 */
const PonderOverlay = (() => {
  return {
    show(video, container) {
      // No overlay — just let the native paused state show
    },
    hide() {
      // Nothing to clean up
    }
  };
})();
