import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readSensor } from './esp32-api.js';

describe('readSensor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should call fetch with the correct URL for a sensor', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '{"value": 25.5, "state": "25.5"}',
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await readSensor('my_sensor');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://192.168.22.231/sensor/my_sensor',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
    expect(result).toEqual({ entity: 'my_sensor', value: 25.5, raw: '25.5' });
  });

  it('should correctly parse a JSON response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '{"id":"sensor-my_sensor","value":42.1,"state":"42.1"}',
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await readSensor('my_sensor');
    expect(result).toEqual({ entity: 'my_sensor', value: 42.1, raw: '42.1' });
  });

  it('should correctly parse a plain text response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '33.3',
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await readSensor('text_sensor');
    expect(result).toEqual({ entity: 'text_sensor', value: 33.3, raw: '33.3' });
  });

  it('should correctly parse a plain text non-number response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'ON',
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await readSensor('status_sensor');
    expect(result).toEqual({ entity: 'status_sensor', value: null, raw: 'ON' });
  });

  it('should throw an error on HTTP failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(readSensor('missing_sensor')).rejects.toThrow('HTTP 404 on /sensor/missing_sensor');
  });

  it('should propagate fetch network errors', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    await expect(readSensor('any_sensor')).rejects.toThrow('Network error');
  });
});
