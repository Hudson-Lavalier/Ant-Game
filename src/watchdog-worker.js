/*
 * OUT-OF-THREAD WATCHDOG WEB WORKER
 * Runs on an independent OS thread. Monitors main thread heartbeats and detects
 * event loop starvation / synchronous freezes without false-alarm triggering
 * when browser tabs are inactive or hidden.
 */
let lastHeartbeat = Date.now();
let isTabVisible = true;
let freezeReported = false;
const FREEZE_THRESHOLD_MS = 2000;

self.onmessage = (e) => {
  const data = e.data;
  if (!data) return;

  if (data.type === 'heartbeat') {
    lastHeartbeat = Date.now();
    freezeReported = false;
  } else if (data.type === 'visibility') {
    isTabVisible = Boolean(data.visible);
    if (isTabVisible) {
      // Reset on tab refocus to avoid false-flagging suspension
      lastHeartbeat = Date.now();
      freezeReported = false;
    }
  }
};

setInterval(() => {
  // Do NOT alert if the tab is hidden or minimized (browsers intentionally pause rAF)
  if (!isTabVisible) return;

  const elapsed = Date.now() - lastHeartbeat;
  if (elapsed > FREEZE_THRESHOLD_MS && !freezeReported) {
    freezeReported = true;

    // Report freeze directly to local dev server via fetch (fetch is native in workers)
    if (typeof fetch === 'function') {
      fetch('/api/log-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'FATAL',
          type: 'MAIN_THREAD_FREEZE',
          message: `Main thread frozen for ${elapsed}ms (Event loop starvation)`,
          timestamp: new Date().toISOString()
        })
      }).catch(() => {
        // Dev server may not be running in standalone file mode
      });
    }
  }
}, 500);
