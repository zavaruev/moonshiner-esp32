#ifndef MOONSHINER_CONTROL_TASK_H
#define MOONSHINER_CONTROL_TASK_H

#include <esp_err.h>

esp_err_t control_start();
// Called by the sensor task after each valid temperature update.
void control_on_temperature();

#endif  // MOONSHINER_CONTROL_TASK_H
