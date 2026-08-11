const fs = require('fs');

async function runTests() {
  const { JSDOM } = require('jsdom');
  const assert = require('assert');

  let jsCode = fs.readFileSync('./moonshiner_ui_v24.js', 'utf8');

  // Since the file wraps everything in an IIFE and does not export the function
  // nor does it expose it to window, the established pattern in this repository
  // (see tests.js and test_setConnected.js) is to use string replacement to expose it.
  jsCode = jsCode.replace('function updateTempVisuals(sensorId, tempC) {', 'window.updateTempVisuals = function(sensorId, tempC) {');
  // Wait, if it uses element IDs captured inside IIFE like `const colTempCard = document.getElementById(...)` we have to make sure they exist *when* the script runs.

  let passed = 0;
  let failed = 0;

  function runTest(name, fn) {
    try {
        fn();
        console.log(`✅ PASS: ${name}`);
        passed++;
    } catch (e) {
        console.error(`❌ FAIL: ${name} - ${e.message}`);
        failed++;
    }
  }

  function setupDOM() {
    const html = `
    <!DOCTYPE html>
    <html>
    <body>
      <div id="col-temp-card"></div>
      <div id="tank-temp-card"></div>
      <svg><circle id="col-temp-arc"></circle></svg>
      <svg><circle id="tank-temp-arc"></circle></svg>
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

  let { window, document } = await setupDOM();

  if (!window.updateTempVisuals) {
      console.error('updateTempVisuals is not exposed!');
      process.exit(1);
  }

  console.log("Running updateTempVisuals tests...");

  runTest('temp < 60 applies cold classes and primary color', () => {
    window.updateTempVisuals('sensor-column_temperature', 50);
    const card = document.getElementById('col-temp-card');
    const arc = document.getElementById('col-temp-arc');
    assert.strictEqual(card.classList.contains('temp-cold'), true);
    assert.strictEqual(card.classList.contains('temp-warm'), false);
    assert.strictEqual(arc.getAttribute('stroke'), 'var(--primary)');
  });

  runTest('temp < 80 applies warm classes and warn color', () => {
    window.updateTempVisuals('sensor-column_temperature', 70);
    const card = document.getElementById('col-temp-card');
    const arc = document.getElementById('col-temp-arc');
    assert.strictEqual(card.classList.contains('temp-warm'), true);
    assert.strictEqual(card.classList.contains('temp-cold'), false);
    assert.strictEqual(arc.getAttribute('stroke'), 'var(--warn)');
  });

  runTest('temp >= 80 applies hot classes and danger color', () => {
    window.updateTempVisuals('sensor-tank_temperature', 90);
    const tankCard = document.getElementById('tank-temp-card');
    const tankArc = document.getElementById('tank-temp-arc');
    assert.strictEqual(tankCard.classList.contains('temp-hot'), true);
    assert.strictEqual(tankArc.getAttribute('stroke'), 'var(--danger)');

    // calculation of stroke-dashoffset:
    // temp = 90
    // frac = min(1, max(0, (90 - 20) / 80)) = 70 / 80 = 0.875
    // circ = 88
    // offset = 88 - 0.875 * 88 = 88 - 77 = 11
    assert.strictEqual(tankArc.getAttribute('stroke-dashoffset'), '11');
  });

  runTest('null temp does not crash', () => {
    assert.doesNotThrow(() => {
        window.updateTempVisuals('sensor-column_temperature', null);
    });
  });

  if (failed > 0) {
      process.exit(1);
  }
}
runTests();
