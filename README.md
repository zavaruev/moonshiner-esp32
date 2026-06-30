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
- **Buzzer Volume Control** — cubic volume curve with 0–100 slider
- **WiFi Hotspot Fallback** — "Moonshiner ESP32 Hotspot" AP when WiFi is unavailable

## Hardware Requirements

| Component | Specification |
|-----------|--------------|
| Board | ESP32 DevKit (esp32dev) |
| Framework | ESP-IDF 5.5.0 |
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
```

### ESPHome Version

Built with ESPHome `2025.11.2`. The JS frontend (`moonshiner_ui_v24.js`) is embedded in the firmware binary at compile time — any change requires a full recompile.

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
git checkout <tag>
# sync files to build server
rsync -av moonshiner_esp32.yaml moonshiner_ui_v24.js user@server:/path/to/config/
# build and upload
```
