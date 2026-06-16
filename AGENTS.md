# Moonshiner ESP32 — AGENTS.md

## Repo structure

```
moonshiner_esp32.yaml     # Active config (esp-idf, v24 UI)
moonshiner_ui_v24.js      # Custom frontend
secrets.yaml              # Gitignored, must exist at deploy
.gitignore                # Ignores /.esphome/ and secrets.yaml
CHANGELOG.md / DEPLOY_REFERENCE.md / IMPROVEMENTS.md
*analysis_report.md / display_debug_plan.md
```

- **ESPHome version**: `2025.11.2` (see `.esphome/storage/moonshiner_esp32.yaml.json`)
- **Board**: ESP32 dev (esp32dev)
- **Framework**: **esp-idf**

## Key architecture facts

- **Controller for distillation**: hysteresis-based column temp control with safety shutdowns
- **Sensor wiring**: DS18B20 on OneWire GPIO4 (column `0x043C01F096B22428`, tank `0xBF14D0231E64FF28`)
- **Actuators**: heater SSR on GPIO27 (slow_pwm 1s), valves on GPIO14/GPIO13 (custom pulse mode), buzzer on GPIO33 (LEDC RTTTL)
- **Display**: SH1106 128x64 OLED on I2C GPIO21/GPIO22
- **Web**: ESPHome web_server v3 on port 80 with custom `js_include` (no default JS/CSS)

## Critical GPIO constraints

GPIO25-27 share ADC2 with WiFi — **never use these for PWM** when WiFi is on (causes valve clicking/rattling). Safe PWM pins: 13, 14, 15, 18, 19, 23, 32, 33.

## Single config

`moonshiner_esp32.yaml` — **esp-idf** framework, custom pulse mode for valves (100ms pulses), v24 UI. The only config; always edit this file.

## Deployment

Build/upload happens on a remote server — not locally.

```bash
# On server 192.168.22.102 (user alexander, cert auth):
cd /mnt/media/docker-compose/esphome/config/moonshiner_latest
./deploy.sh moonshiner_esp32.yaml
```

Deploy script handles: SCP sync, secrets.yaml symlink, Docker compilation, OTA upload to 192.168.22.231.

To sync changes to the server for deploy:
```
rsync -av --exclude='.esphome/build/' -e ssh alexander@192.168.22.102:/mnt/media/docker-compose/esphome/config/moonshiner_latest/ ./
```

## Design conventions

- **Manual valve priority**: User slider adjustments override automatic control by design
- `coef_otbora` (collection coefficient) applies to **lower valve only**, not upper valve
- Status messages: English ("RUNNING", "DONE")
- `secrets.yaml` is never committed; needs `!secret wifi_ssid`, `!secret wifi_password`, `!secret ap_password`, `!secret ota_password`

## Known bugs / gotchas

- If `last_temp_update` watchdog fires (60s no update), all outputs shut down — recover by reboot
- SH1106 chips sold as "SSD1306" — use model `SH1106 128x64` not `SSD1306 128x64`
- UI v23→v24 fixed: debounce DDOS (hundreds of req/s on slider), default values disappearing (value-with-units parsing), entity alias 404s
- Pulse mode replaced slow_pwm in the main config because solenoid valves need ≥100ms pulse to open fully
