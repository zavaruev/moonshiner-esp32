const fs = require('fs');
const { JSDOM } = require('jsdom');
const assert = require('assert');

// Modify the script string to expose addLog to window so we can call it
let jsCode = fs.readFileSync('./moonshiner_ui_v24.js', 'utf8');
jsCode = jsCode.replace('function addLog(msg) {', 'window.addLog = function(msg) {');
// Expose initUI to the global window object to test multiple calls
jsCode = jsCode.replace('function initUI() {', 'window.initUI = initUI;\n    function initUI() {');

const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
  runScripts: 'dangerously',
  url: "http://localhost/"
});
const window = dom.window;
const document = window.document;

// Mock globals needed by moonshiner_ui_v24.js
window.matchMedia = () => ({ matches: false });
window.EventSource = class {
  addEventListener() {}
  onerror() {}
};

// Run the script
const scriptEl = document.createElement('script');
scriptEl.textContent = jsCode;
document.body.appendChild(scriptEl);

setTimeout(() => {
    // Open the diag toggle to create the log area
    document.getElementById('diag-toggle').click();

    // Call addLog with an XSS payload
    window.addLog('<img src="x" onerror="alert(1)">');

    // Check if the DOM has an img element
    const logArea = document.getElementById('log-area');
    const imgs = logArea.querySelectorAll('img');

    let xssFailed = false;
    if (imgs.length > 0) {
      console.log('VULNERABLE: img tag created');
      xssFailed = true;
    } else {
      console.log('SECURE: img tag NOT created');
      console.log('Log content:', logArea.innerHTML);
    }

    // --- New Tests for initUI ---
    let initUIFailed = false;
    try {
        console.log('\nRunning initUI tests...');
        // Test 1: UI initialization
        const app = document.getElementById('custom-app');
        assert.ok(app !== null, '#custom-app should be created');

        // Test 2: Asset injection
        const meta = document.querySelector('meta[name="viewport"]');
        assert.ok(meta !== null, 'meta viewport should be injected');

        // Test 3: Multiple calls to initUI don't duplicate
        const initialCount = document.querySelectorAll('#custom-app').length;
        assert.strictEqual(initialCount, 1, 'Should be exactly one #custom-app initially');

        window.initUI(); // Manual second call

        const afterCount = document.querySelectorAll('#custom-app').length;
        assert.strictEqual(afterCount, 1, 'Should still be exactly one #custom-app after manual call');

        console.log('✅ initUI tests passed');
    } catch (err) {
        console.error('❌ initUI Test failed:', err.message);
        initUIFailed = true;
    }

    if (xssFailed || initUIFailed) {
        process.exit(1);
    }
    console.log("Test 1 passed!");
}, 500);

// === Test 2: Fetch Error Handling Coverage ===
console.log("\nStarting Test 2: Fetch Error Handling");
const dom2 = new JSDOM('<!DOCTYPE html><html><body>' +
  '<input id="in-target" value="10" />' +
  '<input id="in-target-slider" value="10" />' +
  '<input id="sw-reduction" type="checkbox" />' +
  '<div id="btn-restart"></div>' +
  '</body></html>', {
  runScripts: 'dangerously',
  url: "http://localhost/"
});
const window2 = dom2.window;
const document2 = window2.document;

window2.matchMedia = () => ({ matches: false });
window2.EventSource = class {
  addEventListener() {}
  onerror() {}
};

// Mock fetch to simulate a network error
window2.fetch = async (url, options) => {
    throw new Error('Network error');
};

// Mock confirm to always say yes for the restart button
window2.confirm = () => true;

// Inject hooks to capture logs
let jsCode2 = fs.readFileSync('./moonshiner_ui_v24.js', 'utf8');
jsCode2 = jsCode2.replace('const entities = {', 'window.entities = {');
jsCode2 = jsCode2.replace('function addLog(msg) {', 'window.addLogs = window.addLogs || []; function addLog(msg) { window.addLogs.push(msg);');

const scriptEl2 = document2.createElement('script');
scriptEl2.textContent = jsCode2;
document2.body.appendChild(scriptEl2);

setTimeout(() => {
    // Trigger Number input error
    if (window2.entities && window2.entities['number-target_column_temp']) {
        const cfg = window2.entities['number-target_column_temp'];
        const input = document2.getElementById(cfg.in);
        if (input) {
            input.value = "20";
            input.dispatchEvent(new window2.Event('change'));
        }
    }

    // Trigger Switch toggle error
    if (window2.entities && window2.entities['switch-use_reduction_coefficient']) {
        const cfg = window2.entities['switch-use_reduction_coefficient'];
        const switchEl = document2.getElementById(cfg.sw);
        if (switchEl) {
            switchEl.checked = true;
            switchEl.dispatchEvent(new window2.Event('change'));
        }
    }

    // Trigger Restart error
    const restartBtn = document2.getElementById('btn-restart');
    if (restartBtn) {
        restartBtn.click();
    }

    setTimeout(() => {
        let passed = true;

        if (!window2.addLogs || !window2.addLogs.some(log => log.includes('Failed to update number-target_column_temp'))) {
            console.error("FAIL: Missing log for number update error");
            passed = false;
        }

        if (!window2.addLogs || !window2.addLogs.some(log => log.includes('Failed to toggle switch-use_reduction_coefficient'))) {
            console.error("FAIL: Missing log for switch toggle error");
            passed = false;
        }

        if (!window2.addLogs || !window2.addLogs.some(log => log.includes('Failed to restart'))) {
            console.error("FAIL: Missing log for restart error");
            passed = false;
        }

        if (passed) {
            console.log("SECURE: All fetch error handling tests passed!");

            // === Test 3: sessionStorage Error Handling Coverage ===
            console.log("\nStarting Test 3: sessionStorage Error Handling");
            const dom3 = new JSDOM('<!DOCTYPE html><html><body>' +
              '<input id="in-target" value="10" />' +
              '</body></html>', {
              runScripts: 'dangerously',
              url: "http://localhost/"
            });
            const window3 = dom3.window;
            const document3 = window3.document;

            window3.matchMedia = () => ({ matches: false });
            window3.EventSource = class {
              addEventListener() {}
              onerror() {}
            };

            // Mock sessionStorage to throw error
            let getItemCalled = false;
            Object.defineProperty(window3, 'sessionStorage', {
              value: {
                getItem: function() {
                  getItemCalled = true;
                  throw new Error('sessionStorage access denied');
                },
                setItem: function() {}
              },
              writable: true
            });

            // Run script
            const scriptEl3 = document3.createElement('script');
            scriptEl3.textContent = fs.readFileSync('./moonshiner_ui_v24.js', 'utf8');
            document3.body.appendChild(scriptEl3);

            setTimeout(() => {
                if (getItemCalled) {
                    console.log("SECURE: restoreSession handled sessionStorage error without crashing!");
                    process.exit(0);
                } else {
                    console.error("FAIL: sessionStorage.getItem was not called during initialization");
                    process.exit(1);
                }
            }, 500);

        } else {
            console.error("FAIL: Some tests failed, logs captured:", window2.addLogs);
            process.exit(1);
        }
    }, 1000);
}, 500);
