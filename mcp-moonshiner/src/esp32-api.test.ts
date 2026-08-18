import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getBase, getAuth, parseState, readSensor, readTextSensor, readBinarySensor, setNumber, toggleSwitch, pressButton, getAllTemperatures, getAllStatus } from './esp32-api';

describe('security validation for entity IDs', () => {
  const invalidIds = ['invalid/id', '../id', 'id?param=1', 'my-id-with-dashes', 'id!'];

  invalidIds.forEach(id => {
    it(`should throw on invalid ID in readSensor: ${id}`, async () => {
      await expect(readSensor(id)).rejects.toThrow(`Invalid entity ID`);
    });

    it(`should throw on invalid ID in readTextSensor: ${id}`, async () => {
      await expect(readTextSensor(id)).rejects.toThrow(`Invalid entity ID`);
    });

    it(`should throw on invalid ID in setNumber: ${id}`, () => {
      expect(() => setNumber(id, 42)).toThrow(`Invalid entity ID`);
    });

    it(`should throw on invalid ID in toggleSwitch: ${id}`, () => {
      expect(() => toggleSwitch(id, true)).toThrow(`Invalid entity ID`);
    });

    it(`should throw on invalid ID in pressButton: ${id}`, () => {
      expect(() => pressButton(id)).toThrow(`Invalid entity ID`);
    });
  });
});

describe('parseState', () => {
  it('should parse valid JSON with a numeric value', () => {
    const raw = JSON.stringify({ id: 'sensor1', value: 42.5, state: '42.5' });
    const result = parseState(raw);
    expect(result).toEqual({ value: 42.5, state: '42.5' });
  });

  it('should parse valid JSON with a null value', () => {
    const raw = JSON.stringify({ id: 'sensor2', value: null, state: 'unknown' });
    const result = parseState(raw);
    expect(result).toEqual({ value: null, state: 'unknown' });
  });

  it('should parse valid JSON with a missing value (undefined -> null)', () => {
    const raw = JSON.stringify({ id: 'sensor3', state: 'ON' });
    const result = parseState(raw);
    expect(result).toEqual({ value: null, state: 'ON' });
  });

  it('should fall through to plain text parsing for invalid JSON starting with {', () => {
    const raw = '{invalid-json, state: "ON"}';
    const result = parseState(raw);
    expect(result).toEqual({ value: null, state: '{invalid-json, state: "ON"}' });
  });

  it('should fallback to plain text if JSON is valid but does not have value/state properties', () => {
    const raw = JSON.stringify({ id: 'sensor-3' });
    expect(parseState(raw)).toEqual({ value: null, state: undefined });
  });

  it('should parse plain text numbers', () => {
    const raw = '42.5';
    const result = parseState(raw);
    expect(result).toEqual({ value: 42.5, state: '42.5' });
  });

  it('should parse non-numeric plain text as null value', () => {
    const raw = 'ON';
    const result = parseState(raw);
    expect(result).toEqual({ value: null, state: 'ON' });
  });

  it('should parse non-numeric plain text strings like unknown as null value', () => {
    const raw = 'unknown';
    const result = parseState(raw);
    expect(result).toEqual({ value: null, state: 'unknown' });
  });

  it('should parse empty string as null value', () => {
    const raw = '';
    const result = parseState(raw);
    expect(result).toEqual({ value: null, state: '' });
  });

  it('falls back to plain text for malformed JSON', () => {
    const raw = '{badjson';
    const result = parseState(raw);
    expect(result).toEqual({ value: null, state: '{badjson' });
  });

  it('falls back to plain text for malformed JSON starting with curly brace but containing a valid number at start', () => {
    const raw = '{123';
    const result = parseState(raw);
    expect(result).toEqual({ value: null, state: '{123' });
  });

  it('should log a console.error when JSON parse fails on input starting with {', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const raw = '{invalid}';
    parseState(raw);
    expect(errorSpy).toHaveBeenCalledWith('JSON parse error:', expect.any(Error), 'Raw input:', raw);
    errorSpy.mockRestore();
  });

  it('should truncate raw input in console.error if it exceeds 100 characters', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const raw = '{' + 'a'.repeat(150) + '}';
    parseState(raw);
    const expectedSafeRaw = raw.substring(0, 100) + '...';
    expect(errorSpy).toHaveBeenCalledWith('JSON parse error:', expect.any(Error), 'Raw input:', expectedSafeRaw);
    errorSpy.mockRestore();
  });
});

