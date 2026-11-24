#ifndef MOONSHINER_SENSORS_H
#define MOONSHINER_SENSORS_H

#include <esp_err.h>

esp_err_t sensors_start();
unsigned long sensors_last_update_ms();
void sensors_note_update();
bool sensors_valid();
const char *sensors_status();

#endif  // MOONSHINER_SENSORS_H
