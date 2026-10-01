// Test: SSE entity-id format compatibility.
//
// ESPHome changed the shape of the `id` field in SSE state frames:
//   firmware < 2026.9  -> object_id form  {"id":"sensor-column_temperature"}
//   firmware >= 2026.9 -> display-name form {"id":"sensor/Column Temperature",
//                                            "domain":"sensor","name":"..."}
// The UI must accept BOTH, otherwise every readout stays on its "--" placeholder
// while the SSE link itself looks healthy (regression seen on 2026.9.1).
//
// This test drives the real 'state' listener with each format and asserts the
// DOM value updates, plus that sessionStorage keys stay canonical so
// restoreSession keeps matching after a refresh.

const fs = require('fs');
const { JSDOM } = require('jsdom');
const assert = require('assert');

console.log("\nStarting Test: SSE entity id formats");

const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <span id="val-col-temp">--</span>
  <span id="val-msg"></span>
</body></html>`, {
  runScripts: 'dangerously',
  url: "http://localhost/"
});
const window = dom.window;
const document = window.document;

window.matchMedia = () => ({ matches: false });

// Mock EventSource so we can capture the real 'state' listener and fire frames
// manually, without opening a network connection.
let eventListeners = {};
window.EventSource = class {
  constructor(url) { this.url = url; }
  addEventListener(event, callback) {
    if (!eventListeners[event]) eventListeners[event] = [];
    eventListeners[event].push(callback);
  }
  onerror() {}
};

const scriptEl = document.createElement('script');
scriptEl.textContent = fs.readFileSync('./moonshiner_ui_v24.js', 'utf8');
document.body.appendChild(scriptEl);

setTimeout(() => {
    try {
        const stateListeners = eventListeners['state'];
        assert.ok(stateListeners && stateListeners.length > 0,
            'EventSource should have a state event listener');
        const onState = stateListeners[0];
        const fire = (payload) => onState({ data: JSON.stringify(payload) });

        // --- 1. New format (ESPHome 2026.9+): id is "domain/Display Name" ---
        document.getElementById('val-col-temp').textContent = '--';
        fire({
            id: 'sensor/Column Temperature',
            domain: 'sensor',
            name: 'Column Temperature',
            state: '78.50 °C',
            value: 78.5
        });
        assert.strictEqual(document.getElementById('val-col-temp').textContent, '78.50°',
            'New display-name id should update the column temperature readout');

        // --- 2. Old format (ESPHome < 2026.9): id is "domain-object_id" ---
        document.getElementById('val-col-temp').textContent = '--';
        fire({ id: 'sensor-column_temperature', state: '42.00 °C' });
        assert.strictEqual(document.getElementById('val-col-temp').textContent, '42.00°',
            'Legacy object_id format must keep working');

        // --- 3. New format on a text sensor (status message / DONE button) ---
        fire({ id: 'text_sensor/Status Message', domain: 'text_sensor', state: 'DONE' });
        assert.strictEqual(document.getElementById('val-msg').textContent, 'DONE',
            'New display-name id should update the status message');

        // --- 4. sessionStorage keys must be canonical across both formats ---
        const legacyKey = 'ms_sensor-column_temperature';
        assert.strictEqual(window.sessionStorage.getItem(legacyKey), '42.00 °C',
            'Legacy id must store under the canonical sessionStorage key');
        fire({ id: 'sensor/Column Temperature', state: '55.25 °C' });
        assert.strictEqual(window.sessionStorage.getItem(legacyKey), '55.25 °C',
            'New id must store under the SAME canonical sessionStorage key');

        // --- 5. Genuinely unknown ids must not corrupt a real entity's state.
        //     The handler logs them and returns BEFORE the sessionStorage write,
        //     so neither the raw nor any canonical key may be populated. ---
        fire({ id: 'sensor/Does Not Exist', state: '1' });
        assert.strictEqual(window.sessionStorage.getItem('ms_sensor/Does Not Exist'), null,
            'Unknown entity must not be persisted');
        assert.strictEqual(window.sessionStorage.getItem('ms_sensor-does_not_exist'), null,
            'Unknown entity must not write into another entity\'s key');

        console.log("✅ SSE entity id format tests passed!");
        process.exit(0);
    } catch (err) {
        console.error("❌ SSE entity id format test failed:", err.message);
        process.exit(1);
    }
}, 500);
