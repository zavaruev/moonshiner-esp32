const BASE = process.env.ESP32_URL || 'http://192.168.22.231';

interface EspEntityJson {
  id: string;
  value: number | null;
  state: string;
}

export function parseState(raw: string): { value: number | null; state: string } {
  // ESPHome v3 returns JSON for sensors/numbers
  if (raw.startsWith('{')) {
    try {
      const j: EspEntityJson = JSON.parse(raw);
      return { value: j.value ?? null, state: j.state };
    } catch { /* fall through */ }
  }
  // fallback: plain text
  const n = parseFloat(raw);
  return { value: isNaN(n) ? null : n, state: raw };
}

async function doFetch(url: string): Promise<string> {
  const res = await fetch(`${BASE}${url}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.text();
}

async function doPost(url: string): Promise<void> {
  const res = await fetch(`${BASE}${url}`, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on POST ${url}`);
}

export interface TempReading {
  entity: string;
  value: number | null;
  raw: string;
}

async function readEntity(type: string, id: string): Promise<TempReading> {
  const raw = await doFetch(`/${type}/${id}`);
  const { value, state } = parseState(raw);
  return { entity: id, value, raw: state };
}

export const readSensor = (id: string) => readEntity('sensor', id);
export const readNumber = (id: string) => readEntity('number', id);
export const readTextSensor = async (id: string): Promise<string> => {
  const raw = await doFetch(`/text_sensor/${id}`);
  const { state } = parseState(raw);
  return state;
};
export const readBinarySensor = async (id: string): Promise<boolean> => {
  const raw = await doFetch(`/binary_sensor/${id}`);
  const { state } = parseState(raw);
  return state === 'ON';
};

export const setNumber = (id: string, value: number) => doPost(`/number/${id}/set?value=${value}`);
export const toggleSwitch = (id: string, on: boolean) => doPost(`/switch/${id}/${on ? 'turn_on' : 'turn_off'}`);
export const pressButton = (id: string) => doPost(`/button/${id}/press`);

export async function getAllTemperatures(): Promise<{ column: TempReading; tank: TempReading }> {
  const [column, tank] = await Promise.all([
    readSensor('column_temperature'),
    readSensor('tank_temperature'),
  ]);
  return { column, tank };
}

export async function getAllStatus(): Promise<Record<string, unknown>> {
  const [column, tank, uptime, wifi, heap, msg, distilling, heating, alarm, resetReason] =
    await Promise.all([
      readSensor('column_temperature'),
      readSensor('tank_temperature'),
      readSensor('uptime'),
      readSensor('wifi_signal'),
      readSensor('free_heap'),
      readTextSensor('status_message'),
      readBinarySensor('distilling_status'),
      readBinarySensor('heating_status'),
      readBinarySensor('alarm_status'),
      readTextSensor('reset_reason'),
    ]);
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
