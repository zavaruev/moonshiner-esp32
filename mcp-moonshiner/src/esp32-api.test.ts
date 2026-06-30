import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readBinarySensor } from './esp32-api';

const MOCK_BASE = 'http://192.168.22.231';

describe('readBinarySensor', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return true when sensor state is ON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => '{"id":"binary_sensor-heating_status","value":null,"state":"ON"}',
    } as Response);

    const result = await readBinarySensor('heating_status');
    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledWith(`${MOCK_BASE}/binary_sensor/heating_status`, expect.any(Object));
  });

  it('should return false when sensor state is OFF', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => '{"id":"binary_sensor-heating_status","value":null,"state":"OFF"}',
    } as Response);

    const result = await readBinarySensor('heating_status');
    expect(result).toBe(false);
  });

  it('should return false for unrecognized states', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => '{"id":"binary_sensor-heating_status","value":null,"state":"UNKNOWN"}',
    } as Response);

    const result = await readBinarySensor('heating_status');
    expect(result).toBe(false);
  });

  it('should handle plain text OFF response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => 'OFF',
    } as Response);

    const result = await readBinarySensor('heating_status');
    expect(result).toBe(false);
  });

  it('should handle plain text ON response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => 'ON',
    } as Response);

    const result = await readBinarySensor('heating_status');
    expect(result).toBe(true);
  });

  it('should throw an error if the fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    await expect(readBinarySensor('nonexistent')).rejects.toThrow('HTTP 404 on /binary_sensor/nonexistent');
  });
});
