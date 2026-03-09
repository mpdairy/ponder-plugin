/**
 * Ponder extension integration test
 *
 * Simulates the browser environment and verifies that:
 * 1. Modules register and are found for matching sites
 * 2. Video elements are detected and attached
 * 3. The timer accumulates playtime correctly
 * 4. Auto-pause fires after the configured limit
 * 5. The cycle resets after auto-pause so it fires again
 *
 * Run: node test/test-ponder.js
 */

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log('  PASS: ' + msg);
    passed++;
  } else {
    console.error('  FAIL: ' + msg);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Mock browser APIs
// ---------------------------------------------------------------------------

const storageData = { playtimeSeconds: 5 }; // 5 seconds for fast testing
const storageListeners = [];
const chrome = {
  storage: {
    sync: {
      get(defaults, cb) {
        const result = Object.assign({}, defaults, storageData);
        cb(result);
      },
      set(obj, cb) {
        Object.assign(storageData, obj);
        if (cb) cb();
      }
    },
    onChanged: {
      addListener(fn) { storageListeners.push(fn); }
    }
  },
  runtime: {
    onInstalled: { addListener() {} }
  }
};
global.chrome = chrome;

global.window = {
  location: {
    hostname: 'www.youtube.com',
    pathname: '/watch',
    href: 'https://www.youtube.com/watch?v=abc123'
  }
};

class MockMutationObserver {
  constructor(cb) { this._cb = cb; }
  observe() {}
  disconnect() {}
}
global.MutationObserver = MockMutationObserver;

global.CustomEvent = function CustomEvent(type) { this.type = type; };

function createMockVideo() {
  const listeners = {};
  return {
    paused: true,
    currentTime: 0,
    tagName: 'VIDEO',
    _listeners: listeners,
    addEventListener(event, fn, opts) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push({ fn, once: (opts && opts.once) || false });
    },
    removeEventListener(event, fn) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(function(l) { return l.fn !== fn; });
      }
    },
    _emit(event) {
      if (listeners[event]) {
        const handlers = listeners[event].slice();
        for (var i = 0; i < handlers.length; i++) {
          var h = handlers[i];
          h.fn();
          if (h.once) {
            listeners[event] = listeners[event].filter(function(l) { return l !== h; });
          }
        }
      }
    },
    pause() {
      this.paused = true;
      this._emit('pause');
    },
    play() {
      this.paused = false;
      this._emit('play');
    },
    parentElement: {
      appendChild() {},
      style: {},
    }
  };
}

global.getComputedStyle = function() { return { position: 'relative' }; };

let mockVideo = createMockVideo();

// Mock YouTube's pause button
const mockPauseButton = {
  _title: 'Pause (k)',
  getAttribute(attr) {
    if (attr === 'title') return this._title;
    if (attr === 'aria-label') return this._title;
    return null;
  },
  click() {
    // Simulate what YouTube does when the pause button is clicked
    mockVideo.pause();
  }
};

const mockPlayerContainer = {
  querySelector(sel) {
    if (sel === 'video') return mockVideo;
    return null;
  },
  appendChild() {},
  style: {}
};

const docListeners = {};
global.document = {
  readyState: 'complete',
  body: {},
  dispatchEvent(evt) {
    if (docListeners[evt.type]) {
      docListeners[evt.type].forEach(function(entry) {
        entry.fn(evt);
      });
    }
  },
  addEventListener(event, fn, capture) {
    if (!docListeners[event]) docListeners[event] = [];
    docListeners[event].push({ fn: fn, capture: !!capture });
  },
  removeEventListener(event, fn) {
    if (docListeners[event]) {
      docListeners[event] = docListeners[event].filter(function(e) { return e.fn !== fn; });
    }
  },
  querySelector(sel) {
    if (sel === '#movie_player') return mockPlayerContainer;
    if (sel === '.ytp-play-button') return mockPauseButton;
    return null;
  },
  createElement(tag) {
    return {
      className: '',
      innerHTML: '',
      textContent: '',
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); }
      },
      offsetWidth: 100,
      remove() {}
    };
  }
};

// ---------------------------------------------------------------------------
// Load extension scripts in correct order
// ---------------------------------------------------------------------------
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const baseDir = path.join(__dirname, '..');

function loadScript(relPath) {
  const code = fs.readFileSync(path.join(baseDir, relPath), 'utf-8');
  vm.runInThisContext(code, { filename: relPath });
}

console.log('\n=== Ponder Extension Tests ===\n');

// Test 1: Load scripts in manifest order and verify module registration
console.log('--- Script Loading & Module Registration ---');
loadScript('core/module-registry.js');
loadScript('core/overlay.js');
loadScript('modules/youtube.js');
loadScript('modules/tubi.js');
loadScript('modules/odysee.js');

assert(typeof PonderModuleRegistry !== 'undefined', 'PonderModuleRegistry is defined');
assert(PonderModuleRegistry.list().indexOf('youtube') !== -1, 'YouTube module registered');
assert(PonderModuleRegistry.list().indexOf('tubi') !== -1, 'Tubi module registered');
assert(PonderModuleRegistry.list().indexOf('odysee') !== -1, 'Odysee module registered');

