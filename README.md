# Moonshiner ESP32

Native ESP-IDF distillation controller for reflux and pot stills. Runs on an ESP32 with hysteresis-based column temperature control, safety shutdowns, OLED display, a custom mobile-first web UI and an on-device MCP server. The last ESPHome firmware is preserved on the `esphome-legacy` branch and in the `v1.09-esphome-final` release.

## Features

- **Hysteresis Temperature Control** — maintains column temp within a configurable band ([target, target+delta]), closes valves on overheat
- **Solenoid Valve Pulse Mode** — 200ms fixed pulses at variable intervals for reliable valve operation at any flow rate
- **Collection Coefficient (`coef_otbora`)** — global flow multiplier applied to the lower valve only
- **Automatic Reduction** — when enabled, `coef_otbora` is reduced by 10% on each overheat event if tank > 84°C
- **Safety Shutdowns** — max tank temp limit, watchdog timer (60s no temp update), emergency shutdown
- **Overheat Alarm** — plays Imperial March RTTTL after 5s sustained overheat (debounced)
- **OLED Display** — SH1106 128x64 showing uptime, IP, tank temp, heartbeat
- **Compact Web UI** — custom Apple-style interface (no ESPHome default CSS/JS), responsive down to 375px
- **On-device MCP Server** — Model Context Protocol endpoint built into the firmware (port 8080) so LLM agents can read/control the still with no PC or NAS in the loop
- **Buzzer Volume Control** — cubic volume curve with 0–100 slider
- **WiFi Hotspot Fallback** — "Moonshiner ESP32 Hotspot" AP when WiFi is unavailable

## Hardware Requirements

| Component | Specification |
|-----------|--------------|
| Board | ESP32 DevKit (esp32dev) |
| Framework | ESP-IDF 6.0.1 (native, no ESPHome runtime) |
| Column Sensor | DS18B20 (10-bit, address `0x043C01F096B22428`) |
| Tank Sensor | DS18B20 (10-bit, address `0xBF14D0231E64FF28`) |
| Display | SH1106 128x64 OLED, I2C (sold as "SSD1306") |
| Heater SSR | Solid-state relay, zero-cross |
| Valves | 2× solenoid valves (normally closed) |
| Buzzer | Passive piezo speaker, 3.3V |

### GPIO Pinout

```
GPIO4  → OneWire (DS18B20 sensors)
GPIO13 → Valve Low (lower)
GPIO14 → Valve High (upper)
GPIO21 → I2C SDA (OLED)
GPIO22 → I2C SCL (OLED)
GPIO27 → Heater SSR (slow_pwm 1s)
GPIO33 → Buzzer (LEDC RTTTL)
```

> ⚠️ GPIO25–27 share ADC2 with WiFi and **must not be used for PWM** when WiFi is active (causes valve clicking/rattling). Safe PWM pins: 13, 14, 15, 18, 19, 23, 32, 33.

### Wiring Notes

- OneWire bus (GPIO4) **requires a 4.7kΩ pull-up resistor** to 3.3V for reliable reads over 2m+ cables
- Each DS18B20 should have a **100nF decoupling capacitor** between VCC and GND close to the sensor
- Twist Data and GND wires together (twisted pair) to reduce EMI from SSR switching
- Keep sensor wires physically separated from heater/SSR wiring

## Web UI

Custom single-page application served by the firmware's own `esp_http_server` on port 80, with HTTP Basic Auth. `moonshiner_ui_v24.js` is embedded as a precompressed gzip blob at build time.

**Controls:**
- Heater Power (0–2750 W) with Working Power (1575W) and Preheat (2750W) markers
- Target Column Temperature with inline Delta hysteresis setting and Spirit marker (78.39°C)
- Upper (Valve High) and Lower (Valve Low) valves, 0–100%
- Collection Coefficient slider
- Max Tank Temperature
- Switches: Auto Reduction, Disable Upper Valve Closing
- Buzzer volume control
- Restart button (appears when status is DONE)
- Dark/light theme toggle
- Diagnostics panel (collapsible)

**Status badges:**
- Connected / disconnected (blinking)
- RUNNING / DONE
- Distilling / idle
- Heating / idle
- Alarm active

## Configuration

Copy `main/credentials.h.example` to `main/credentials.h` (gitignored) and fill in WiFi, AP, web Basic Auth and MCP Bearer token. The old `secrets.yaml` is no longer used by the firmware; it is kept only as the source for the one-time migration and for `esphome upload` during cutover.

### Build

The host has no `idf.py` or docker CLI. Build inside the `esp-idf-moonshiner` container via the docker-socket helper:

```bash
./tools/deploy.sh                 # builds build/moonshiner.bin
./tools/deploy.sh --ota            # builds, then pushes over /api/ota
```

The container exports `IDF_TARGET=esp32` and mounts this repository at `/project`.

## Testing

The repo ships a self-contained JSDOM test suite (no jest needed for UI tests):

```bash
npm install        # once, for jsdom
npm test           # = node tests.js && node test_addLog.js && node test_sse_error.js
```

