#pragma once

#include <stdint.h>

// Records why the chip booted and keeps a small history in RTC memory so a
// reset reason can be read over HTTP *after* the reboot has happened.
void boot_diag_init();
uint32_t boot_diag_count();
uint32_t boot_diag_current_reason();
uint32_t boot_diag_previous_reason();
const char *boot_diag_reason_name(uint32_t reason);

// The panic handler's console output is mirrored into RTC memory so the exact
// exception and crash address can be read over HTTP after the reboot.
const char *boot_diag_panic_text();
void boot_diag_panic_char(char c);
