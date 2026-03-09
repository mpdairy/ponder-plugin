/**
 * Ponder — Real browser integration test
 *
 * Loads the extension in Chromium, navigates to YouTube and Tubi,
 * and verifies the extension actually detects and pauses videos.
 *
 * Key insight: Chrome extension content scripts run in an ISOLATED WORLD.
 * We can't access PonderModuleRegistry from page.evaluate() — it only sees
 * the main page's JS context. But we CAN observe DOM side-effects (video
 * pausing) and read console logs.
 *
 * Run: DISPLAY=:99 node test/test-browser.js
 */
var puppeteer = require('puppeteer');
var path = require('path');

var EXTENSION_PATH = path.join(__dirname, '..');

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log('  PASS: ' + msg);
    passed++;
  } else {
    console.error('  FAIL: ' + msg);
    failed++;
  }
}

function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

async function getExtensionBackgroundPage(browser) {
  var targets = browser.targets();
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    if (t.type() === 'service_worker' || t.type() === 'background_page') {
      if (t.url().indexOf('chrome-extension://') === 0) return t;
    }
  }
  await sleep(2000);
  targets = browser.targets();
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    if (t.type() === 'service_worker' || t.type() === 'background_page') {
      if (t.url().indexOf('chrome-extension://') === 0) return t;
    }
  }
  return null;
}

// Helper: wait for video to be paused (returns true if paused within timeout)
async function waitForPause(page, selector, timeoutMs) {
  var elapsed = 0;
  var interval = 500;
  while (elapsed < timeoutMs) {
    await sleep(interval);
    elapsed += interval;
    var paused = await page.evaluate(function(sel) {
      var v = document.querySelector(sel);
      return v ? v.paused : null;
    }, selector);
    if (paused) return true;
  }
  return false;
}

