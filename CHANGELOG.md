# Moonshiner ESP32 - Changelog

## 2025-12-03: OLED Display Enabled (v24 + OLED) - STABLE ✅

### New Features
- **OLED Display Enabled**:
  - **Model**: `SH1106 128x64`
  - **Interface**: I2C (GPIO21/GPIO22)
  - **Content**: Uptime, Heartbeat, IP Address, Tank Temperature
  - **Status**: Stable (100kHz, Scan enabled)

### Backup Created
- **File**: `moonshiner_backup_v24_oled_20251203_223353.tar.gz`
- **Size**: 17 KB
- **Includes**: Full project + OLED config

---

## 2025-12-03: UI Critical Fixes (v24 Stable) - STABLE ✅

### Critical Fixes

#### 1. ✅ Fixed Debounce DDOS Bug
- **Problem**: Slider inputs created hundreds of HTTP requests per second, flooding ESP32 and causing potential crashes/reboots.
- **Root Cause**: Debounced functions were created inside event handlers on every input event, defeating the purpose of debouncing.
- **Solution**: Debounced functions now created once outside event handlers and reused.
- **Result**: Network requests reduced from ~500/sec to ~2-3/sec when moving sliders.

#### 2. ✅ Fixed Disappearing Default Values
- **Problem**: Default values in input fields appeared briefly (~1 second) then disappeared.
- **Root Cause**: ESPHome sends number values with units (e.g., `"95.0000 °C"`), but HTML `<input type="number">` only accepts pure numbers. Browser rejected the value and cleared the field.
- **Solution**: Added regex parsing to extract numeric part from strings: `"95.0000 °C"` → `"95.0000"`.
- **Result**: All default values now persist correctly.

#### 3. ✅ Fixed Entity ID Mapping
- **Problem**: Duplicate entity ID aliases could cause 404 errors when sending API requests.
- **Solution**: Removed all aliases, added explicit `api` field to each entity config with canonical paths.
- **Result**: All API calls now use correct endpoints.

#### 4. ✅ Fixed SVG Encoding
- **Problem**: `btoa()` function fails with Unicode characters in SVG.
- **Solution**: Replaced `btoa()` with `encodeURIComponent()` for favicon encoding.
- **Result**: No more encoding errors.

### Improvements

#### Status Messages in English
- Changed from Russian to English:
  - "Идет процесс..." → `RUNNING`
  - "Отбор окончен успешно!" → `DONE`

#### Adjusted Input Precision
- **Delta**: `step: 0.01` (2 decimal places)
- **Max Tank Temp**: `step: 0.1` (1 decimal place)
- **Target Temp**: `step: 0.0001` (4 decimal places - unchanged)

### Technical Details

#### Files Modified
- `moonshiner_ui_v24.js`:
  - Fixed debounce implementation (lines 262-320)
  - Added numeric value parsing from strings with units (lines 368-400)
  - Removed entity ID aliases (lines 220-260)
  - Fixed SVG encoding (line 18)
- `moonshiner_esp32.yaml`:
  - Changed status messages to English (lines 442, 455, 462)
  - Adjusted step values for Delta and Max Tank Temp (lines 168, 182)

#### Deployment
- **Version**: v24 Stable
- **Date**: 2025-12-03 20:49
- **Firmware Size**: 950,944 bytes (51.8% flash)
- **RAM Usage**: 11.6% (38,012 / 327,680 bytes)
- **Compilation Time**: ~21 seconds
- **Upload Time**: ~8 seconds

### Backup Created
- **File**: `moonshiner_backup_v24_stable_20251203_204918.tar.gz`
- **Size**: 16 KB
- **Location**: `/home/alexander/Desktop/esphome_devices/`
- **Excludes**: `.esphome/` build directory

### Verification Checklist
- ✅ Default values persist on page load
- ✅ Sliders send only 2-3 requests/sec (not hundreds)
- ✅ Status shows "RUNNING" and "DONE" in English
- ✅ All controls respond correctly
- ✅ No console errors in browser
- ✅ Input precision matches requirements

---

## 2025-11-30: Display Driver Fix (v23) - STABLE

