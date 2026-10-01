const fs = require('fs');

async function runTests() {
  const { JSDOM } = require('jsdom');
  let jsCode = fs.readFileSync('./moonshiner_ui_v24.js', 'utf8');

  // Expose renderLog to window so we can test it
  jsCode = jsCode.replace('function renderLog() {', 'window.renderLog = function() {');

  // Expose the log buffer and cached element
  jsCode = jsCode.replace('let logBuffer = [];', 'window.getLogBuffer = () => logBuffer; window.setLogBuffer = (lb) => logBuffer = lb; let logBuffer = [];');
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

  console.log('Running tests for renderLog...');

  try {
    console.log('\n--- Test 1: Normal renderLog ---');
    let { window, document } = await setupDOM();
    let logArea = document.getElementById('log-area');
    logArea.innerHTML = '';

    // Set buffer directly and call renderLog
    window.setLogBuffer(['Rendered message 1', 'Rendered message 2']);
    window.renderLog();

    assert(logArea.children.length === 2, 'log-area has 2 children (got ' + logArea.children.length + ')');
    let found1 = false;
    let found2 = false;
    for (let i = 0; i < logArea.children.length; i++) {
        if (logArea.children[i].textContent.includes('Rendered message 1')) found1 = true;
        if (logArea.children[i].textContent.includes('Rendered message 2')) found2 = true;
    }
    assert(found1 && found2, 'Children contain the correct messages');

    console.log('\n--- Test 2: XSS prevention via textContent ---');
    ({ window, document } = await setupDOM());
    logArea = document.getElementById('log-area');
    logArea.innerHTML = '';

    window.setLogBuffer(['<script>alert(1)</script>']);
    window.renderLog();

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

    console.log('\n--- Test 3: Missing log-area element ---');
    ({ window, document } = await setupDOM(''));

    // Since initUI recreates `#log-area`, we need to simulate it being MISSING again.
    logArea = document.getElementById('log-area');
    if (logArea) logArea.remove();

    window.setLogAreaElement(null);
    window.setLogBuffer(['Lost message']);

    let threwError = false;
    try {
      window.renderLog();
    } catch (e) {
      threwError = true;
    }
    assert(!threwError, 'Should handle missing element without throwing');

    // Now provide an element so we can test the fallback finding logic
    let newLogArea = document.createElement('div');
    newLogArea.id = 'log-area';
    document.body.appendChild(newLogArea);

    window.renderLog();
    assert(newLogArea.children.length === 1, 'log-area found and populated (got ' + newLogArea.children.length + ')');
    assert(newLogArea.children[0].textContent.includes('Lost message'), 'Contains correct message');

  } catch (e) {
    console.error('Unhandled error:', e);
    failed++;
  }

  console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests();
