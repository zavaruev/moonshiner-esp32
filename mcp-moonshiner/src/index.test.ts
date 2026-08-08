import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockTool = vi.fn();
const mockConnect = vi.fn();

// First, mock the dependencies
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  return {
    McpServer: class {
      tool = mockTool;
      connect = mockConnect;
    }
  };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  return {
    StdioServerTransport: class {}
  };
});

// Create mock functions before mocking module
const readSensor = vi.fn();
const readNumber = vi.fn();
const readTextSensor = vi.fn();
const readBinarySensor = vi.fn();
const setNumber = vi.fn();
const toggleSwitch = vi.fn();
const pressButton = vi.fn();
const getAllTemperatures = vi.fn();
const getAllStatus = vi.fn();

vi.mock('./esp32-api.js', () => {
  return {
    readSensor,
    readNumber,
    readTextSensor,
    readBinarySensor,
    setNumber,
    toggleSwitch,
    pressButton,
    getAllTemperatures,
    getAllStatus,
  };
});

describe('index.ts (MCP Server)', () => {
  let originalArgv: any;
  let originalExit: any;
  let originalEnv: any;
  let originalStderrWrite: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Save original process properties
    originalArgv = process.argv;
    originalExit = process.exit;
    originalEnv = process.env;
    originalStderrWrite = process.stderr.write;

    // Mock for parseArgs()
    process.argv = ['node', 'index.js'];
    process.env = { ...originalEnv };
    process.exit = vi.fn() as any;
    process.stderr.write = vi.fn() as any;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.argv = originalArgv;
    process.exit = originalExit;
    process.env = originalEnv;
    process.stderr.write = originalStderrWrite;
  });

  it('registers expected tools on the server', async () => {
    // Import the module (which will execute the top-level code)
    await import('./index.js');

    expect(mockTool).toHaveBeenCalledWith('read_temperatures', expect.any(String), expect.any(Object), expect.any(Function));
    expect(mockTool).toHaveBeenCalledWith('get_status', expect.any(String), expect.any(Object), expect.any(Function));
    expect(mockTool).toHaveBeenCalledWith('get_entity', expect.any(String), expect.any(Object), expect.any(Function));
    expect(mockTool).toHaveBeenCalledWith('set_target_temp', expect.any(String), expect.any(Object), expect.any(Function));
    expect(mockTool).toHaveBeenCalledWith('toggle_reduction', expect.any(String), expect.any(Object), expect.any(Function));
    expect(mockTool).toHaveBeenCalledWith('restart_process', expect.any(String), expect.any(Object), expect.any(Function));
  });

  it('tool: read_temperatures returns JSON formatted temperatures', async () => {
    await import('./index.js');

    // Find the read_temperatures tool callback
    const toolCall = mockTool.mock.calls.find((call: any[]) => call[0] === 'read_temperatures');
    const callback = toolCall[3];

    // Mock the API response
    getAllTemperatures.mockResolvedValue({
      column: { value: 78.5, raw: '78.5' },
      tank: { value: 92.1, raw: '92.1' }
    });

    // Execute callback
    const result = await callback();

    // Verify results
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual({
      column: { value: 78.5, raw: '78.5' },
      tank: { value: 92.1, raw: '92.1' }
    });
  });

  it('tool: read_temperatures returns error on failure', async () => {
    await import('./index.js');
    const toolCall = mockTool.mock.calls.find((call: any[]) => call[0] === 'read_temperatures');
    const callback = toolCall[3];

    getAllTemperatures.mockRejectedValue(new Error('API failed'));

    const result = await callback();

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: API failed');
  });

  it('tool: get_status returns JSON formatted status', async () => {
    await import('./index.js');

    // Find the get_status tool callback
    const toolCall = mockTool.mock.calls.find((call: any[]) => call[0] === 'get_status');
    const callback = toolCall[3];

    // Mock the API response
    getAllStatus.mockResolvedValue({
      temperatures: { column: 78.5, tank: 92.1 },
      uptime_sec: 1234,
      wifi_signal_dbm: -50,
      free_heap_bytes: 123456,
      status: 'Heating',
      distilling: true,
      heating: true,
      alarm: false,
      reset_reason: 'Power on'
    });

    // Execute callback
    const result = await callback();

    // Verify results
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual({
      temperatures: { column: 78.5, tank: 92.1 },
      uptime_sec: 1234,
      wifi_signal_dbm: -50,
      free_heap_bytes: 123456,
      status: 'Heating',
      distilling: true,
      heating: true,
      alarm: false,
      reset_reason: 'Power on'
    });
  });

  it('tool: get_entity returns entity state for a sensor', async () => {
    await import('./index.js');

    const toolCall = mockTool.mock.calls.find((call: any[]) => call[0] === 'get_entity');
    const callback = toolCall[3];

    readSensor.mockResolvedValue({ value: 42, state: '42' });

    const result = await callback({ entity_id: 'test_sensor', type: 'sensor' });

    expect(readSensor).toHaveBeenCalledWith('test_sensor');
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual({ value: 42, state: '42' });
  });

  it('tool: get_entity returns entity state for a number', async () => {
    await import('./index.js');

    const toolCall = mockTool.mock.calls.find((call: any[]) => call[0] === 'get_entity');
    const callback = toolCall[3];

    readNumber.mockResolvedValue({ value: 80, state: '80' });

    const result = await callback({ entity_id: 'test_num', type: 'number' });

    expect(readNumber).toHaveBeenCalledWith('test_num');
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual({ value: 80, state: '80' });
  });

  it('tool: get_entity returns entity state for a text_sensor', async () => {
    await import('./index.js');

    const toolCall = mockTool.mock.calls.find((call: any[]) => call[0] === 'get_entity');
    const callback = toolCall[3];

    readTextSensor.mockResolvedValue('Heating');

    const result = await callback({ entity_id: 'test_text', type: 'text_sensor' });

    expect(readTextSensor).toHaveBeenCalledWith('test_text');
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toEqual('Heating');
  });

  it('tool: get_entity returns entity state for a binary_sensor', async () => {
    await import('./index.js');

    const toolCall = mockTool.mock.calls.find((call: any[]) => call[0] === 'get_entity');
    const callback = toolCall[3];

    readBinarySensor.mockResolvedValue(true);

    const result = await callback({ entity_id: 'test_bin', type: 'binary_sensor' });

    expect(readBinarySensor).toHaveBeenCalledWith('test_bin');
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toEqual('true');
  });

  it('tool: set_target_temp sets the number', async () => {
    await import('./index.js');

    const toolCall = mockTool.mock.calls.find((call: any[]) => call[0] === 'set_target_temp');
    const callback = toolCall[3];

    setNumber.mockResolvedValue();

    const result = await callback({ value: 78.5 });

    expect(setNumber).toHaveBeenCalledWith('target_column_temp', 78.5);
    expect(result.content[0].text).toBe('OK: target_column_temp → 78.5');
  });

  it('tool: toggle_reduction toggles the switch', async () => {
    await import('./index.js');

    const toolCall = mockTool.mock.calls.find((call: any[]) => call[0] === 'toggle_reduction');
    const callback = toolCall[3];

    toggleSwitch.mockResolvedValue();

    const result = await callback({ state: true });

    expect(toggleSwitch).toHaveBeenCalledWith('use_reduction_coefficient', true);
    expect(result.content[0].text).toBe('OK: use_reduction_coefficient → ON');
  });

  it('tool: toggle_reduction toggles the switch to false', async () => {
    await import('./index.js');

    const toolCall = mockTool.mock.calls.find((call: any[]) => call[0] === 'toggle_reduction');
    const callback = toolCall[3];

    toggleSwitch.mockResolvedValue();

    const result = await callback({ state: false });

    expect(toggleSwitch).toHaveBeenCalledWith('use_reduction_coefficient', false);
    expect(result.content[0].text).toBe('OK: use_reduction_coefficient → OFF');
  });

  it('tool: restart_process presses the button', async () => {
    await import('./index.js');

    const toolCall = mockTool.mock.calls.find((call: any[]) => call[0] === 'restart_process');
    const callback = toolCall[3];

    pressButton.mockResolvedValue();

    const result = await callback({});

    expect(pressButton).toHaveBeenCalledWith('restart_process');
    expect(result.content[0].text).toBe('OK: distillation process restarted');
  });

  it('tool: get_entity returns error on failure', async () => {
    await import('./index.js');

    const toolCall = mockTool.mock.calls.find((call: any[]) => call[0] === 'get_entity');
    const callback = toolCall[3];

    readSensor.mockRejectedValue(new Error('Invalid entity ID'));

    const result = await callback({ entity_id: 'invalid/id', type: 'sensor' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: Invalid entity ID');
  });

  it('tool: get_status returns error on failure', async () => {
    await import('./index.js');

    const toolCall = mockTool.mock.calls.find((call: any[]) => call[0] === 'get_status');
    const callback = toolCall[3];

    getAllStatus.mockRejectedValue(new Error('Network error'));

    const result = await callback({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: Network error');
  });

  it('tool: set_target_temp returns error on failure', async () => {
    await import('./index.js');

    const toolCall = mockTool.mock.calls.find((call: any[]) => call[0] === 'set_target_temp');
    const callback = toolCall[3];

    setNumber.mockRejectedValue(new Error('Set number error'));

    const result = await callback({ value: 78.5 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: Set number error');
  });

  it('tool: toggle_reduction returns error on failure', async () => {
    await import('./index.js');

    const toolCall = mockTool.mock.calls.find((call: any[]) => call[0] === 'toggle_reduction');
    const callback = toolCall[3];

    toggleSwitch.mockRejectedValue(new Error('Toggle switch error'));

    const result = await callback({ state: true });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: Toggle switch error');
  });

  it('tool: restart_process returns error on failure', async () => {
    await import('./index.js');

    const toolCall = mockTool.mock.calls.find((call: any[]) => call[0] === 'restart_process');
    const callback = toolCall[3];

    pressButton.mockRejectedValue(new Error('Press button error'));

    const result = await callback({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: Press button error');
  });
});
