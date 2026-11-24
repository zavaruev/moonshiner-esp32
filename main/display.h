#ifndef MOONSHINER_DISPLAY_H
#define MOONSHINER_DISPLAY_H

#include <esp_err.h>

esp_err_t display_start();
const char *display_status();
// Fill the panel with a checkerboard for 5 s (triggered by Refresh UI button).
void display_test();

#endif  // MOONSHINER_DISPLAY_H
