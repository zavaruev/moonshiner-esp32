function getBase() {
    const u = process.env.ESP32_URL || 'https://192.168.22.231';
    const p = new URL(u);
    return `${p.protocol}//${p.host}`;
}
function getAuth() {
    const u = process.env.ESP32_URL || 'https://192.168.22.231';
    const p = new URL(u);
    const user = p.username || process.env.ESP32_USER || '';
    const pass = p.password || process.env.ESP32_PASS || '';
    return user ? 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64') : '';
}
export function parseState(raw) {
    // ESPHome v3 returns JSON for sensors/numbers
    if (raw.startsWith('{')) {
        try {
            const j = JSON.parse(raw);
            return { value: j.value ?? null, state: j.state };
        }
        catch (e) {
            console.error('JSON parse error:', e, 'Raw input:', raw);
        }
    }
    // fallback: plain text
    const n = parseFloat(raw);
    return { value: isNaN(n) ? null : n, state: raw };
}
async function doFetch(url) {
    const res = await fetch(`${getBase()}${url}`, { headers: { Authorization: getAuth() }, signal: AbortSignal.timeout(8000) });
    if (!res.ok)
        throw new Error(`HTTP ${res.status} on ${url}`);
    return res.text();
}
async function doPost(url) {
    const res = await fetch(`${getBase()}${url}`, {
        method: 'POST',
        headers: { Authorization: getAuth() },
        signal: AbortSignal.timeout(5000),
    });
    if (!res.ok)
        throw new Error(`HTTP ${res.status} on POST ${url}`);
}
export function validateId(id) {
    if (!/^[a-zA-Z0-9_]+$/.test(id)) {
        throw new Error(`Invalid entity ID: ${id}`);
    }
}
async function readEntity(type, id) {
    validateId(id);
    const raw = await doFetch(`/${type}/${id}`);
    const { value, state } = parseState(raw);
    return { entity: id, value, raw: state };
}
export const readSensor = (id) => readEntity('sensor', id);
export const readNumber = (id) => readEntity('number', id);
export const readTextSensor = async (id) => {
    const res = await readEntity('text_sensor', id);
    return res.raw;
};
export const readBinarySensor = async (id) => {
    const res = await readEntity('binary_sensor', id);
    return res.raw === 'ON';
};
export const setNumber = (id, value) => {
    validateId(id);
    return doPost(`/number/${id}/set?value=${value}`);
};
export const toggleSwitch = (id, on) => {
    validateId(id);
    return doPost(`/switch/${id}/${on ? 'turn_on' : 'turn_off'}`);
};
export const pressButton = (id) => {
    validateId(id);
    return doPost(`/button/${id}/press`);
};
export async function getAllTemperatures() {
    const [column, tank] = await Promise.all([
        readSensor('column_temperature'),
        readSensor('tank_temperature'),
    ]);
    return { column, tank };
}
export async function getAllStatus() {
    const [column, tank, uptime, wifi, heap, msg, distilling, heating, alarm, resetReason] = await Promise.all([
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
