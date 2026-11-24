#ifndef MOONSHINER_ACTUATORS_H
#define MOONSHINER_ACTUATORS_H

#include <esp_err.h>

esp_err_t actuators_init();

/* level: 0..1 for the heater, 0..1 fraction of 1023 for a valve. */
void actuators_set_heater(float level);
void actuators_set_valve(bool upper, float level);
void actuators_all_off();

void actuators_buzzer_play(const char *rtttl);
void actuators_buzzer_stop();
void actuators_set_volume(int percent);
bool actuators_buzzer_playing();
// Sampled GPIO pulse counters, merged into the diagnostic text sensor.
const char *actuators_status();

#endif  // MOONSHINER_ACTUATORS_H
