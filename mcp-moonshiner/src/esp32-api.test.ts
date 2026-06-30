import { describe, it, expect } from 'vitest';
import { parseState } from './esp32-api.js';

describe('parseState', () => {
  it('should parse valid JSON with a numeric value', () => {
    const raw = JSON.stringify({ id: 'sensor-1', value: 42.5, state: '42.5' });
    expect(parseState(raw)).toEqual({ value: 42.5, state: '42.5' });
  });

  it('should parse valid JSON with a null value', () => {
    const raw = JSON.stringify({ id: 'sensor-2', value: null, state: 'unknown' });
    expect(parseState(raw)).toEqual({ value: null, state: 'unknown' });
  });

  it('should fallback to plain text if JSON starts with { but is invalid', () => {
    const raw = '{invalid-json';
    expect(parseState(raw)).toEqual({ value: null, state: '{invalid-json' });
  });

  it('should fallback to plain text if JSON is valid but does not have value/state properties expected (it should just use what it gets, or fallback on null/undefined)', () => {
    const raw = JSON.stringify({ id: 'sensor-3' });
    // j.value is undefined -> null, j.state is undefined -> undefined (though state is supposed to be string)
    // Actually the function returns j.value ?? null, and j.state
    expect(parseState(raw)).toEqual({ value: null, state: undefined });
  });

  it('should parse plain text numbers', () => {
    const raw = '42.5';
    expect(parseState(raw)).toEqual({ value: 42.5, state: '42.5' });
  });

  it('should parse plain text non-numbers as null value', () => {
    const raw = 'ON';
    expect(parseState(raw)).toEqual({ value: null, state: 'ON' });
  });
});
