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

// Intercept console.error to track calls
let consoleErrors = [];
const originalConsoleError = window.console.error;
window.console.error = function(...args) {
  consoleErrors.push(args.join(' '));
  // originalConsoleError.apply(window.console, args);
};

// Add addLog to avoid errors
window.addLog = function(msg) {};

// Run the script
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

        // Dispatch an invalid JSON payload
        const mockEvent = {
            data: 'INVALID_JSON_PAYLOAD {]'
        };

        // Call it directly since we mocked EventSource
        stateCallback(mockEvent);

        // Check if console.error was called with the expected message
        const errorLogged = consoleErrors.some(msg => msg.includes('Failed to parse SSE data'));
        assert.ok(errorLogged, 'Should log error when JSON parsing fails');

        console.log("✅ SSE error handling test passed!");
        process.exit(0);
    } catch (err) {
        console.error("❌ SSE error handling test failed:", err.message);
        process.exit(1);
    }
}, 500);
