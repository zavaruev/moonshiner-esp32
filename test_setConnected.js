const fs = require('fs');

async function runTests() {
  const { JSDOM } = require('jsdom');

  let jsCode = fs.readFileSync('./moonshiner_ui_v24.js', 'utf8');

  // Expose setConnected to window so we can test it
  jsCode = jsCode.replace('function setConnected(state) {', 'window.setConnected = function(state) {');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (!condition) {
      console.error('❌ FAIL: ' + message);
      failed++;
    } else {
      console.log('✅ PASS: ' + message);
      passed++;
    }
  }

  function setupDOM() {
    const html = `
    <!DOCTYPE html>
    <html>
    <body>
      <div id="conn-status"></div>
      <div id="val-msg"></div>
      <div id="val-diag-conn"></div>
    </body>
    </html>
    `;

    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'http://localhost/'
    });

    const window = dom.window;
    const document = window.document;

    window.matchMedia = () => ({ matches: false });
    window.EventSource = class {
      addEventListener() {}
      onerror() {}
    };

    const scriptEl = document.createElement('script');
    scriptEl.textContent = jsCode;
    document.body.appendChild(scriptEl);

    return new Promise(resolve => setTimeout(() => resolve({ window, document }), 100));
  }

  console.log('Running tests for setConnected...');

  // Test 1: Connected state
  let { window, document } = await setupDOM();
  window.setConnected(true);

  let connEl = document.getElementById('conn-status');
  let dc = document.getElementById('val-diag-conn');
  let runEl = document.getElementById('val-msg');

  assert(connEl.textContent === 'Connected', 'connEl.textContent is Connected');
  assert(connEl.classList.contains('disconnected') === false, 'connEl should not have disconnected class');
  assert(connEl.style.opacity === '1', 'connEl.style.opacity is 1');
  assert(runEl.style.opacity === '0.4', 'runEl.style.opacity is 0.4');
  assert(dc.innerHTML === 'Connected', 'dc.innerHTML is Connected');

  // Test 2: Disconnected state
  ({ window, document } = await setupDOM());
  window.setConnected(false);

  connEl = document.getElementById('conn-status');
  dc = document.getElementById('val-diag-conn');
  runEl = document.getElementById('val-msg');

  assert(connEl.textContent === 'Disconnected', 'connEl.textContent is Disconnected');
  assert(connEl.classList.contains('disconnected') === true, 'connEl should have disconnected class');
  assert(connEl.style.opacity === '1', 'connEl.style.opacity is 1');
  assert(runEl.style.opacity === '', 'runEl.style.opacity is empty');
  assert(dc.innerHTML === 'Disconnected', 'dc.innerHTML is Disconnected');

  // Test 3: Missing elements
  ({ window, document } = await setupDOM());
  document.body.innerHTML = ''; // Clear DOM
  let threwError = false;
  try {
    window.setConnected(true);
  } catch (e) {
    threwError = true;
  }
  assert(!threwError, 'Should handle missing elements gracefully without throwing');

  console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
