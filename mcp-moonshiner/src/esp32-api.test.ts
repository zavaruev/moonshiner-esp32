import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseState, readSensor, setNumber, toggleSwitch, pressButton, getBase, getAuth } from './esp32-api';

describe('URL environment validation', () => {
  const originalEnv = process.env.ESP32_URL;

  afterEach(() => {
    process.env.ESP32_URL = originalEnv;
  });

  it('getBase should throw if ESP32_URL is not set', () => {
    delete process.env.ESP32_URL;
    expect(() => getBase()).toThrow('ESP32_URL environment variable is not set. A secure URL must be provided.');
  });

  it('getAuth should throw if ESP32_URL is not set', () => {
    delete process.env.ESP32_URL;
    expect(() => getAuth()).toThrow('ESP32_URL environment variable is not set. A secure URL must be provided.');
  });

  it('getBase should return host if ESP32_URL is set', () => {
    process.env.ESP32_URL = 'http://test.local';
    expect(getBase()).toBe('http://test.local');
  });
});

describe('security validation for entity IDs', () => {
  const invalidIds = ['invalid/id', '../id', 'id?param=1', 'my-id-with-dashes', 'id!'];

  invalidIds.forEach(id => {
    it(`should throw on invalid ID in readSensor: ${id}`, async () => {
      await expect(readSensor(id)).rejects.toThrow(`Invalid entity ID`);
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
