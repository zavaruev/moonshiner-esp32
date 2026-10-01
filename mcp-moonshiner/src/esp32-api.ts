export function getBase(): string {
  const u = process.env.ESP32_URL;
  if (!u) {
    throw new Error('ESP32_URL environment variable is not set. A secure URL must be provided.');
  }
  const p = new URL(u);
  return `${p.protocol}//${p.host}`;
}
export function getAuth(): string {
  const u = process.env.ESP32_URL;
  if (!u) {
    throw new Error('ESP32_URL environment variable is not set. A secure URL must be provided.');
  }
  const p = new URL(u);
  const user = p.username || process.env.ESP32_USER || '';
  const pass = p.password || process.env.ESP32_PASS || '';
  return user ? 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64') : '';
}

interface EspEntityJson {
  id: string;
  value: number | null;
  state: string;
}

/**
 * Parses a raw entity payload from the ESPHome web_server v3 REST API.
 *
 * The device returns JSON objects like {"value":72.5,"state":"72.5 °C"} for
 * typed entities, but plain text for others. Strategy:
 *   1. If the payload looks like JSON (wrapped in {} or []), try to parse it.
 *      On failure fall through with value=null and the raw string as state -
 *      deliberately silent since PR #92: parse failures here are routine
 *      (partial reads mid-frame) and logging them only polluted MCP stderr.
 *   2. Otherwise, attempt a bare numeric parse; non-numerics stay null.
 */
export function parseState(raw: string): { value: number | null; state: string } {
  const trimmed = raw.trim();
  const isJsonLike = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
  if (isJsonLike) {
    try {
      const j: EspEntityJson = JSON.parse(trimmed);
      return { value: j.value ?? null, state: j.state };
    } catch (e) {
      return { value: null, state: raw };
    }
  }
  // fallback: plain text
  const n = parseFloat(raw);
  return { value: isNaN(n) ? null : n, state: raw };
}

async function doFetch(url: string): Promise<string> {
  const res = await fetch(`${getBase()}${url}`, { headers: { Authorization: getAuth(), 'Connection': 'close' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.text();
}

async function doPost(url: string): Promise<void> {
  const res = await fetch(`${getBase()}${url}`, {
    method: 'POST',
    headers: { Authorization: getAuth(), 'Content-Length': '0', 'Connection': 'close' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on POST ${url}`);
}

export interface TempReading {
  entity: string;
  value: number | null;
  raw: string;
}

export function validateId(id: string) {
  if (!/^[a-zA-Z0-9_]+$/.test(id)) {
    throw new Error(`Invalid entity ID: ${id}`);
  }
}

const ENTITY_NAMES: Record<string, string> = {
  column_temperature: 'Column Temperature',
  tank_temperature: 'Tank Temperature',
  uptime: 'Uptime',
  wifi_signal: 'WiFi Signal',
  free_heap: 'Free Heap',
  loop_time: 'Loop Time',
  target_column_temp: 'Target Column Temp',
  delta: 'Delta',
  max_tank_temp: 'Max Tank Temp',
  coef_otbora: 'Coef Otbora',
  heater_power: 'Heater Power',
  valve_high_setting: 'Valve High Setting',
  valve_low_setting: 'Valve Low Setting',
  buzzer_volume: 'Buzzer Volume',
  refresh_ui: 'Refresh UI',
  restart_process: 'Restart Process',
  use_reduction_coefficient: 'Use Reduction Coefficient',
  disable_upper_valve_closing: 'Disable Upper Valve Closing',
  distilling_status: 'Distilling Status',
  heating_status: 'Heating Status',
  alarm_status: 'Alarm Status',
  status_message: 'Status Message',
  diagnostic_message: 'Diagnostic Message',
  reset_reason: 'Reset Reason',
};

async function readEntity(type: string, id: string): Promise<TempReading> {
  validateId(id);
  const name = ENTITY_NAMES[id] ?? id;
  const raw = await doFetch(`/${type}/${encodeURIComponent(name)}`);
  const { value, state } = parseState(raw);
  return { entity: id, value, raw: state };
}

export const readSensor = (id: string) => readEntity('sensor', id);
export const readNumber = (id: string) => readEntity('number', id);
export const readTextSensor = async (id: string): Promise<string> => {
  const res = await readEntity('text_sensor', id);
  return res.raw;
};
export const readBinarySensor = async (id: string): Promise<boolean> => {
  const res = await readEntity('binary_sensor', id);
  return res.raw === 'ON';
};

export const setNumber = (id: string, value: number) => {
  validateId(id);
  const name = ENTITY_NAMES[id] ?? id;
  return doPost(`/number/${encodeURIComponent(name)}/set?value=${value}`);
};
export const toggleSwitch = (id: string, on: boolean) => {
  validateId(id);
  const name = ENTITY_NAMES[id] ?? id;
  return doPost(`/switch/${encodeURIComponent(name)}/${on ? 'turn_on' : 'turn_off'}`);
};
export const pressButton = (id: string) => {
  validateId(id);
  const name = ENTITY_NAMES[id] ?? id;
  return doPost(`/button/${encodeURIComponent(name)}/press`);
};

export async function getAllTemperatures(): Promise<{ column: TempReading; tank: TempReading }> {
  const [column, tank] = await Promise.all([
    readSensor('column_temperature'),
    readSensor('tank_temperature'),
  ]);
  return { column, tank };
}

export async function getAllStatus(): Promise<Record<string, unknown>> {
  // Lazy task factories instead of eagerly-created promises: requests only
  // start when their batch runs, so at most `batchSize` HTTP connections to
  // the ESP32 are open at any moment (the device has a small lwIP socket
  // pool) and no rejection can ever fire before it has an awaiter.
  const reads: (() => Promise<unknown>)[] = [
    () => readSensor('column_temperature'),
    () => readSensor('tank_temperature'),
    () => readSensor('uptime'),
    () => readSensor('wifi_signal'),
    () => readSensor('free_heap'),
    () => readTextSensor('status_message'),
    () => readBinarySensor('distilling_status'),
    () => readBinarySensor('heating_status'),
    () => readBinarySensor('alarm_status'),
    () => readTextSensor('reset_reason'),
  ];
  const results = await runBatched(reads, 2);
  const column = results[0] as TempReading;
  const tank = results[1] as TempReading;
  const uptime = results[2] as TempReading;
  const wifi = results[3] as TempReading;
  const heap = results[4] as TempReading;
  const msg = results[5] as string;
  const distilling = results[6] as boolean;
  const heating = results[7] as boolean;
  const alarm = results[8] as boolean;
  const resetReason = results[9] as string;
  return {
    temperatures: { column: column.value, tank: tank.value },
    uptime_sec: uptime.value,
    wifi_signal_dbm: wifi.value,
    free_heap_bytes: heap.value,
    status: msg,
    distilling,
    heating,
    alarm,
    reset_reason: resetReason,
  };
}

/**
 * Runs async tasks with bounded concurrency, preserving input order in the
 * output. Tasks are thunks so nothing is executed until it starts;
 * Uses a rolling window approach to keep concurrency level at batchSize.
 */
export async function runBatched<T>(tasks: (() => Promise<T>)[], batchSize: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let currentIndex = 0;
  let hasError = false;

  async function worker() {
    while (currentIndex < tasks.length && !hasError) {
      const index = currentIndex++;
      try {
        results[index] = await tasks[index]();
      } catch (error) {
        hasError = true;
        throw error; // Will propagate to Promise.all
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(batchSize, tasks.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}
