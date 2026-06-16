---
description: Display Diagnostics - I2C scan and alternative configs
---

# Display Debugging Plan

## 0. VIDEO ANALYSIS
Upload video of display showing the "moving" effect

## 1. I2C Device Scan
Check what device is actually connected at 0x3C

```yaml
# Add to moonshiner_esp32.yaml temporarily
interval:
  - interval: 30s
    then:
      - lambda: |-
          ESP_LOGW("i2c_scan", "Scanning I2C bus...");
          for (uint8_t address = 1; address < 127; address++) {
            if (id(i2c_bus).write(address, nullptr, 0) == i2c::ERROR_OK) {
              ESP_LOGW("i2c_scan", "Found device at 0x%02X", address);
            }
          }
```

## 2. Try Rotation
Maybe display is mounted upside-down causing rendering artifacts

```yaml
display:
  - platform: ssd1306_i2c
    rotation: 180  # ADD THIS
```

## 3. Try Fixed Update Interval
Prevent random redraws

```yaml
display:
  - platform: ssd1306_i2c
    update_interval: 1s  # ADD THIS
```

## 4. FULLY STATIC DISPLAY (NO VARIABLES)
Remove heartbeat, uptime - test with ONLY hardcoded text

```yaml
lambda: |-
  it.print(0, 0, id(roboto), "STATIC TEST");
  it.print(0, 20, id(roboto_small), "No variables");
  it.print(0, 40, id(roboto_small), "Should not move");
```

## 5. Try Different Models (if SH1106 doesn't work)
- SSD1305 128x32
- SSD1306 128x32
- SSD1309 128x64

## 6. Last Resort: External Pull-ups
If I2C signal integrity is poor, add 4.7kΩ pull-ups to SDA/SCL