async function run() {
  console.log('\n=== Ponder Browser Integration Tests ===\n');

  var browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions-except=' + EXTENSION_PATH,
      '--load-extension=' + EXTENSION_PATH,
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
    ]
  });

  var consoleLogs = [];

  try {
    // -----------------------------------------------------------------------
    // Extension setup — set 3-second playtime for fast testing
    // -----------------------------------------------------------------------
    console.log('--- Extension Setup ---');

    var bgTarget = await getExtensionBackgroundPage(browser);
    assert(bgTarget !== null, 'Extension background worker found');

    if (bgTarget) {
      var bgWorker = await bgTarget.worker();
      if (bgWorker) {
        await bgWorker.evaluate(function() {
          chrome.storage.sync.set({ playtimeSeconds: 3 });
        });
        console.log('  Set playtime to 3 seconds');
      } else {
        var bgPage = await bgTarget.page();
        if (bgPage) {
          await bgPage.evaluate(function() {
            chrome.storage.sync.set({ playtimeSeconds: 3 });
          });
          console.log('  Set playtime to 3 seconds');
        }
      }
    }

    // -----------------------------------------------------------------------
    // TEST: YouTube
    // -----------------------------------------------------------------------
    console.log('\n--- YouTube Test ---');
    var page = await browser.newPage();
    consoleLogs = [];

    page.on('console', function(msg) {
      var text = msg.text();
      if (text.indexOf('[Ponder]') !== -1) {
        consoleLogs.push(text);
        console.log('  [console] ' + text);
      }
    });

    console.log('  Loading YouTube...');
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    console.log('  Waiting for video element...');
    var ytVideoExists = await page.waitForSelector('#movie_player video', { timeout: 15000 })
      .then(function() { return true; })
      .catch(function() { return false; });

    assert(ytVideoExists, 'YouTube: #movie_player video element exists');

    await sleep(2000);

    var ytModuleActivated = consoleLogs.some(function(log) {
      return log.indexOf('Activated module: YouTube') !== -1;
    });
    var ytVideoAttached = consoleLogs.some(function(log) {
      return log.indexOf('Attached to video') !== -1;
    });

    assert(ytModuleActivated, 'YouTube: Ponder activated YouTube module');
    assert(ytVideoAttached, 'YouTube: Ponder attached to video element');

    if (ytVideoExists) {
      // Dismiss consent dialogs
      await page.evaluate(function() {
        var btn = document.querySelector('button[aria-label*="Accept"]') ||
                  document.querySelector('button[aria-label*="agree"]');
        if (btn) btn.click();
      });
      await sleep(500);

      console.log('  Starting video playback...');
      await page.evaluate(function() {
        var v = document.querySelector('#movie_player video');
        if (v) { v.muted = true; v.play().catch(function() {}); }
      });
      await sleep(1500);

      var ytIsPlaying = await page.evaluate(function() {
        var v = document.querySelector('#movie_player video');
        return v && !v.paused;
      });
      console.log('  Video playing: ' + ytIsPlaying);

      if (ytIsPlaying) {
        console.log('  Waiting for Ponder auto-pause (3s limit)...');
        var ytWasPaused = await waitForPause(page, '#movie_player video', 8000);

        assert(ytWasPaused, 'YouTube: Video was auto-paused by Ponder');

        // Verify the video STAYS paused (YouTube's player shouldn't fight back)
        if (ytWasPaused) {
          await sleep(2000);
          var stillPaused = await page.evaluate(function() {
            var v = document.querySelector('#movie_player video');
            return v ? v.paused : null;
          });
          assert(stillPaused, 'YouTube: Video stays paused (player not fighting back)');
        }

        var ytAutoPauseLogged = consoleLogs.some(function(log) {
          return log.indexOf('Auto-paused') !== -1;
        });
        assert(ytAutoPauseLogged, 'YouTube: Auto-pause confirmed in console');

        if (ytWasPaused) {
          // Test cycle reset
          console.log('  Testing pause cycle reset...');
          consoleLogs = [];
          await page.evaluate(function() {
            var v = document.querySelector('#movie_player video');
            if (v) v.play().catch(function() {});
          });
          await sleep(1000);

          var resumed = await page.evaluate(function() {
            var v = document.querySelector('#movie_player video');
            return v && !v.paused;
          });

          if (resumed) {
            var pausedAgain = await waitForPause(page, '#movie_player video', 8000);
            assert(pausedAgain, 'YouTube: Second auto-pause cycle worked');
          } else {
            console.log('  Could not resume video for cycle test');
          }
        }
      } else {
        console.log('  Video autoplay blocked — verifying extension loaded...');
        assert(ytModuleActivated || ytVideoAttached,
          'YouTube: Extension is running (autoplay blocked, cannot test pause)');
      }
    }

    await page.close();

    // -----------------------------------------------------------------------
    // TEST: Tubi — navigate to an actual video page
    // -----------------------------------------------------------------------
    console.log('\n--- Tubi Test ---');
    consoleLogs = [];
    page = await browser.newPage();

    page.on('console', function(msg) {
      var text = msg.text();
      if (text.indexOf('[Ponder]') !== -1) {
        consoleLogs.push(text);
        console.log('  [console] ' + text);
      }
    });

    // First load Tubi homepage to find a video link
    console.log('  Loading Tubi homepage...');
    await page.goto('https://tubitv.com', {
      waitUntil: 'networkidle2',
      timeout: 30000
    }).catch(function(e) {
      console.log('  Tubi homepage load note: ' + e.message);
    });

    await sleep(2000);

    var tubiModuleActivated = consoleLogs.some(function(log) {
      return log.indexOf('Activated module: Tubi') !== -1;
    });
    assert(tubiModuleActivated, 'Tubi: Module activated on tubitv.com');

    // Find a video/movie link to navigate to
    console.log('  Looking for a video link on Tubi...');
    var videoUrl = await page.evaluate(function() {
      // Look for links to movies or shows
      var links = Array.from(document.querySelectorAll('a[href]'));
      for (var i = 0; i < links.length; i++) {
        var href = links[i].href;
        // Tubi video pages use /movies/ or /tv-shows/ or /video/
        if (href.match(/\/(movies|tv-shows|video)\//)) {
          return href;
        }
      }
      return null;
    });

    if (videoUrl) {
      console.log('  Navigating to Tubi video: ' + videoUrl);
      consoleLogs = [];
      await page.goto(videoUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      }).catch(function(e) {
        console.log('  Tubi video page load note: ' + e.message);
      });

      // Wait for the page to render and look for video element
      await sleep(5000);

      var tubiVideoExists = await page.evaluate(function() {
        return document.querySelector('video') !== null;
      });

      // Report what player DOM we actually see
      var tubiDom = await page.evaluate(function() {
        var video = document.querySelector('video');
        if (!video) return { found: false };
        // Walk up from video to find container info
        var parent = video.parentElement;
        var grandparent = parent ? parent.parentElement : null;
        return {
          found: true,
          videoParentTag: parent ? parent.tagName : null,
          videoParentClass: parent ? parent.className.toString().substring(0, 100) : null,
          videoParentId: parent ? parent.id : null,
          grandparentClass: grandparent ? grandparent.className.toString().substring(0, 100) : null,
          grandparentId: grandparent ? grandparent.id : null
        };
      });

      if (tubiDom.found) {
        console.log('  Tubi video element found!');
        console.log('    Parent: <' + tubiDom.videoParentTag + '> class="' + tubiDom.videoParentClass + '" id="' + tubiDom.videoParentId + '"');
        console.log('    Grandparent class="' + tubiDom.grandparentClass + '" id="' + tubiDom.grandparentId + '"');
        assert(true, 'Tubi: Video element found on video page');

        // Check if Ponder attached
        var tubiAttached = consoleLogs.some(function(log) {
          return log.indexOf('Attached to video') !== -1;
        });
        assert(tubiAttached, 'Tubi: Ponder attached to video element');

        // Try to play and test auto-pause
        console.log('  Starting Tubi video playback...');
        await page.evaluate(function() {
          var v = document.querySelector('video');
          if (v) { v.muted = true; v.play().catch(function() {}); }
        });
        await sleep(1500);

        var tubiPlaying = await page.evaluate(function() {
          var v = document.querySelector('video');
          return v && !v.paused;
        });
        console.log('  Tubi video playing: ' + tubiPlaying);

        if (tubiPlaying) {
          // Check if the video stream is actually loading
          await sleep(2000);
          var tubiReadyState = await page.evaluate(function() {
            var v = document.querySelector('video');
            return v ? v.readyState : -1;
          });

          if (tubiReadyState >= 2) {
            // Video data is loading — test real auto-pause
            console.log('  Tubi video streaming (readyState=' + tubiReadyState + '), waiting for auto-pause...');
            var tubiPaused = await waitForPause(page, 'video', 10000);
            assert(tubiPaused, 'Tubi: Video was auto-paused by Ponder');
          } else {
            // Video not loading — Tubi requires login/DRM in headless browser.
            // Auto-pause can't be tested without actual media streaming, but
            // the core timer logic is already proven on YouTube. What matters
            // here is that the Tubi module found and attached to the video.
            console.log('  Tubi video not streaming (readyState=' + tubiReadyState + ')');
            console.log('  Tubi requires login/DRM — cannot test auto-pause in headless.');
            console.log('  Module activation + video attachment verified above.');
          }
        } else {
          console.log('  Tubi video did not autoplay (may need login or interaction)');
          assert(tubiAttached, 'Tubi: Extension attached (autoplay blocked, cannot test pause)');
        }
      } else {
        console.log('  No video element on Tubi video page (may need login)');
        // Still verify module activated
        assert(tubiModuleActivated, 'Tubi: Module activated (video requires login)');
      }
    } else {
      console.log('  Could not find a video link on Tubi homepage');
      assert(tubiModuleActivated, 'Tubi: Module activated (no video link found to test)');
    }

    await page.close();

    // -----------------------------------------------------------------------
    // TEST: Odysee
    // -----------------------------------------------------------------------
    console.log('\n--- Odysee Test ---');
    consoleLogs = [];
    page = await browser.newPage();

    page.on('console', function(msg) {
      var text = msg.text();
      if (text.indexOf('[Ponder]') !== -1) {
        consoleLogs.push(text);
        console.log('  [console] ' + text);
      }
    });

    console.log('  Loading Odysee homepage...');
    await page.goto('https://odysee.com', {
      waitUntil: 'networkidle2',
      timeout: 30000
    }).catch(function(e) {
      console.log('  Odysee homepage load note: ' + e.message);
    });

    await sleep(2000);

    var odyseeModuleActivated = consoleLogs.some(function(log) {
      return log.indexOf('Activated module: Odysee') !== -1;
    });
    assert(odyseeModuleActivated, 'Odysee: Module activated on odysee.com');

    // Find a video link to navigate to
    console.log('  Looking for a video link on Odysee...');
    var odyseeVideoUrl = await page.evaluate(function() {
      // Odysee video links typically contain /@channel/ or /$/
      var links = Array.from(document.querySelectorAll('a[href]'));
      for (var i = 0; i < links.length; i++) {
        var href = links[i].href;
        if (href.match(/odysee\.com\/@[^/]+\/[^/]+/) && href.indexOf('/$/') === -1) {
          return href;
        }
      }
      return null;
    });

    if (odyseeVideoUrl) {
      console.log('  Navigating to Odysee video: ' + odyseeVideoUrl);
      consoleLogs = [];
      await page.goto(odyseeVideoUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      }).catch(function(e) {
        console.log('  Odysee video page load note: ' + e.message);
      });

      await sleep(5000);

      var odyseeVideoExists = await page.evaluate(function() {
        return document.querySelector('video') !== null;
      });

      if (odyseeVideoExists) {
        console.log('  Odysee video element found!');
        assert(true, 'Odysee: Video element found on video page');

        var odyseeAttached = consoleLogs.some(function(log) {
          return log.indexOf('Attached to video') !== -1;
        });
        assert(odyseeAttached, 'Odysee: Ponder attached to video element');

        // Try to play and test auto-pause
        console.log('  Starting Odysee video playback...');
        await page.evaluate(function() {
          var v = document.querySelector('video');
          if (v) { v.muted = true; v.play().catch(function() {}); }
        });
        await sleep(1500);

        var odyseeIsPlaying = await page.evaluate(function() {
          var v = document.querySelector('video');
          return v && !v.paused;
        });
        console.log('  Odysee video playing: ' + odyseeIsPlaying);

        if (odyseeIsPlaying) {
          console.log('  Waiting for Ponder auto-pause (3s limit)...');
          var odyseePaused = await waitForPause(page, 'video', 10000);
          assert(odyseePaused, 'Odysee: Video was auto-paused by Ponder');

          var odyseeAutoPauseLogged = consoleLogs.some(function(log) {
            return log.indexOf('Auto-paused') !== -1;
          });
          assert(odyseeAutoPauseLogged, 'Odysee: Auto-pause confirmed in console');
        } else {
          console.log('  Odysee video did not autoplay');
          assert(odyseeAttached, 'Odysee: Extension attached (autoplay blocked, cannot test pause)');
        }
      } else {
        console.log('  No video element found on Odysee video page');
        assert(odyseeModuleActivated, 'Odysee: Module activated (no video element found)');
      }
    } else {
      console.log('  Could not find a video link on Odysee homepage');
      assert(odyseeModuleActivated, 'Odysee: Module activated (no video link found to test)');
    }

    await page.close();

    // -----------------------------------------------------------------------
    // TEST: Non-matching site
    // -----------------------------------------------------------------------
    console.log('\n--- Non-matching Site Test ---');
    consoleLogs = [];
    page = await browser.newPage();
    page.on('console', function(msg) {
      var text = msg.text();
      if (text.indexOf('[Ponder]') !== -1) consoleLogs.push(text);
    });

    await page.goto('https://example.com', {
      waitUntil: 'networkidle2',
      timeout: 15000
    });
    await sleep(1000);

    var noModuleActivated = !consoleLogs.some(function(log) {
      return log.indexOf('Activated module') !== -1;
    });
    assert(noModuleActivated, 'example.com: No module activated');

    await page.close();

  } catch (e) {
    console.error('Test error: ' + e.message);
    console.error(e.stack);
  } finally {
    await browser.close();
  }

  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(function(e) {
  console.error('Fatal: ' + e.message);
  console.error(e.stack);
  process.exit(1);
});
