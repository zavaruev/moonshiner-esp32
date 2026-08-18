const fs = require('fs');

async function runTests() {
  const { JSDOM } = require('jsdom');

  let jsCode = fs.readFileSync('./moonshiner_ui_v24.js', 'utf8');

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

  console.log('Running tests for window.onerror...');

  let { window, document } = await setupDOM();

  // Test scenario 1: Basic error
  const msg1 = "First test error message";
  const result1 = window.onerror(msg1, "test.js", 10, 5, new Error("Test 1"));

  assert(result1 === false, 'window.onerror should return false');

  const errorDivs1 = Array.from(document.body.querySelectorAll('div')).filter(div => div.style.zIndex === '9999');
  assert(errorDivs1.length === 1, 'Should create exactly one error div');

  const errorDiv1 = errorDivs1[0];
  if (errorDiv1) {
    // Note: jsdom does not fully implement innerText, so we check both innerText and textContent to be safe depending on jsdom version behavior
    const content = errorDiv1.innerText || errorDiv1.textContent;
    assert(content === 'Error: ' + msg1, 'Div should contain the correct error message');
    assert(errorDiv1.style.position === 'fixed', 'Div should have position:fixed');
    assert(errorDiv1.style.zIndex === '9999', 'Div should have z-index:9999');
    assert(errorDiv1.style.background === 'rgb(29, 29, 31)' || errorDiv1.style.backgroundColor === 'rgb(29, 29, 31)' || errorDiv1.style.background === '#1d1d1f', 'Div should have correct background color');
  }

  // Test scenario 2: Multiple errors should create multiple divs
  const msg2 = "Second test error message";
  window.onerror(msg2, "test.js", 20, 5, new Error("Test 2"));

  const errorDivs2 = Array.from(document.body.querySelectorAll('div')).filter(div => div.style.zIndex === '9999');
  assert(errorDivs2.length === 2, 'Should create a second error div when another error occurs');

  const errorDiv2 = errorDivs2[1];
  if (errorDiv2) {
    const content = errorDiv2.innerText || errorDiv2.textContent;
    assert(content === 'Error: ' + msg2, 'Second div should contain the correct second error message');
  }

  console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
