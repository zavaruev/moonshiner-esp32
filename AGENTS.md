# Moonshiner ESP32 — AGENTS.md

## Repo structure

```
moonshiner_esp32.yaml     # Active config (esp-idf, web auth enabled, v24 UI)
moonshiner_ui_v24.js      # Custom frontend
secrets.yaml              # Gitignored, must exist at deploy
components/mcp_server/    # On-device MCP server (C++,14 tools, port 8080 /mcp)
mcp-moonshiner/           # Node MCP fallback (TypeScript, 14 tools, stdio)
opencode.json             # MCP config: remote device MCP + disabled stdio fallback
.gitignore                # Ignores /.esphome/, secrets.yaml, mcp-moonshiner/dist/
CHANGELOG.md / AGENTS.md / IMPROVEMENTS.md
```

- **ESPHome version**: `2026.9.1` (Docker container `esphome/esphome:latest`, verified 2026-10-01; check `esphome version` in container if unsure)
- **Board**: ESP32 dev (esp32dev)
- **Framework**: **esp-idf** (v5.5.5; if ESPHome raises the default, update the version in the yaml)

## Testing

```bash
npm test                                   # UI suites: tests.js + test_addLog.js + test_sse_error.js
cd mcp-moonshiner && npm test              # vitest, 75 tests
```

