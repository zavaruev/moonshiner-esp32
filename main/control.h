#ifndef MOONSHINER_CONTROL_H
#define MOONSHINER_CONTROL_H

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Pure decision helpers — no ESP-IDF dependencies, host-testable. */

bool control_should_close_valves(float column, float target, float delta);
bool control_should_open_valves(float column, float target);
float control_valve_level(int setting, float coefficient, bool apply_coefficient);
unsigned long control_pulse_interval(float level, unsigned long pulse_ms);
bool control_alarm_due(bool overheat, unsigned long since, unsigned long now, unsigned long debounce_ms);
bool control_watchdog_due(unsigned long last_update, unsigned long now, unsigned long timeout_ms);
bool control_process_done(float tank, float max_tank);

#ifdef __cplusplus
}
#endif

#endif  // MOONSHINER_CONTROL_H
