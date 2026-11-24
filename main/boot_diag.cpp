#include "boot_diag.h"

#include <esp_attr.h>
#include <esp_system.h>
#include <esp_private/panic_internal.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

namespace {

// RTC_NOINIT memory survives the panic reboot. The initializer is ignored for
// NOINIT, so lengths are always set explicitly in boot_diag_init().
RTC_NOINIT_ATTR uint32_t s_boot_count;
RTC_NOINIT_ATTR uint32_t s_previous_reason;
uint32_t s_current_reason = 0;

constexpr size_t kPanicCap = 1024;
RTC_NOINIT_ATTR char s_panic_raw[kPanicCap];
RTC_NOINIT_ATTR size_t s_panic_len;
RTC_NOINIT_ATTR char s_panic_snapshot[kPanicCap];
RTC_NOINIT_ATTR size_t s_snapshot_len;

}  // namespace

void boot_diag_init() {
  s_current_reason = static_cast<uint32_t>(esp_reset_reason());
  s_previous_reason = s_current_reason;
  s_boot_count++;

  // Preserve the panic output from the boot that just died, then start a
  // fresh capture buffer for the next panic.
  if (s_panic_len > 0 && s_panic_len < kPanicCap) {
    memcpy(s_panic_snapshot, s_panic_raw, s_panic_len + 1);
    s_snapshot_len = s_panic_len;
  }
  s_panic_len = 0;
  s_panic_raw[0] = '\0';
}

uint32_t boot_diag_count() { return s_boot_count; }
uint32_t boot_diag_current_reason() { return s_current_reason; }
uint32_t boot_diag_previous_reason() { return s_previous_reason; }

const char *boot_diag_reason_name(uint32_t reason) {
  switch (static_cast<esp_reset_reason_t>(reason)) {
    case ESP_RST_UNKNOWN:    return "unknown";
    case ESP_RST_POWERON:    return "poweron";
    case ESP_RST_EXT:        return "external";
    case ESP_RST_SW:         return "software";
    case ESP_RST_PANIC:      return "panic";
    case ESP_RST_INT_WDT:    return "int_wdt";
    case ESP_RST_TASK_WDT:   return "task_wdt";
    case ESP_RST_WDT:        return "wdt";
    case ESP_RST_DEEPSLEEP:  return "deepsleep";
    case ESP_RST_BROWNOUT:   return "brownout";
    case ESP_RST_SDIO:       return "sdio";
    default:                 return "other";
  }
}

const char *boot_diag_panic_text() {
  // Prefer the panic that caused this boot; fall back to a panic currently
  // being captured if it has happened since app_main started.
  if (s_snapshot_len > 0) return s_panic_snapshot;
  return s_panic_len > 0 ? s_panic_raw : "";
}

void boot_diag_panic_char(char c) {
  if (s_panic_len + 1 >= kPanicCap) return;
  s_panic_raw[s_panic_len++] = c;
  s_panic_raw[s_panic_len] = '\0';
}

static void append_str(const char *s) {
  if (s == nullptr) return;
  while (*s != '\0') boot_diag_panic_char(*s++);
}

// esp_panic_handler() is called from a different translation unit than
// panic_print_str(), so unlike the printer helpers it can be intercepted with
// --wrap. panic_info_t carries the exact reason, description and fault address.
extern "C" void __real_esp_panic_handler(panic_info_t *info);
extern "C" void __wrap_esp_panic_handler(panic_info_t *info) {
  s_panic_len = 0;
  s_panic_raw[0] = '\0';
  append_str("core=");
  boot_diag_panic_char(static_cast<char>('0' + (info->core % 10)));
  append_str(" exc=");
  boot_diag_panic_char(static_cast<char>('0' + (info->exception % 10)));
  append_str(" reason=");
  append_str(info->reason != nullptr ? info->reason : "none");
  append_str(" desc=");
  append_str(info->description != nullptr ? info->description : "none");
  append_str(" addr=0x");
  char hex[16];
  snprintf(hex, sizeof(hex), "%08x", (unsigned)(uintptr_t)info->addr);
  append_str(hex);
  append_str(" abort=");
  append_str(g_panic_abort_details != nullptr ? g_panic_abort_details : "none");
  __real_esp_panic_handler(info);
}
