# Moonshiner Project Analysis Report

## 1. Infrastructure Overview

The **Moonshiner** project is an ESP32-based automated distillation controller running on **ESPHome**. It features a custom web interface for monitoring and control.

### Core Components
- **Hardware**: ESP32 Development Board (esp32dev)
- **Firmware**: ESPHome (Arduino framework)
- **Interface**: Custom Single Page Application (SPA) served via ESPHome's `web_server` component (v3).
- **Sensors**:
  - 2x DS18B20 Temperature Sensors (Column, Tank) via OneWire (GPIO4).
  - WiFi Signal Strength.
  - Free Heap & Uptime (Diagnostic).
- **Actuators**:
  - **Heater**: Solid State Relay (SSR) via Slow PWM (GPIO27).
  - **Valves**: 2x Solenoid Valves (High/Low) via Slow PWM (GPIO14, GPIO13).
  - **Buzzer**: Passive Buzzer via LEDC (GPIO33) for RTTTL alarms.
- **Display**: SSD1306 OLED (128x64) via I2C (GPIO21/22).

### Software Architecture
- **Configuration**: `moonshiner_esp32.yaml` (formerly `_optimized`) defines the hardware abstraction, sensor polling, and core automation logic.
- **Frontend**: `moonshiner_ui_v22.js` provides a responsive, dark-mode UI with real-time updates via Server-Sent Events (SSE).
- **Logic**:
  - **Hysteresis Control**: Maintains column temperature within a specific delta.
  - **Safety**: Automatic shutdown on tank overheat (>99°C) or sensor failure (Watchdog).
  - **Automation**: Automatic reduction of collection rate (`coef_otbora`) when tank temp > 84°C.

## 2. Code Analysis

### Firmware (`moonshiner_esp32.yaml`)
**Strengths:**
- **Robustness**: Includes a software watchdog that shuts down outputs if temperature updates stop for 60s.
- **Optimization**: Uses `slow_pwm` for valves and heater to reduce switching noise and wear.
- **Modularity**: Logic is encapsulated in a `control_logic` script, making it easier to trigger from multiple sources.
- **Diagnostics**: Tracks boot counts, reset reasons, and heap usage.

**Weaknesses/Risks:**
- **Complexity**: The `control_logic` lambda is quite large and handles multiple responsibilities (safety, control, UI feedback).
- **Hardcoded Values**: Some logic thresholds (like the 84°C reduction trigger) are hardcoded in the lambda, though most are now template numbers.

### Frontend (`moonshiner_ui_v22.js`)
**Strengths:**
- **Modern UI**: Uses CSS variables, dark mode, and responsive design.
- **Resilience**: Includes a global error handler and a visual disconnect overlay.
- **Efficiency**: Uses `requestAnimationFrame` implicitly via CSS animations and efficient DOM updates.
- **UX**: "Heartbeat" indicator and detailed status badges provide good feedback.

**Weaknesses:**
- **Maintainability**: A single large JS file can be hard to manage.
- **Coupling**: Tightly coupled to specific ESPHome entity IDs.

## 3. Recommendations (Implemented in this cleanup)

1.  **Standardization**: Renaming the "optimized" config to the standard `moonshiner_esp32.yaml` to avoid confusion.
2.  **Documentation**: Adding comprehensive comments to the YAML and JS files to explain the "why" behind the code, not just the "how".
3.  **Cleanup**: Removing 15+ obsolete files (old backups, logs, previous UI versions) to reduce clutter and confusion.

## 4. Future Improvements (Post-Distillation)

-   **PID Control**: Consider replacing the simple hysteresis logic with a PID controller for the heater to maintain even more stable temperatures.
-   **Graphing**: Add a simple historical graph to the Web UI using a lightweight library (e.g., uPlot) to visualize temperature trends.
-   **Config Persistence**: Move more hardcoded logic values (like the 84°C reduction threshold) to `number` components so they can be tuned without OTA updates.
