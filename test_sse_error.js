// Test: SSE malformed-payload error handling.
//
// Regression guard for the SSE 'state' event handler in moonshiner_ui_v24.js.
// PR #89 removed the console.error from the JSON.parse catch-block on purpose:
// a malformed SSE frame is an expected, non-fatal condition and must be
// handled *silently*. This test asserts exactly that contract:
//   1. A 'state' listener IS registered on the EventSource.
//   2. Feeding it invalid JSON does NOT throw / crash the page.
//   3. The failure is silent (no 'Failed to parse SSE data' console.error),
//      matching the intentional removal of that log line.

const fs = require('fs');
const { JSDOM } = require('jsdom');
const assert = require('assert');

console.log("\nStarting Test: SSE Error Handling");

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: 'dangerously',
  url: "http://localhost/"
});
const window = dom.window;
const document = window.document;

window.matchMedia = () => ({ matches: false });

// Mock EventSource so we can capture listeners and fire events manually,
// without ever opening a real network connection.
let eventListeners = {};
window.EventSource = class {
  constructor(url) {
    this.url = url;
  }
  addEventListener(event, callback) {
    if (!eventListeners[event]) {
      eventListeners[event] = [];
    }
    eventListeners[event].push(callback);
  }
  onerror() {}
};

// Intercept console.error so we can prove the parse failure is handled silently.
let consoleErrors = [];
window.console.error = function(...args) {
  consoleErrors.push(args.join(' '));
};

let jsCode = fs.readFileSync('./moonshiner_ui_v24.js', 'utf8');
const scriptEl = document.createElement('script');
scriptEl.textContent = jsCode;
document.body.appendChild(scriptEl);

setTimeout(() => {
    try {
        // Find the 'state' event listener registered on EventSource
        const stateListeners = eventListeners['state'];
        assert.ok(stateListeners && stateListeners.length > 0, 'EventSource should have a state event listener');

        const stateCallback = stateListeners[0];

        // Dispatch a deliberately malformed payload (truncated JSON).
        const mockEvent = {
            data: 'INVALID_JSON_PAYLOAD {]'
        };

        // Must not throw - the handler catches the parse error internally.
        assert.doesNotThrow(() => {
            stateCallback(mockEvent);
        }, 'Malformed SSE payload should not throw');

        // PR #89 removed the console.error for SSE parse failures on purpose:
        // verify nothing was logged to console.error for this code path.
        const errorLogged = consoleErrors.some(msg => msg.includes('Failed to parse SSE data'));
        assert.ok(!errorLogged, 'Parse failure must be handled silently (no console.error)');

        console.log("✅ SSE error handling test passed!");
        process.exit(0);
    } catch (err) {
        console.error("❌ SSE error handling test failed:", err.message);
        process.exit(1);
    }
}, 500);