describe('API error handling (doFetch/doPost)', () => {
  const originalEnv = process.env.ESP32_URL;
  beforeEach(() => {
    process.env.ESP32_URL = 'http://test.local';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env.ESP32_URL = originalEnv;
    vi.unstubAllGlobals();
  });

  it('doFetch should throw an error when response is not ok', async () => {
    // We test this via readSensor which uses doFetch internally
    const { readSensor } = await import('./esp32-api');

    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    } as any);

    await expect(readSensor('test_sensor')).rejects.toThrow('HTTP 404 on /sensor/test_sensor');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/sensor/test_sensor'), expect.any(Object));
  });

  it('doPost should throw an error when response is not ok', async () => {
    const { setNumber } = await import('./esp32-api');

    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    } as any);

    await expect(setNumber('target_temp', 78.5)).rejects.toThrow('HTTP 500 on POST /number/target_temp/set?value=78.5');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/number/target_temp/set?value=78.5'), expect.objectContaining({ method: 'POST' }));
  });

  it('should propagate network errors thrown by fetch', async () => {
    const { readSensor } = await import('./esp32-api');

    const mockFetch = vi.mocked(fetch);
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(readSensor('test_sensor')).rejects.toThrow('Network error');
  });
});

describe('readBinarySensor', () => {
  const originalEnv = process.env.ESP32_URL;
  beforeEach(() => {
    process.env.ESP32_URL = 'http://test.local';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env.ESP32_URL = originalEnv;
    vi.unstubAllGlobals();
  });

  it('should return true when sensor state is ON', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('ON')
    } as any);

    const result = await readBinarySensor('my_sensor');
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/binary_sensor/my_sensor'), expect.any(Object));
  });

  it('should return false when sensor state is OFF', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('OFF')
    } as any);

    const result = await readBinarySensor('my_sensor');
    expect(result).toBe(false);
  });


  it('should return false when sensor state is unknown', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('unknown')
    } as any);

    const result = await readBinarySensor('my_sensor');
    expect(result).toBe(false);
  });

  it('should throw an error when fetch fails', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Server Error'
    } as any);

    await expect(readBinarySensor('my_sensor')).rejects.toThrow('HTTP 500 on /binary_sensor/my_sensor');
  });

  it('should throw on invalid entity ID', async () => {
    await expect(readBinarySensor('invalid/id')).rejects.toThrow('Invalid entity ID: invalid/id');
  });
});

describe('getAllTemperatures', () => {
  const originalEnv = process.env.ESP32_URL;
  beforeEach(() => {
    process.env.ESP32_URL = 'http://test.local';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env.ESP32_URL = originalEnv;
    vi.unstubAllGlobals();
  });

  it('should fetch column and tank temperatures', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ id: 'sensor-col', value: 78.5, state: '78.5' }))
    } as any).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ id: 'sensor-tank', value: 92.1, state: '92.1' }))
    } as any);

    const result = await getAllTemperatures();
    expect(result).toEqual({
      column: { entity: 'column_temperature', value: 78.5, raw: '78.5' },
      tank: { entity: 'tank_temperature', value: 92.1, raw: '92.1' }
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/sensor/Column%20Temperature'), expect.any(Object));
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/sensor/Tank%20Temperature'), expect.any(Object));
  });

  it('should throw if any read fails', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ id: 'sensor-col', value: 78.5, state: '78.5' }))
    } as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Server Error'
    } as any);

    await expect(getAllTemperatures()).rejects.toThrow('HTTP 500 on /sensor/Tank%20Temperature');
  });
});