- **tests.js** — chained suites: initUI double-call safety, addLog buffer limits (MAX_LOG=20), fetch error handling, sessionStorage failure handling (silent per PR #87), theme application, setConnected states, updateTempVisuals heat rings
- **test_addLog.js** — XSS escaping, ring-buffer limit, missing-element resilience
- **test_sse_error.js** — malformed SSE payloads must be dropped silently (no throw, no console.error)

MCP server has its own vitest suite:

```bash
cd mcp-moonshiner && npm install && npm test    # 96 tests
```

## MCP Server

The still exposes a **Model Context Protocol** server so LLM agents can inspect and control distillation with 14 tools (`read_temperatures`, `get_status`, `get_entity`, `set_target_temp`, `set_heater_power`, `set_valve_high/low`, `toggle_reduction`, `restart_process`, …). There are two interchangeable implementations:

### On-device (primary) — `main/mcp_server.cpp`

A stateless Streamable HTTP MCP server compiled **into the native ESP-IDF firmware** itself — no PC, NAS, or Node.js required.

```bash
curl http://192.168.22.231:8080/mcp \
  -H "Authorization: Bearer $MOONSHINER_MCP_TOKEN" \
  -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

- **Endpoint**: `http://<esp32-ip>:8080/mcp` (its own `esp_http_server`, port 8080, separate from the web UI on port 80)
- **Auth**: HTTP Bearer with the `mcp_api_key` secret — requests without the token get `401`
- **Protocol**: JSON-RPC 2.0, stateless (no session tracking), ArduinoJson 7
- **Boot telemetry**: `GET /diag` returns load-phase bits, httpd error code, heap and port status — useful when ports look dead
- opencode is configured for it in `opencode.json` via `Bearer {env:MOONSHINER_MCP_TOKEN}` (the token lives only in shell rc files, never in the repo)

### Fallback (Node stdio) — `mcp-moonshiner/`

TypeScript MCP server over stdio, same 14 tools, talking to the ESP32 web_server v3 REST API with HTTP Basic Auth; entity lookups use display names (`sensor/Column Temperature`) since web_server v3 ≥ 2026.7.4. Disabled in `opencode.json` (`"enabled": false`) — flip it back if the device is down. Rebuild after edits: `cd mcp-moonshiner && npm run build`.

## Repository Layout

```
CMakeLists.txt          # native ESP-IDF project root
partitions.csv          # two OTA app slots, copied from the ESPHome firmware
sdkconfig.defaults      # esp32 target, sockets, watchdog, rollback
main/                   # firmware sources (state, web, MCP, control, sensors, display, OTA)
main/credentials.h      # gitignored WiFi/web/MCP secrets
tools/                  # deploy.sh, embed_web.py, ota_push.py, control_sim.cpp
moonshiner_ui_v24.js    # frontend, embedded as gzip at build time
components/mcp_server/  # legacy ESPHome MCP component (reference only)
mcp-moonshiner/         # Node MCP fallback (TypeScript, stdio)
tests.js / test_*.js    # JSDOM UI test suites
docs/esphome-legacy.md  # backup branch/tag and firmware hash
AGENTS.md               # conventions and gotchas for coding agents
CHANGELOG.md            # release history
```

## Deployment

```bash
./tools/deploy.sh                 # idf build inside esp-idf-moonshiner
./tools/deploy.sh --ota            # build + push via /api/ota (Basic Auth from ESP32_USER/ESP32_PASS)
```

The first cutover from ESPHome used `esphome upload --file build/moonshiner.bin --device 192.168.22.231 --ota-password "$OTA_PASSWORD"`; the two app slots use the same layout in both firmwares.

### Diagnostics

`GET http://192.168.22.231:8080/diag` (MCP port, no auth) reports uptime, free heap, boot counter, the reset reason and the last panic report captured from the handler in RTC memory. This is the first place to look if the device reboots: a `panic` reason with `abort=... A stack overflow in task ...` identifies the offending task directly.

## Control Logic

1. **Cold start** (tank < 70°C) — resets all values to defaults
2. **Hot start** (tank ≥ 70°C) — recovery mode, resets process flag
3. **Heating phase** — heater runs at set power, valves are controlled by hysteresis
4. **Hysteresis loop**:
   - Column temp ≤ target → open valves (user settings × coefficient)
   - Column temp ≥ target + delta → close valves
   - Between target and target+delta → keep previous state
5. **Overheat** → close valves → increased reflux → temp drops
6. **Tank ≥ max temp** → process finishes, all outputs shut down, status → DONE
7. **Watchdog** (60s no temp update) → emergency shutdown, auto-recovery when temp resumes

## Rollback

The previous native image is kept in the unused OTA slot. A bad update reverts
automatically unless it passes the 60-second health check. To force a rollback
to the saved ESPHome image, push its release asset through `/api/ota`:

```bash
curl -u "$ESP32_USER:$ESP32_PASS" \
  -o esphome-v1.09-final.bin \
  https://github.com/zavaruev/moonshiner-esp32/releases/download/v1.09-esphome-final/esphome-v1.09-final.bin
ESP32_USER=... ESP32_PASS=... tools/ota_push.py esphome-v1.09-final.bin http://192.168.22.231
```

Git reference: `esphome-legacy` branch / `v1.09-esphome-final` tag.

---

## License

Dual-licensed — pick one:

| | License | Price | Applies when |
|---|---|---|---|
| **A** | **[GNU AGPL v3 or later](LICENSE)** | free | you accept copyleft: derivative works and network services must stay open source |
| **B** | **[Commercial License](COMMERCIAL-LICENSE.md)** | **paid** | you want it in a **commercial product** — bundled with hardware, shipped closed-source, offered as SaaS, or licensed away from the AGPL |

```
SPDX-License-Identifier: AGPL-3.0-or-later
Commercial licensing: alexander.zavaruev@gmail.com
```

Third-party components keep their own licenses — see [`NOTICE`](NOTICE).