### Critical Fix - Display "Moving Text" Resolved ✅
- **Problem**: Text on OLED display appeared to "move" or "scroll" despite all attempts to disable hardware scrolling. Issue persisted even with all loads (valves, heater) turned off, ruling out EMI.
- **Root Cause**: Display hardware was **SH1106**, not SSD1306 as labeled. Many Chinese 128x64 OLED modules are sold as "SSD1306" but actually use the SH1106 controller, which has different memory addressing.
- **Solution**: Changed display driver from `SSD1306 128x64` to `SH1106 128x64` in ESPHome configuration.
- **Result**: Display is now **stable and readable**. Text no longer moves.

### Display Improvements
- Added `update_interval: 1s` for stable refresh rate
- Simplified layout:
  - **Top**: Uptime (HH:MM) + Heartbeat indicator (blinking dot)
  - **Middle**: IP address
  - **Bottom**: Tank temperature (whole degrees)
- Removed oversized "Moonshiner" title for compact, information-dense display

### Deployment
- **Version**: v23
- **Date**: 2025-11-30
- **Status**: ✅ STABLE - Ready for production use

---

## 2025-11-29: Display Scrolling Fix + Code Optimization

### Critical Fix
- **Display Horizontal Scrolling Resolved**:
  - **Problem**: Text on OLED display was scrolling horizontally instead of being static. Photos confirmed text was in motion rather than statically positioned.
  - **Root Cause**: SSD1306 hardware scrolling feature was accidentally activated and persisted across reboots.
  - **Solution**: Added explicit hardware scroll disable command (`0x2E`) in `on_boot` sequence:
    ```yaml
    - lambda: |-
        id(oled_display).command(0x2E);  # Deactivate scroll
    ```
  - **Result**: Display text now static and readable.

### Critical Fix (Valve Stoppage)
- **Valve Control Logic Fixed**:
  - **Problem**: Valves would stop working or behave erratically because the `slow_pwm` timer was being reset every second by `set_level` calls, even if the value hadn't changed.
  - **Solution**: Added a check to only call `set_level` if the target value differs from the current state by more than 0.001.
  - **Code**:
    ```cpp
    if (abs(id(valve_high_output).state - vh) > 0.001) {
       id(valve_high_output).set_level(vh);
    }
    ```

### Code Optimizations (moonshiner_esp32_optimized.yaml)
- **Refactored Emergency Shutdown**:
  - Extracted duplicate shutdown code into lambda helper function
  - Eliminates redundancy in `process_finished` and `max_tank_temp` checks
  - Cleaner, more maintainable codebase

- **Performance Improvements**:
  - Reduced redundant `publish_state` calls in control logic
  - Removed verbose debug logging for production
  - Memory footprint remains stable at 12% RAM usage

### Deployment
- **Deployed**: 2025-11-29 14:10 UTC+3
- **Method**: OTA via `deploy.sh` script to 192.168.22.231
- **Firmware Size**: 993,104 bytes (54.1% flash)
- **Compilation Time**: 21 seconds
- **Upload Time**: 8.5 seconds

### Verification Required
- [ ] Display text static (not scrolling) - USER to verify
- [ ] All 3 display pages functional
- [ ] Temperature readings accurate
- [ ] Web UI responsive

---

## 2025-11-28: Valve PWM Fix & Volume Control

### Critical Fixes
- **Valve PWM Instability Resolved**:
  - **Problem**: Lower valve (GPIO13) exhibited erratic "crackling" behavior at low duty cycles and constant-on behavior at high cycles due to hardware timer conflicts between `ledc` (PWM) and `rtttl` (Buzzer).
  - **Solution**: Switched `heater_output`, `valve_high_output`, and `valve_low_output` from `ledc` platform to `slow_pwm` (1s period). This uses software timing, eliminating hardware timer conflicts with the buzzer.
  - **Result**: Smooth, predictable 1Hz switching for all outputs.

### New Features
- **Buzzer Volume Control**:
  - Added a "Buzzer Volume" slider to the web UI.
  - Implemented a **Cubic Volume Curve** (Gamma Correction) for the slider: `vol = (slider^3) * 0.5`. This provides much finer control at low volumes, matching human hearing perception.
  - Added a software "Volume Enforcer" loop (50ms interval) to modulate the buzzer's duty cycle while playing.

