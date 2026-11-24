#!/usr/bin/env node
/*
 * Fast, fail-loud OTA client. Unlike ota_push.py it never retries a stalled
 * chunk for a minute: if the device reboots mid-transfer the script exits
 * immediately and can be run again after the device comes back.
 *
 *   node tools/ota_push.js build/moonshiner.bin [http://192.168.22.231]
 */
'use strict';

const fs = require('fs');
const http = require('http');

const image = process.argv[2];
const base = (process.argv[3] || 'http://192.168.22.231').replace(/\/$/, '');
const url = new URL(base);
const user = process.env.ESP32_USER;
const pass = process.env.ESP32_PASS;
if (!image || !user || !pass) {
  console.error('usage: ESP32_USER=... ESP32_PASS=... node tools/ota_push.js <image> [base]');
  process.exit(2);
}
const data = fs.readFileSync(image);
const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

function request(path, body, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname, port: url.port || 80, path, method: body ? 'POST' : 'GET',
      headers: Object.assign({ Authorization: auth, Connection: 'close' },
        body ? { 'Content-Length': body.length, 'Content-Type': 'application/octet-stream' } : {}),
      timeout,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try { resolve({ status: res.statusCode, json: JSON.parse(text) }); }
        catch (_) { reject(new Error(`bad JSON from ${path}: ${text.slice(0, 120)}`)); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`timeout on ${path}`)));
    req.on('error', reject);
    if (body) req.end(body); else req.end();
  });
}

async function main() {
  let st = await request('/api/ota');
  console.log('running', st.json.run_ver, 'slot', st.json.running, 'state', st.json.state);
  if (st.json.state !== 0) {
    st = await request('/api/ota?abort=1', Buffer.alloc(0));
    if (st.json.state !== 0) throw new Error('cannot abort previous transfer');
  }
  st = await request(`/api/ota?size=${data.length}`, Buffer.alloc(0));
  if (st.json.state !== 1) throw new Error('device refused transfer: ' + st.json.error);
  console.log('uploading', data.length, 'bytes...');
  const chunk = 65536;
  for (let offset = 0; offset < data.length; offset += chunk) {
    const slice = data.subarray(offset, Math.min(offset + chunk, data.length));
    const result = await request(`/api/ota?offset=${offset}`, slice, 8000);
    if (result.json.state !== 1 || result.json.written < offset + slice.length) {
      throw new Error(`write rejected at ${offset}: ${result.json.error || JSON.stringify(result.json)}`);
    }
    if (offset % (chunk * 32) === 0) process.stdout.write(`${Math.round(offset * 100 / data.length)}% `);
  }
  console.log('\nverifying...');
  st = await request('/api/ota?commit=1', Buffer.alloc(0), 20000);
  if (st.json.state !== 3) throw new Error('verify failed: ' + st.json.error);
  console.log('OK:', st.json.tgt_ver, 'in slot', st.json.target, '- device reboots itself');
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
