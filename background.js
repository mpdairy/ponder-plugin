/**
 * Ponder — Background service worker
 *
 * Sets default settings on install and manages toolbar icon state.
 */

const ICON_ENABLED = {
  16: 'icons/icon-enabled-16.png',
  48: 'icons/icon-enabled-48.png',
  128: 'icons/icon-enabled-128.png'
};

const ICON_DISABLED = {
  16: 'icons/icon-disabled-16.png',
  48: 'icons/icon-disabled-48.png',
  128: 'icons/icon-disabled-128.png'
};

function updateIcon(enabled) {
  chrome.action.setIcon({ path: enabled ? ICON_ENABLED : ICON_DISABLED });
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({ playtimeSeconds: 180, ponderEnabled: true }, () => {
      console.log('[Ponder] Default settings saved (180s, enabled)');
      updateIcon(true);
    });
  }
});

// Set icon on service worker startup
chrome.storage.sync.get({ ponderEnabled: true }, (result) => {
  updateIcon(result.ponderEnabled);
});

// Update icon when enabled state changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.ponderEnabled) {
    updateIcon(changes.ponderEnabled.newValue);
  }
});
