/**
 * Ponder — Popup settings UI
 *
 * Reads/writes settings from chrome.storage.sync.
 * Auto-saves when the user changes the inputs.
 */
var MIN_PLAYTIME = 10;
var saveTimeout = null;

var minutesInput = document.getElementById('minutes');
var secondsInput = document.getElementById('seconds');
var enabledInput = document.getElementById('enabled');
var statusEl = document.getElementById('status');

// Load current settings
chrome.storage.sync.get({ playtimeSeconds: 180, ponderEnabled: true }, function(result) {
  var total = result.playtimeSeconds;
  minutesInput.value = Math.floor(total / 60);
  secondsInput.value = total % 60;
  enabledInput.checked = result.ponderEnabled;
  updateDisabledState();
});

// Save on change (debounced for time inputs, immediate for toggle)
minutesInput.addEventListener('input', scheduleTimeSave);
secondsInput.addEventListener('input', scheduleTimeSave);
enabledInput.addEventListener('change', function() {
  chrome.storage.sync.set({ ponderEnabled: enabledInput.checked }, function() {
    statusEl.textContent = enabledInput.checked ? 'Enabled' : 'Disabled';
    setTimeout(function() { statusEl.textContent = ''; }, 2000);
  });
  updateDisabledState();
});

function updateDisabledState() {
  var off = !enabledInput.checked;
  minutesInput.disabled = off;
  secondsInput.disabled = off;
}

function scheduleTimeSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveTime, 400);
}

function saveTime() {
  var minutes = Math.max(0, parseInt(minutesInput.value, 10) || 0);
  var seconds = Math.max(0, Math.min(59, parseInt(secondsInput.value, 10) || 0));
  var total = minutes * 60 + seconds;

  if (total < MIN_PLAYTIME) {
    total = MIN_PLAYTIME;
    minutesInput.value = Math.floor(total / 60);
    secondsInput.value = total % 60;
  }

  chrome.storage.sync.set({ playtimeSeconds: total }, function() {
    statusEl.textContent = 'Saved: ' + formatTime(total);
    setTimeout(function() { statusEl.textContent = ''; }, 2000);
  });
}

function formatTime(totalSeconds) {
  var m = Math.floor(totalSeconds / 60);
  var s = totalSeconds % 60;
  if (m > 0 && s > 0) return m + 'm ' + s + 's';
  if (m > 0) return m + 'm';
  return s + 's';
}
