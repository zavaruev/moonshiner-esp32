# Moonshiner ESP32

ESPHome-based distillation controller for reflux and pot stills. Runs on an ESP32 with hysteresis-based column temperature control, safety shutdowns, OLED display, and a custom mobile-first web UI.

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
| Framework | ESP-IDF 5.5.5 |
| Column Sensor | DS18B20 (12-bit, address `0x043C01F096B22428`) |
| Tank Sensor | DS18B20 (12-bit, address `0xBF14D0231E64FF28`) |
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

Custom single-page application served via ESPHome web_server v3 on port 80.

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

The entire system is configured in a single file: `moonshiner_esp32.yaml`.

A `secrets.yaml` file (gitignored) must exist with:
```yaml
wifi_ssid: "..."
wifi_password: "..."
ap_password: "..."
ota_password: "..."
api_encryption_key: "..."   # native API encryption
web_username: "..."         # web_server basic auth
web_password: "..."
mcp_api_key: "..."          # Bearer token for the on-device MCP server
```

### ESPHome Version

Built with ESPHome `2026.8.x` (Docker `esphome/esphome:latest`). The JS frontend (`moonshiner_ui_v24.js`) is embedded in the firmware binary at compile time — any change requires a full recompile.

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

### On-device (primary) — `components/mcp_server/`

An ESPHome external component compiled **into the ESP32 firmware** itself: a stateless Streamable HTTP MCP server — no PC, NAS, or Node.js required.

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
moonshiner_esp32.yaml   # the single ESPHome config (esp-idf framework)
moonshiner_ui_v24.js    # custom frontend, embedded at compile time
secrets.yaml            # gitignored, see list above
components/mcp_server/  # on-device MCP server (C++, port 8080 /mcp)
mcp-moonshiner/         # Node MCP fallback (TypeScript, stdio)
tests.js / test_*.js    # JSDOM UI test suites
esp32_logs.sh           # safe log viewer wrapper (sweeps stale log sessions)
AGENTS.md               # conventions and gotchas for coding agents
CHANGELOG.md            # release history (latest: v1.09)
```

## Deployment

Build and upload via Docker on a build server:

```bash
docker exec esphome esphome compile moonshiner_esp32.yaml
docker exec esphome esphome upload moonshiner_esp32.yaml --device <ESP32_IP>
```

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

```bash
git checkout v1.07        # or any earlier tag (see `git tag -l`)
# sync files to build server
rsync -av moonshiner_esp32.yaml moonshiner_ui_v24.js user@server:/path/to/config/
# build and upload
```

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