- `tests.js` chains 7 suites and exits non-zero on any failure
- Silent-failure contract: SSE parse errors, sessionStorage write errors and MCP `parseState` failures must be handled **without console logging** (PRs #87/#89/#92) — tests enforce this; do not reintroduce `console.error/warn` there
- MCP `runBatched` takes lazy task factories (`() => Promise`), not promises — eager promises break throttling and cause unhandled rejections

## Required secrets (`secrets.yaml`)

```
wifi_ssid: "<your_wifi_ssid>"
wifi_password: "<your_wifi_password>"
api_key: "<your_api_key>"
ota_password: "<your_ota_password>"
ap_password: "<your_ap_password>"
api_encryption_key: "<your_api_encryption_key>"
web_username: "<your_web_username>"
web_password: "<your_web_password>"
mcp_api_key: "<your_mcp_bearer_token>"
```

## Key architecture facts

- **Controller for distillation**: hysteresis-based column temp control with safety shutdowns
- **Sensor wiring**: DS18B20 on OneWire GPIO4 (column `0x043C01F096B22428`, tank `0xBF14D0231E64FF28`)
- **Actuators**: heater SSR on GPIO27 (slow_pwm 1s), valves on GPIO14/GPIO13 (custom pulse mode), buzzer on GPIO33 (LEDC RTTTL)
- **Display**: SH1106 128x64 OLED on I2C GPIO21/GPIO22
- **Web**: ESPHome web_server v3 on port 80 with **HTTP Basic Auth** (<username>/<password>), custom `js_include` (no default JS/CSS)
- **API encryption**: enabled via `api_encryption_key` secret
- **Web server auth**: enabled via `web_username`/`web_password` secrets

## Critical GPIO constraints

GPIO25-27 share ADC2 with WiFi — **never use these for PWM** when WiFi is on (causes valve clicking/rattling). Safe PWM pins: 13, 14, 15, 18, 19, 23, 32, 33.

## Single config

`moonshiner_esp32.yaml` — **esp-idf** framework, custom pulse mode for valves (100ms pulses), v24 UI. The only config; always edit this file.

## MCP Server

### Primary: on-device MCP (built into firmware)

`components/mcp_server/` is an ESPHome external component — a **stateless
Streamable HTTP MCP server running on the ESP32 itself** (no PC/NAS required):

- **Endpoint**: `http://192.168.22.231:8080/mcp` (separate `esp_http_server`,
  port 8080; ArduinoJson 7)
- **Auth**: Bearer token from `mcp_api_key` secret. 401 without it.
- **Tools**: same 14 as the Node server (read_temperatures, get_status,
  get_entity, set_*, toggle_*, restart_process)
- **Setup priority 210** (after wifi 250 / web 249 / network 220, before
  ota/api 200): if `App.setup()` ever stalls later, the httpd task is already
  bound and still answers
- **`GET /diag`** (unauthenticated, temporary): boot telemetry —
  `httpd_err`, `phases` bitmask (1=P248 probe, 2=P199, 4=P099, 8=App.loop
  ran, 16=setup), heap, port statuses. Use it first when ports look dead.
- **UDP diagnostics**: `debug_send()` probes (on_boot triggers at priorities
  248/199/99 in the yaml) buffer messages and `loop()` flushes them to
  `192.168.22.102:9001` (NAS) and `192.168.22.249:9001` (PC). Non-blocking;
  collectors are plain python UDP listeners.

opencode.json points at the device:

```json
"moonshiner-esp32": {
  "type": "remote",
  "url": "http://192.168.22.231:8080/mcp",
  "oauth": false,
  "headers": { "Authorization": "Bearer {env:MOONSHINER_MCP_TOKEN}" }
}
```

The token lives only in `~/.bashrc` / `~/.profile` (`export
MOONSHINER_MCP_TOKEN=<mcp_api_key>`) — **never in the repo**. opencode must be
launched from a shell that has it.

### Fallback: Node stdio MCP (`mcp-moonshiner/`)

TypeScript, 14 tools over stdio, talks to the ESP32 web_server REST API with
HTTP Basic Auth. Disabled in `opencode.json` (`"enabled": false`); flip it
back if the device is down or you need the Node implementation.

```json
"command": [
  "node",
  "--env-file=/home/alexander/.config/moonshiner/esp32.env",
  "/home/alexander/Desktop/MoonshinerNew/mcp-moonshiner/dist/index.js",
  "--url",
  "http://<esp32_ip>"
]
```

Credentials live **outside the repo** in `~/.config/moonshiner/esp32.env` (`chmod 600`, never committed):
```
ESP32_USER=<web_username>
ESP32_PASS=<web_password>
```
`getAuth()` prefers `ESP32_USER`/`ESP32_PASS` over credentials embedded in the URL; `--url` still accepts the legacy `http://user:pass@host` form and maps it into those env vars for backwards compatibility. **Never put credentials in `opencode.json`** — the repo is public (the old `admin:moonshine` stays in git history until the device password is rotated). Node resolves the file via `--env-file`, so it must exist or the MCP server won't start.

To rebuild after changes:
```bash
cd /home/alexander/Desktop/MoonshinerNew/mcp-moonshiner && npm run build
```

## Deployment

Build/upload happens on a remote server — not locally.

```bash
# 1. Sync files to server
rsync -av --exclude='.esphome/' --exclude='.git/' --exclude='node_modules/' \
  /home/alexander/Desktop/MoonshinerNew/ \
  alexander@192.168.22.102:/mnt/media/docker-compose/esphome/config/moonshiner_latest/

# 2. Compile (Docker container: esphome/esphome:latest)
ssh alexander@192.168.22.102 \
  "docker exec esphome esphome compile /config/moonshiner_latest/moonshiner_esp32.yaml"

# 3. Upload OTA
ssh alexander@192.168.22.102 \
  "docker exec esphome esphome upload /config/moonshiner_latest/moonshiner_esp32.yaml --device 192.168.22.231"
```

## Viewing device logs

**Always use the wrapper script, never raw `docker exec esphome esphome logs`:**

```bash
./esp32_logs.sh [seconds]   # default 40s; kills stale log processes + in-container timeout
```

Raw `esphome logs` invocations left zombie processes in the container that held
API connections open to the ESP32 (native API accepts a limited number); once
exhausted, new log/API sessions fail with `EOF received` /
`EncryptionHelloAPIError` until the container is restarted. The script sweeps
stale `esphome logs` PIDs via /proc before and after, and runs logs with
`timeout -k 5` inside the container (SIGTERM alone is ignored by python).

If `kconfgen` errors during `compile`:
```bash
ssh alexander@192.168.22.102 \
  "docker exec esphome pip install kconfgen idf-component-manager"
```

## Design conventions

- **Manual valve priority**: User slider adjustments override automatic control by design
- `coef_otbora` (collection coefficient) applies to **lower valve only**, not upper valve
- Status messages: English ("RUNNING", "DONE")
- `secrets.yaml` is never committed; needs all secrets listed above

## Known bugs / gotchas

- **Web server v3 REST API (≥2026.7.4) matches entities by display name, not ID**: `/sensor/Column Temperature` works, `/sensor/column_temperature` → 404. POST requires `Content-Length: 0`. MCP handles this via `ENTITY_NAMES` map in `esp32-api.ts`; UI `api` paths use names. **SSE `/events` changed too**: ≥2026.9 sends `id` as `domain/Display Name` (e.g. `sensor/Column Temperature`), older builds send `domain-object_id`. UI handles both via `resolveEntityId()` in `moonshiner_ui_v24.js`.
- **ESPHome ≥2026.9 returns 500 for `/…` requests whose `Origin`/`Referer` host it doesn't recognise** — relevant when proxying the web UI; rewrite those headers to the device's own origin.
- **Second `esp_http_server` needs a unique `ctrl_port`**: ESP-IDF httpd's default UDP ctrl port is 32768 for *every* instance — if web_server (priority 249) binds it first, `httpd_start()` fails with a bare `ESP_FAIL (-1)` and no errno. That is exactly how the MCP server looked "dead": at setup priority 600 it bound 32768 *first* and web_server's httpd died (port 80 refused). Our instance now uses `config.ctrl_port = port_ + 1000` (9080). Never add another httpd without a unique ctrl port.
- **ESPHome setup priorities run high-to-low**: wifi 250 → web 249 → network 220 → mcp 210 → ota/api 200 → mdns 100. Sockets work from ~249 on; DHCP/IP lands ~10-12 s after boot even though `App.setup()` finishes in ~1 s (WiFi connects asynchronously, `can_proceed()` defaults to true).
- If `last_temp_update` watchdog fires (60s no update), all outputs shut down — recover by reboot
- SH1106 chips sold as "SSD1306" — use model `SH1106 128x64` not `SSD1306 128x64`
- UI v23→v24 fixed: debounce DDOS (hundreds of req/s on slider), default values disappearing (value-with-units parsing), entity alias 404s
- Pulse mode replaced slow_pwm in the main config because solenoid valves need ≥100ms pulse to open fully

## Rollback to last known-good version

If current firmware breaks:

```bash
git checkout v1.05
rsync -av --exclude='.esphome/' /home/alexander/Desktop/MoonshinerNew/moonshiner_esp32.yaml /home/alexander/Desktop/MoonshinerNew/moonshiner_ui_v24.js alexander@192.168.22.102:/mnt/media/docker-compose/esphome/config/
ssh alexander@192.168.22.102 "cd /mnt/media/docker-compose/esphome/config && docker exec esphome esphome compile moonshiner_esp32.yaml 2>&1 | tail -5"
ssh alexander@192.168.22.102 "cd /mnt/media/docker-compose/esphome/config && docker exec esphome esphome upload moonshiner_esp32.yaml --device 192.168.22.231 2>&1 | tail -3"
```