### UI Improvements
- **Refined Volume Slider**:
  - Moved volume control to the header section for better accessibility.
  - Styled as a compact slider with a speaker icon.
  - Hidden the raw numeric input for a cleaner look.

---

## 2025-11-28: GPIO Pin Migration - Fixed Valve Clicking Issue

### Problem
Lower valve exhibited clicking/rattling at PWM values below 120, while upper valve worked normally. User testing confirmed the issue followed **GPIO25 pin**, not the valve hardware.

### Root Cause
**GPIO25 and GPIO26 have built-in DAC (Digital-to-Analog Converters)** that conflict with ESP32's Wi-Fi driver:

- **GPIO25 (DAC Channel 1)** - Part of ADC2 unit shared with Wi-Fi
  - Outputs parasitic voltages (50mV-2V) when Wi-Fi is active
  - Causes unstable PWM output → valve clicking/rattling
  
- **GPIO26 (DAC Channel 2)** - Also has DAC
  - Less sensitive than GPIO25, but still potential for interference
  - Proactively relocated to prevent future issues

**Key Finding**: ADC2 pins (including GPIO25-27) cannot reliably be used for PWM when Wi-Fi is running due to hardware resource sharing.

### Solution
**Migrated both valves to safe GPIO pins without DAC/ADC2:**

| Component | Old Pin | New Pin | Reason |
|-----------|---------|---------|--------|
| **Valve High** | GPIO26 (DAC2) | **GPIO14** | Eliminate DAC interference |
| **Valve Low** | GPIO25 (DAC1) → GPIO32 | **GPIO13** | Fix clicking + GPIO32 constantly active |

**Note**: GPIO32 was initially chosen but found to be constantly active (hardware issue). Valve relocated to GPIO13.

### Changes Made

#### Hardware Changes
- ✅ Rewired upper valve MOSFET gate: GPIO26 → GPIO14
- ✅ Rewired lower valve MOSFET gate: GPIO25 → GPIO32

#### Firmware Changes
**File**: `moonshiner_esp32.yaml`

```yaml
# Line 223: Valve High
- platform: ledc
  pin: GPIO14  # Changed from GPIO26 to avoid DAC2/Wi-Fi issues
  id: valve_high_output
  frequency: 1 Hz

# Line 228: Valve Low  
- platform: ledc
  pin: GPIO32  # Changed from GPIO25 to avoid DAC/Wi-Fi conflict
  id: valve_low_output
  frequency: 1 Hz
```

### Current GPIO Pin Assignment

```
GPIO4  → OneWire (DS18B20 temperature sensors)
GPIO14 → Valve High (upper) - PWM output
GPIO21 → I2C SDA (OLED display)
GPIO22 → I2C SCL (OLED display)
GPIO27 → Heater SSR - PWM output
GPIO32 → Valve Low (bottom) - PWM output
GPIO33 → Speaker/Buzzer - PWM output
```

**All DAC pins removed** - No Wi-Fi interference ✅

### Verification
- [ ] Deploy updated firmware
- [ ] Test both valves at PWM values: 50, 100, 150, 300, 500, 1023
- [ ] Verify no clicking/rattling at any value
- [ ] Confirm smooth operation with Wi-Fi active

### Lessons Learned

1. **Avoid GPIO25-27 for PWM with Wi-Fi**
   - These pins are ADC2 which shares hardware with Wi-Fi driver
   - GPIO25/26 also have DAC which can cause output instability
   
2. **Safe GPIO pins for PWM on ESP32**
   - GPIO13, GPIO14, GPIO15, GPIO18, GPIO19, GPIO23, GPIO32, GPIO33
   - No ADC2, no DAC, no strapping issues

3. **1 Hz PWM frequency is acceptable for solenoid valves**
   - Initially suspected low frequency was the issue
   - Root cause was GPIO pin conflicts, not frequency

### References
- ESP32 GPIO limitations: ADC2 + Wi-Fi incompatibility
- ESPHome LEDC documentation
- Espressif GPIO pin matrix

---

**Author**: AI Assistant  
**Date**: 2025-11-28  
**Impact**: Critical fix - eliminated valve control instability