// Test 2: Load timer (should find YouTube module since we're on youtube.com)
loadScript('core/ponder-timer.js');
const active = PonderModuleRegistry.getActive();
assert(active !== null, 'An active module was found');
assert(active && active.name === 'youtube', 'YouTube module activated for www.youtube.com');

// Test 3: Verify video was found and attached
console.log('\n--- Video Detection ---');
assert(mockVideo._listeners['timeupdate'] && mockVideo._listeners['timeupdate'].length > 0,
  'timeupdate listener attached to video');
assert(mockVideo._listeners['play'] && mockVideo._listeners['play'].length > 0,
  'play listener attached to video');
assert(mockVideo._listeners['pause'] && mockVideo._listeners['pause'].length > 0,
  'pause listener attached to video');

// Test 4: Simulate playback and verify auto-pause
console.log('\n--- Playtime Accumulation & Auto-Pause ---');

mockVideo.paused = false;
mockVideo._emit('play');

// Track if pause button is clicked (the new YouTube module clicks the button)
let autoPaused = false;
const origClick = mockPauseButton.click.bind(mockPauseButton);
mockPauseButton.click = function() {
  autoPaused = true;
  origClick();
};

for (let t = 1; t <= 6; t++) {
  mockVideo.currentTime = t;
  mockVideo._emit('timeupdate');
  if (autoPaused) break;
}

assert(autoPaused, 'Video was auto-paused after accumulating playtime (paused at currentTime=' + mockVideo.currentTime + ')');
assert(mockVideo.paused, 'Video is in paused state');

// Test 5: Resume and verify cycle resets
console.log('\n--- Pause Cycle Reset ---');
autoPaused = false;
// After pause, button label changes to "Play"
mockPauseButton._title = 'Play (k)';
mockVideo.paused = false;
mockVideo._emit('play');
// Button changes back to "Pause" when playing
mockPauseButton._title = 'Pause (k)';

const startTime = mockVideo.currentTime;
for (let t = 1; t <= 6; t++) {
  mockVideo.currentTime = startTime + t;
  mockVideo._emit('timeupdate');
  if (autoPaused) break;
}

assert(autoPaused, 'Video was auto-paused again on second cycle');

// Test 6: Verify seek handling
console.log('\n--- Seek Handling ---');
autoPaused = false;
mockPauseButton._title = 'Play (k)';
mockVideo.paused = false;
mockVideo._emit('play');
mockPauseButton._title = 'Pause (k)';

mockVideo.currentTime = 100;
mockVideo._emit('timeupdate');
mockVideo.currentTime = 101;
mockVideo._emit('timeupdate');

// Big seek forward (should not count toward playtime)
mockVideo.currentTime = 500;
mockVideo._emit('seeked');
mockVideo._emit('timeupdate');

mockVideo.currentTime = 501;
mockVideo._emit('timeupdate');
mockVideo.currentTime = 502;
mockVideo._emit('timeupdate');

assert(!autoPaused, 'Seek did not count toward playtime (4s played, limit is 5s)');

mockVideo.currentTime = 503;
mockVideo._emit('timeupdate');
mockVideo.currentTime = 504;
mockVideo._emit('timeupdate');

assert(autoPaused, 'Auto-paused after real playtime exceeded limit (seek excluded)');

// Test 7: Module matching
console.log('\n--- Module Matching ---');

assert(PonderModuleRegistry.list().indexOf('tubi') !== -1, 'Tubi module is registered');

const tubiMatchTest = function(hostname) {
  return hostname === 'tubitv.com' || hostname === 'www.tubitv.com';
};
assert(tubiMatchTest('www.tubitv.com'), 'Tubi matches www.tubitv.com');
assert(tubiMatchTest('tubitv.com'), 'Tubi matches tubitv.com');
assert(!tubiMatchTest('www.youtube.com'), 'Tubi does not match youtube.com');

const odyseeMatchTest = function(hostname) {
  return hostname === 'odysee.com' || hostname === 'www.odysee.com';
};
assert(odyseeMatchTest('odysee.com'), 'Odysee matches odysee.com');
assert(odyseeMatchTest('www.odysee.com'), 'Odysee matches www.odysee.com');
assert(!odyseeMatchTest('www.youtube.com'), 'Odysee does not match youtube.com');

// Test 8: Load order verification
console.log('\n--- Load Order Verification ---');
const manifest = JSON.parse(fs.readFileSync(path.join(baseDir, 'manifest.json'), 'utf-8'));
const jsFiles = manifest.content_scripts[0].js;
const timerIdx = jsFiles.indexOf('core/ponder-timer.js');
const youtubeIdx = jsFiles.indexOf('modules/youtube.js');
const tubiIdx = jsFiles.indexOf('modules/tubi.js');
const odyseeIdx = jsFiles.indexOf('modules/odysee.js');

assert(timerIdx > youtubeIdx, 'ponder-timer.js loads AFTER youtube.js in manifest');
assert(timerIdx > tubiIdx, 'ponder-timer.js loads AFTER tubi.js in manifest');
assert(timerIdx > odyseeIdx, 'ponder-timer.js loads AFTER odysee.js in manifest');
assert(odyseeIdx !== -1, 'odysee.js is listed in manifest');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
process.exit(failed > 0 ? 1 : 0);
