import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { setNumber, toggleSwitch, pressButton } from './esp32-api.ts';

describe('doPost network errors', () => {
  afterEach(() => {
    // Note: t.mock.method automatically restores the mock after the test if it belongs to the test context.
    // We don't have to manually restore it if we attach it to the test context `t`.
  });

  test('should throw error on HTTP 500 for setNumber', async (t) => {
    t.mock.method(global, 'fetch', async () => {
      return new Response(null, { status: 500 });
    });

    await assert.rejects(
      () => setNumber('test_number', 42),
      { message: 'HTTP 500 on POST /number/test_number/set?value=42' }
    );
  });

  test('should throw error on HTTP 404 for toggleSwitch', async (t) => {
    t.mock.method(global, 'fetch', async () => {
      return new Response(null, { status: 404 });
    });

    await assert.rejects(
      () => toggleSwitch('test_switch', true),
      { message: 'HTTP 404 on POST /switch/test_switch/turn_on' }
    );
  });

  test('should throw error on network failure (fetch throws)', async (t) => {
    t.mock.method(global, 'fetch', async () => {
      throw new TypeError('fetch failed');
    });

    await assert.rejects(
      () => pressButton('test_btn'),
      { message: 'fetch failed' }
    );
  });
});
