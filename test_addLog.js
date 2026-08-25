const fs = require('fs');

async function runTests() {
  const { JSDOM } = require('jsdom');
  let jsCode = fs.readFileSync('./moonshiner_ui_v24.js', 'utf8');

  // Instead of using brittle string replacements to expose internal variables,
  // we will execute the UI code within JSDOM and interact with it exactly as the
  // user and browser would: by inspecting the DOM it creates and mutates.

  // The only exception is exposing the addLog function itself, which is nested inside initUI
  jsCode = jsCode.replace('function addLog(msg) {', 'window.addLog = function(msg) {');

  // We DO need to clear the internal buffer between tests so they are isolated.
  // We can do this cleanly by replacing the buffer array instantiation
  jsCode = jsCode.replace('let logBuffer = [];', 'window.getLogBuffer = () => logBuffer; window.setLogBuffer = (lb) => logBuffer = lb; let logBuffer = [];');
  // And the cached element so we can reset it between tests
  jsCode = jsCode.replace('let logAreaElement = null;', 'window.setLogAreaElement = (el) => logAreaElement = el; let logAreaElement = null;');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (!condition) {
      console.error('❌ FAIL: ' + message);
      failed++;
      return false;
    } else {
      console.log('✅ PASS: ' + message);
      passed++;
      return true;
    }
  }

  function setupDOM(initialHtml = '<div id="log-area"></div>') {
    const html = `
    <!DOCTYPE html>
    <html>
    <body>
      ${initialHtml}
    </body>
    </html>
    `;
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' });
    const window = dom.window;
    const document = window.document;

    window.matchMedia = () => ({ matches: false });
    window.EventSource = class { addEventListener() {} onerror() {} };

    const scriptEl = document.createElement('script');
    scriptEl.textContent = jsCode;
    document.body.appendChild(scriptEl);

    // Give it a moment to initialize
    return new Promise(resolve => setTimeout(() => resolve({ window, document }), 100));
  }

  console.log('Running tests for addLog...');

  try {
    console.log('\n--- Test 1: Normal add log ---');
    let { window, document } = await setupDOM();
    let logArea = document.getElementById('log-area');
    logArea.innerHTML = ''; // Clear initialization logs
    window.setLogBuffer([]);

    window.addLog('Test message 1');
    assert(logArea.children.length === 1, 'log-area has 1 child (got ' + logArea.children.length + ')');
    let found = false;
    for (let i = 0; i < logArea.children.length; i++) {
        if (logArea.children[i].textContent.includes('Test message 1')) found = true;
    }
    assert(found, 'Child contains the message');

    console.log('\n--- Test 2: XSS prevention ---');
    ({ window, document } = await setupDOM());
    logArea = document.getElementById('log-area');
    logArea.innerHTML = '';
    window.setLogBuffer([]);

    window.addLog('<script>alert(1)</script>');
    assert(logArea.children.length === 1, 'log-area has 1 child');

    let scriptFound = false;
    let safeFound = false;
    for (let i = 0; i < logArea.children.length; i++) {
        const text = logArea.children[i].textContent;
        const html = logArea.children[i].innerHTML;
        if (text.includes('<script>')) {
            scriptFound = true;
            if (html.includes('&lt;script&gt;') || !html.includes('<script>')) {
                safeFound = true;
            }
        }
    }
    assert(scriptFound, 'Text content should contain raw tags');
    assert(safeFound, 'XSS tags should be escaped in HTML');

    console.log('\n--- Test 3: Exceeding MAX_LOG (20) ---');
    ({ window, document } = await setupDOM());
    logArea = document.getElementById('log-area');
    logArea.innerHTML = '';
    window.setLogBuffer([]);

    for (let i = 0; i < 25; i++) {
      window.addLog('Message ' + i);
    }

    // addLog limits children to MAX_LOG (20)
    assert(logArea.children.length === 20, 'log-area should have exactly 20 children (got ' + logArea.children.length + ')');

    let hasMessage5 = false;
    let hasMessage24 = false;
    for (let i = 0; i < logArea.children.length; i++) {
        if (logArea.children[i].textContent.includes('Message 5')) hasMessage5 = true;
        if (logArea.children[i].textContent.includes('Message 24')) hasMessage24 = true;
    }
    assert(hasMessage5, 'Should contain oldest message "Message 5"');
    assert(hasMessage24, 'Should contain newest message "Message 24"');

    console.log('\n--- Test 4: Missing log-area initially, then finding it ---');
    ({ window, document } = await setupDOM(''));
    // We pass an empty DOM. initUI will create `#custom-app` and `#log-area`.
    // Since initUI recreates `#log-area`, we need to simulate it being MISSING again.
    logArea = document.getElementById('log-area');
    if (logArea) logArea.remove();
    window.setLogAreaElement(null); // Reset cache
    window.setLogBuffer([]);

    window.addLog('Buffered 1');
    window.addLog('Buffered 2');

    let threwError = false;
    try {
      window.addLog('Buffered 3');
    } catch (e) {
      threwError = true;
    }
    assert(!threwError, 'Should handle missing element without throwing');

    // Create the element again. addLog checks document.getElementById again if cached element isn't found
    let newLogArea = document.createElement('div');
    newLogArea.id = 'log-area';
    document.body.appendChild(newLogArea);

    window.addLog('Buffered 4');

    // It should render all buffered items plus the new one
    assert(newLogArea.children.length === 4, 'log-area should have 4 children after discovery (got ' + newLogArea.children.length + ')');

    let hasBuffered1 = false;
    let hasBuffered4 = false;
    for (let i = 0; i < newLogArea.children.length; i++) {
        if (newLogArea.children[i].textContent.includes('Buffered 1')) hasBuffered1 = true;
        if (newLogArea.children[i].textContent.includes('Buffered 4')) hasBuffered4 = true;
    }
    assert(hasBuffered1, 'Should contain buffered message "Buffered 1"');
    assert(hasBuffered4, 'Should contain new message "Buffered 4"');

  } catch (e) {
    console.error('Unhandled error:', e);
    failed++;
  }

  console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests();
