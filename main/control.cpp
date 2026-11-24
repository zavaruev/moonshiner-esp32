#include "control.h"

/*
 * Pure decision helpers ported from the ESPHome `control_logic` script.
 * Hardware effects live in control_task.cpp; keeping decisions here makes the
 * exact YAML thresholds host-testable without an ESP32.
 */

bool control_should_close_valves(float column, float target, float delta) {
  return column >= target + delta;
}

bool control_should_open_valves(float column, float target) { return column <= target; }

float control_valve_level(int setting, float coefficient, bool apply_coefficient) {
  float level = static_cast<float>(setting) / 1023.0f;
  if (apply_coefficient) level *= coefficient;
  return level;
}

unsigned long control_pulse_interval(float level, unsigned long pulse_ms) {
  if (level <= 0.5f) return 0;
  if (level >= 1022.5f) return pulse_ms;  // effectively continuous on
  return static_cast<unsigned long>(pulse_ms * 1023.0f / level);
}

bool control_alarm_due(bool overheat, unsigned long since, unsigned long now, unsigned long debounce_ms) {
  return overheat && (now - since) >= debounce_ms;
}

bool control_watchdog_due(unsigned long last_update, unsigned long now, unsigned long timeout_ms) {
  return now >= last_update && (now - last_update) >= timeout_ms;
}

bool control_process_done(float tank, float max_tank) { return tank >= max_tank; }
