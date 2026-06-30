import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readSensor } from './esp32-api';

// We test readSensor as it is a minimal wrapper over doFetch
// doFetch is not exported directly, so we test it via the exposed API readSensor
describe('doFetch (via readSensor)', () => {
  const originalFetch = global.fetch;
  const mockFetch = vi.fn();

  beforeEach(() => {
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    mockFetch.mockClear();
  });

  it('should return successfully when fetch returns a 200 OK', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '{"value": 12.3, "state": "12.3"}'
    });

    const result = await readSensor('test_sensor');
    expect(result).toEqual({ entity: 'test_sensor', value: 12.3, raw: '12.3' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/sensor/test_sensor'),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('should throw an error when fetch returns a 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(readSensor('test_sensor')).rejects.toThrow('HTTP 404 on /sensor/test_sensor');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should throw an error when fetch returns a 500', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(readSensor('test_sensor')).rejects.toThrow('HTTP 500 on /sensor/test_sensor');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
