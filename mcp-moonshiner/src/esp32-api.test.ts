import { describe, it, expect } from 'vitest';
import { parseState } from './esp32-api';

describe('parseState', () => {
  it('parses valid JSON successfully', () => {
    const raw = JSON.stringify({ id: 'sensor1', value: 42.5, state: '42.5' });
    const result = parseState(raw);
    expect(result).toEqual({ value: 42.5, state: '42.5' });
  });

  it('parses valid JSON with null value successfully', () => {
    const raw = JSON.stringify({ id: 'sensor2', value: null, state: 'unknown' });
    const result = parseState(raw);
    expect(result).toEqual({ value: null, state: 'unknown' });
  });

  it('falls back to plain text for plain text strings', () => {
    const raw = '24.7';
    const result = parseState(raw);
    expect(result).toEqual({ value: 24.7, state: '24.7' });
  });

  it('handles non-numeric plain text strings correctly', () => {
    const raw = 'ON';
    const result = parseState(raw);
    expect(result).toEqual({ value: null, state: 'ON' });
  });

  it('falls back to plain text for malformed JSON', () => {
    const raw = '{badjson';
    const result = parseState(raw);
    // parseFloat('{badjson') is NaN, so value should be null, state should be the raw string
    expect(result).toEqual({ value: null, state: '{badjson' });
  });

  it('falls back to plain text for malformed JSON starting with curly brace but containing a valid number at start', () => {
    // If the string is something like '{123'
    const raw = '{123';
    const result = parseState(raw);
    // parseFloat('{123') is NaN
    expect(result).toEqual({ value: null, state: '{123' });
  });
});
