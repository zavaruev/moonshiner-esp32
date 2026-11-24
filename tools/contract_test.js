#!/usr/bin/env node
/*
 * HTTP contract tests for the native firmware. Without --live-write the tests
 * are read-only and can be pointed at the old ESPHome device to prove the
 * native contract is not there yet (RED). With --live-write they also exercise
 * setters and SSE change frames against the native firmware after cutover.
 *
 *   node tools/contract_test.js [base-url] [--live-write]
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const liveWrite = args.includes('--live-write');
const base = (args.find(a => a.startsWith('http')) || 'http://192.168.22.231').replace(/\/$/, '');

function credentials() {
  if (process.env.ESP32_USER && process.env.ESP32_PASS) {
    return { user: process.env.ESP32_USER, pass: process.env.ESP32_PASS };
  }
  const file = path.join(__dirname, '..', 'secrets.yaml');
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, 'utf8');
    const read = key => {
      const m = text.match(new RegExp('^' + key + ':\\s*"?([^"\\n]+)"?\\s*$', 'm'));
      return m ? m[1].trim() : '';
    };
    return { user: read('web_username'), pass: read('web_password') };
  }
  throw new Error('no credentials: set ESP32_USER/ESP32_PASS or provide secrets.yaml');
}
const auth = 'Basic ' + Buffer.from(`${credentials().user}:${credentials().pass}`).toString('base64');

function request(method, target, { body, auth: useAuth = true, timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + target, {
      method,
      headers: Object.assign(
        { Connection: 'close' },
        useAuth ? { Authorization: auth } : {},
        body ? { 'Content-Type': 'application/octet-stream', 'Content-Length': Buffer.byteLength(body) } : {}
      ),
      timeout,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout on ' + target)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function collectSse(seconds) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + '/events', { headers: { Authorization: auth, Accept: 'text/event-stream' }, timeout: (seconds + 2) * 1000 }, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('SSE HTTP ' + res.statusCode)); }
      let tail = '';
      const frames = [];
      res.on('data', chunk => {
        tail += chunk.toString('utf8');
        let i;
        while ((i = tail.indexOf('\n\n')) >= 0) {
          frames.push(tail.slice(0, i));
          tail = tail.slice(i + 2);
        }
      });
      setTimeout(() => { req.destroy(); resolve(frames); }, seconds * 1000);
    });
    req.on('error', reject);
    req.end();
  });
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (e) {
    results.push(['FAIL', name + ' — ' + e.message]);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function main() {
  await check('GET / without auth is rejected', async () => {
    const r = await request('GET', '/', { auth: false });
    assert(r.status === 401, `expected 401, got ${r.status}`);
  });

  await check('GET / serves the UI shell referencing /ui.js', async () => {
    const r = await request('GET', '/');
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(r.body.includes('/ui.js'), 'body does not reference /ui.js');
  });

  await check('GET /ui.js serves the v24 frontend', async () => {
    const r = await request('GET', '/ui.js');
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(r.body.length > 1000, `UI too small: ${r.body.length}`);
    assert(r.body.includes('custom-app'), 'body is not moonshiner_ui_v24.js');
    if (r.headers['content-encoding'] === 'gzip') {
      assert(r.body.length > 100, 'gzip body empty');
    }
  });

  await check('GET /sensor/Column Temperature returns a numeric state', async () => {
    const r = await request('GET', '/sensor/Column%20Temperature');
    assert(r.status === 200, `expected 200, got ${r.status}`);
    let value = r.body;
    try { value = JSON.parse(r.body).value; } catch (_) { /* plain text */ }
    assert(Number.isFinite(parseFloat(value)), `not numeric: ${r.body.slice(0, 80)}`);
  });

  await check('SSE emits a state heartbeat within 4 s', async () => {
    const frames = await collectSse(4);
    const states = frames.filter(f => f.startsWith('event: state') || /\nevent: state/.test(f));
    assert(states.length > 0, `no state frames in ${frames.length} frames`);
    const heartbeats = states.filter(f => /"id"\s*:\s*"(sensor-uptime|sensor-uptime)/.test(f));
    assert(heartbeats.length > 0, 'no sensor-uptime heartbeat frame');
  });

  await check('GET /api/ota reports two slots and running version', async () => {
    const r = await request('GET', '/api/ota');
    assert(r.status === 200, `expected 200, got ${r.status}`);
    const st = JSON.parse(r.body);
    for (const key of ['state', 'written', 'total', 'part', 'target', 'running', 'run_ver']) {
      assert(Object.prototype.hasOwnProperty.call(st, key), `missing ${key}`);
    }
    assert(st.target >= 0, 'no inactive OTA slot');
  });

  if (liveWrite) {
    await check('POST setter updates the registry and emits a change frame', async () => {
      const sse = collectSse(3);
      await new Promise(r => setTimeout(r, 150));
      const post = await request('POST', '/number/Delta/set?value=0.45');
      assert(post.status === 200 || post.status === 204, `POST status ${post.status}`);
      const frames = await sse;
      assert(frames.some(f => /"id"\s*:\s*"(number-delta|number\/Delta)"/.test(f)), 'no delta change frame');
      const get = await request('GET', '/number/Delta');
      const value = parseFloat(get.body.startsWith('{') ? JSON.parse(get.body).value : get.body);
      assert(Math.abs(value - 0.45) < 0.001, `delta not applied: ${value}`);
    });
  }

  for (const [status, name] of results) console.log(status + ' ' + name);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error('test harness error:', e.message); process.exit(2); });