describe('getAllStatus', () => {
  const originalEnv = process.env.ESP32_URL;

  beforeEach(() => {
    process.env.ESP32_URL = 'http://test.local';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env.ESP32_URL = originalEnv;
    vi.unstubAllGlobals();
  });

  it('should fetch all required sensors and return a mapped record', async () => {
    const mockFetch = vi.mocked(fetch);

    // Provide mocked responses based on URL called
    mockFetch.mockImplementation(async (urlInfo, options) => {
      let state = 'unknown';
      let value = null;
      let textResponse = '';

      const url = urlInfo.toString();

      if (url.includes('/sensor/Column%20Temperature')) {
        textResponse = JSON.stringify({ id: 'column_temperature', value: 78.5, state: '78.5' });
      } else if (url.includes('/sensor/Tank%20Temperature')) {
        textResponse = JSON.stringify({ id: 'tank_temperature', value: 95.0, state: '95.0' });
      } else if (url.includes('/sensor/Uptime')) {
        textResponse = JSON.stringify({ id: 'uptime', value: 3600, state: '3600' });
      } else if (url.includes('/sensor/WiFi%20Signal')) {
        textResponse = JSON.stringify({ id: 'wifi_signal', value: -65, state: '-65' });
      } else if (url.includes('/sensor/Free%20Heap')) {
        textResponse = JSON.stringify({ id: 'free_heap', value: 102400, state: '102400' });
      } else if (url.includes('/text_sensor/Status%20Message')) {
        textResponse = JSON.stringify({ id: 'status_message', value: null, state: 'Heating' });
      } else if (url.includes('/binary_sensor/Distilling%20Status')) {
        textResponse = 'OFF';
      } else if (url.includes('/binary_sensor/Heating%20Status')) {
        textResponse = 'ON';
      } else if (url.includes('/binary_sensor/Alarm%20Status')) {
        textResponse = 'OFF';
      } else if (url.includes('/text_sensor/Reset%20Reason')) {
        textResponse = JSON.stringify({ id: 'reset_reason', value: null, state: 'PowerOn' });
      }

      return {
        ok: true,
        text: () => Promise.resolve(textResponse)
      } as any;
    });

    const status = await getAllStatus();

    expect(status).toEqual({
      temperatures: { column: 78.5, tank: 95.0 },
      uptime_sec: 3600,
      wifi_signal_dbm: -65,
      free_heap_bytes: 102400,
      status: 'Heating',
      distilling: false,
      heating: true,
      alarm: false,
      reset_reason: 'PowerOn',
    });

    expect(mockFetch).toHaveBeenCalledTimes(10);
  });

  it('should propagate errors if a fetch fails', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Server Error'
    } as any);

    await expect(getAllStatus()).rejects.toThrow('HTTP 500 on /sensor/Column%20Temperature');
  });
});

describe('getBase', () => {
  const originalEnv = process.env.ESP32_URL;

  afterEach(() => {
    process.env.ESP32_URL = originalEnv;
  });

  it('should return protocol and host from a valid ESP32_URL', () => {
    process.env.ESP32_URL = 'http://192.168.1.100';
    expect(getBase()).toBe('http://192.168.1.100');
  });

  it('should strip path, query, and credentials from ESP32_URL', () => {
    process.env.ESP32_URL = 'https://user:pass@example.local:8443/api/v1?token=123';
    expect(getBase()).toBe('https://example.local:8443');
  });

  it('should throw an error when ESP32_URL is not set', () => {
    delete process.env.ESP32_URL;
    expect(() => getBase()).toThrow('ESP32_URL environment variable is not set. A secure URL must be provided.');
  });
});

describe('getAuth', () => {
  const originalUrl = process.env.ESP32_URL;
  const originalUser = process.env.ESP32_USER;
  const originalPass = process.env.ESP32_PASS;

  beforeEach(() => {
    delete process.env.ESP32_URL;
    delete process.env.ESP32_USER;
    delete process.env.ESP32_PASS;
  });

  afterEach(() => {
    process.env.ESP32_URL = originalUrl;
    process.env.ESP32_USER = originalUser;
    process.env.ESP32_PASS = originalPass;
  });

  it('should throw an error if ESP32_URL is not set', () => {
    expect(() => getAuth()).toThrow('ESP32_URL environment variable is not set. A secure URL must be provided.');
  });

  it('should return empty string if no user or password provided', () => {
    process.env.ESP32_URL = 'http://example.local';
    expect(getAuth()).toBe('');
  });

  it('should return base64 basic auth string if user and password provided via URL', () => {
    process.env.ESP32_URL = 'http://admin:secret@example.local';
    const expected = 'Basic ' + Buffer.from('admin:secret').toString('base64');
    expect(getAuth()).toBe(expected);
  });

  it('should return base64 basic auth string if user and password provided via environment variables', () => {
    process.env.ESP32_URL = 'http://example.local';
    process.env.ESP32_USER = 'envuser';
    process.env.ESP32_PASS = 'envpass';
    const expected = 'Basic ' + Buffer.from('envuser:envpass').toString('base64');
    expect(getAuth()).toBe(expected);
  });

  it('should prioritize URL credentials over environment variables', () => {
    process.env.ESP32_URL = 'http://urluser:urlpass@example.local';
    process.env.ESP32_USER = 'envuser';
    process.env.ESP32_PASS = 'envpass';
    const expected = 'Basic ' + Buffer.from('urluser:urlpass').toString('base64');
    expect(getAuth()).toBe(expected);
  });

  it('should handle user provided without password in environment variables', () => {
    process.env.ESP32_URL = 'http://example.local';
    process.env.ESP32_USER = 'justuser';
    const expected = 'Basic ' + Buffer.from('justuser:').toString('base64');
    expect(getAuth()).toBe(expected);
  });

  it('should handle user provided without password in URL', () => {
    process.env.ESP32_URL = 'http://urluser@example.local';
    const expected = 'Basic ' + Buffer.from('urluser:').toString('base64');
    expect(getAuth()).toBe(expected);
  });
});
