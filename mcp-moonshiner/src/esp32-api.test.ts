import { describe, it, expect } from 'vitest';
import { parseState, readSensor, setNumber, toggleSwitch, pressButton } from './esp32-api';

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
