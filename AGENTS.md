# Moonshiner ESP32 — AGENTS.md

## Repo structure

```
moonshiner_esp32.yaml     # Active config (esp-idf, web auth enabled, v24 UI)
moonshiner_ui_v24.js      # Custom frontend
secrets.yaml              # Gitignored, must exist at deploy
mcp-moonshiner/           # MCP server (TypeScript, 14 tools, stdio)
opencode.json             # MCP config with http://admin:moonshine@... URL
.gitignore                # Ignores /.esphome/, secrets.yaml, mcp-moonshiner/dist/
CHANGELOG.md / AGENTS.md / IMPROVEMENTS.md
```

- **ESPHome version**: `2026.6.5` (Docker container `esphome/esphome:latest`)
- **Board**: ESP32 dev (esp32dev)
- **Framework**: **esp-idf** (v5.5.0)

## Required secrets (`secrets.yaml`)

```
wifi_ssid: "home4"
wifi_password: "P@$$vv0rd"
api_key: "pbBpSX4U2FVWyXAKUcNBu2pbJ2UOLkClAykFWLReYTc="
ota_password: "2441"
ap_password: "P@$$vv0rd"
api_encryption_key: "36Vz2QKlJoUTforeMaG/8cNx5eIlu2XFU+XbL5VFuBI="
web_username: "admin"
web_password: "moonshine"
```

## Key architecture facts

- **Controller for distillation**: hysteresis-based column temp control with safety shutdowns
- **Sensor wiring**: DS18B20 on OneWire GPIO4 (column `0x043C01F096B22428`, tank `0xBF14D0231E64FF28`)
- **Actuators**: heater SSR on GPIO27 (slow_pwm 1s), valves on GPIO14/GPIO13 (custom pulse mode), buzzer on GPIO33 (LEDC RTTTL)
- **Display**: SH1106 128x64 OLED on I2C GPIO21/GPIO22
- **Web**: ESPHome web_server v3 on port 80 with **HTTP Basic Auth** (admin/moonshine), custom `js_include` (no default JS/CSS)
- **API encryption**: enabled via `api_encryption_key` secret
- **Web server auth**: enabled via `web_username`/`web_password` secrets

## Critical GPIO constraints

GPIO25-27 share ADC2 with WiFi — **never use these for PWM** when WiFi is on (causes valve clicking/rattling). Safe PWM pins: 13, 14, 15, 18, 19, 23, 32, 33.

## Single config

`moonshiner_esp32.yaml` — **esp-idf** framework, custom pulse mode for valves (100ms pulses), v24 UI. The only config; always edit this file.

## MCP Server

Located at `mcp-moonshiner/`. Built with TypeScript, exposes 14 MCP tools via stdio. Connects to ESP32 web_server API with HTTP Basic Auth.

Config in `opencode.json`:
```json
"command": [
  "node",
  "/home/alexander/Desktop/MoonshinerNew/mcp-moonshiner/dist/index.js",
  "--url",
  "http://admin:moonshine@192.168.22.231"
]
```

URL includes credentials (parsed by `esp32-api.ts`). To rebuild after changes:
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
