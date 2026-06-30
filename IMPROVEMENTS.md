# Moonshiner — Improvement Notes

## Problem: Uneven collection at low PWM values

### Current Implementation
- Platform: `slow_pwm` with 1s period
- At value 20 (out of 1023):
  - ON: 20ms
  - OFF: 980ms
- Result: long pauses, uneven collection

### Solenoid Valve Limitations
- Opening time: 30–100ms
- Closing time: 20–50ms
- Minimum pulse for full opening: ~200–500ms

---

## Solution: Pulse Mode instead of PWM

### Concept
Instead of varying duty cycle, use:
- **Fixed pulse width** (500ms) — valve opens fully every time
- **Variable interval** — depends on value 0–1023

### Equivalent Formula
```
interval_ms = pulse_width_ms * 1023 / value
```

Maintains the same average flow as the original PWM!

### Equivalent Table (pulse_width = 500ms)

| Value | Interval | Behavior |
|-------|----------|----------|
| 20 | 25.6s | 500ms ON every 25s |
| 50 | 10.2s | 500ms ON every 10s |
| 100 | 5.1s | 500ms ON every 5s |
| 200 | 2.6s | 500ms ON every 2.6s |
| 500 | 1s | Nearly always ON |
| 1023 | 0.5s | Always ON |

### Advantages
- Valve opens fully (500ms is enough)
- Liquid actually flows (no "micro-drops" at 20ms)
- Existing 0–1023 values keep the same average flow
- More predictable and even collection
- `pulse_width` can be tuned for specific valves

### ESPHome Implementation
Replace `slow_pwm` with `interval` + `lambda` + `gpio`:

```yaml
globals:
  - id: valve_low_next_pulse
    type: unsigned long
    initial_value: "0"

output:
  - platform: gpio
    pin: GPIO13
    id: valve_low_gpio

interval:
  - interval: 100ms
    then:
      - lambda: |-
          const int PULSE_WIDTH_MS = 500;
          float value = id(valve_low_setting).state;

          if (value <= 0) {
            id(valve_low_gpio).turn_off();
            return;
          }

          if (value >= 1023) {
            id(valve_low_gpio).turn_on();
            return;
          }

          unsigned long now = millis();
          unsigned long interval_ms = (PULSE_WIDTH_MS * 1023) / value;

          if (now >= id(valve_low_next_pulse)) {
            id(valve_low_gpio).turn_on();
            id(valve_low_next_pulse) = now + interval_ms;
          } else if (now >= id(valve_low_next_pulse) - interval_ms + PULSE_WIDTH_MS) {
            id(valve_low_gpio).turn_off();
          }
```

---

## Status: ✅ Implemented (2025-12-04)

Pulse mode deployed with `PULSE_WIDTH_MS = 100` (5x faster than the original 500ms).

---

## TODO: Collection coefficient must not affect upper valve

**Date**: 2025-12-05
**Priority**: Medium

### Problem
`coef_otbora` currently applies to both valves:
- `valve_high_output` (upper) — should NOT depend on coefficient
- `valve_low_output` (lower) — should depend on coefficient

### Fix Locations
1. `on_value` for `valve_high_setting` — remove `* id(coef_otbora).state`
2. `control_logic` — don't apply `current_coef` to `vh`

### Expected Behavior
- Upper valve runs strictly at its slider value
- Lower valve is modified by the coefficient

**Status**: ✅ Implemented (2025-12-05)
