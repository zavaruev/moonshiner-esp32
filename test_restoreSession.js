const fs = require('fs');
const { JSDOM } = require('jsdom');

async function runTests() {
  console.log('Running tests for restoreSession error handling...');

  let jsCode = fs.readFileSync('./moonshiner_ui_v24.js', 'utf8');

  // We want to verify restoreSession executes without throwing an uncaught exception
  // when sessionStorage.getItem throws an error.

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
      <div id="val-col-temp"></div>
    </body>
    </html>
    `;

    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'http://localhost/'
    });

    const window = dom.window;
    const document = window.document;

    // Mock missing APIs
    window.matchMedia = () => ({ matches: false });
    window.EventSource = class {
      addEventListener() {}
      onerror() {}
    };

    let getItemCalled = false;

    // Mock sessionStorage to throw an error
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: function(key) {
          getItemCalled = true;
          throw new Error('sessionStorage access denied');
        },
        setItem: function() {},
        removeItem: function() {},
        clear: function() {}
      },
      writable: true
    });

    // We can wrap the IIFE in a try-catch on our side to capture any errors that leak out
    // But since JSDOM runs it dangerously, we can also just run it and see if the process exits or logs an error.
    let threwError = false;
    let errorMessage = '';

    window.onerror = function(msg, url, line, col, error) {
      // The IIFE has an onerror handler, so we might want to capture it differently,
      // but actually, if restoreSession is synchronous in the IIFE, any unhandled error will throw synchronously during parsing.
      threwError = true;
      errorMessage = msg;
    };

    try {
      const scriptEl = document.createElement('script');
      scriptEl.textContent = jsCode;
      document.body.appendChild(scriptEl);
    } catch (e) {
      threwError = true;
      errorMessage = e.message;
    }

    return new Promise(resolve => setTimeout(() => resolve({ window, document, getItemCalled, threwError, errorMessage }), 100));
  }

  const { getItemCalled, threwError, errorMessage } = await setupDOM();

  assert(getItemCalled, 'sessionStorage.getItem should be called by restoreSession');
  assert(!threwError, 'UI initialization should not crash when sessionStorage.getItem throws (' + (threwError ? errorMessage : 'no error') + ')');

  console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
