#include "control_task.h"

#include <esp_log.h>
#include <esp_timer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <cmath>
#include <stdio.h>
#include <string.h>

#include "actuators.h"
#include "control.h"
#include "display.h"
#include "sensors.h"
#include "state.h"

namespace {

constexpr char TAG[] = "control";
constexpr unsigned long ALARM_DEBOUNCE_MS = 5000;
constexpr unsigned long WATCHDOG_TIMEOUT_MS = 60000;
constexpr float REDUCTION_TANK_THRESHOLD = 84.0f;
constexpr float COLD_START_TANK = 70.0f;
constexpr int HEATER_MAX_W = 2750;
constexpr int VALVE_MAX = 1023;

volatile bool control_needed = true;
bool startup_checked = false;
bool process_finished = false;
bool overheat_active = false;
unsigned long overheat_since = 0;
float watchdog_heat = 0, watchdog_vh = 0, watchdog_vl = 0;

unsigned long now_ms() { return (unsigned long)(esp_timer_get_time() / 1000); }

void emergency_shutdown() {
  actuators_all_off();
  if (state_number("heat_power") != 0) state_set_number("heat_power", 0);
  if (state_number("valve_high_setting") != 0) state_set_number("valve_high_setting", 0);
  if (state_number("valve_low_setting") != 0) state_set_number("valve_low_setting", 0);
  state_set_binary("distilling_status", false);
  state_set_binary("heating_status", false);
  state_set_binary("alarm_status", false);
  ESP_LOGI(TAG, "emergency shutdown executed");
}

void button_hook(const char *id) {
  if (strcmp(id, "restart_process") == 0) {
    process_finished = false;
    overheat_active = false;
    overheat_since = 0;
    state_set_number("coef_otbora", 1.0f);
    state_set_text("status_message", "RUNNING");
    ESP_LOGI(TAG, "process restarted manually");
  } else if (strcmp(id, "refresh_ui") == 0) {
    state_emit_all();
    display_test();  // 6 s checkerboard to distinguish driver from panel issues
  }
}

void startup_logic(float tank) {
  if (startup_checked) return;
  startup_checked = true;
  if (tank < COLD_START_TANK) {
    ESP_LOGI(TAG, "cold start detected, resetting defaults");
    process_finished = false;
    state_set_number("target_temp", 95.0f);
    state_set_number("delta", 0.3f);
    state_set_number("max_tank_temp", 99.0f);
    state_set_number("coef_otbora", 1.0f);
    state_set_number("heat_power", 0);
    state_set_number("valve_high_setting", 0);
    state_set_number("valve_low_setting", 0);
    state_set_switch("use_reduction_coefficient", true);
    state_set_switch("disable_upper_valve_closing", false);
  } else {
    ESP_LOGI(TAG, "hot start detected, allowing restart");
    process_finished = false;
  }
  state_set_text("status_message", "RUNNING");
  state_emit_all();
}

void run_control() {
  float column = state_sensor("column_temperature");
  float tank = state_sensor("tank_temperature");
  if (!std::isfinite(column) || !std::isfinite(tank)) return;

  startup_logic(tank);

  // Auto-recovery after a watchdog shutdown.
  if (watchdog_heat > 0 && tank < state_number("max_tank_temp")) {
    ESP_LOGI(TAG, "watchdog recovery: heat=%.0f vh=%.0f vl=%.0f", watchdog_heat, watchdog_vh, watchdog_vl);
    state_set_number("heat_power", watchdog_heat);
    if (watchdog_vh > 0) state_set_number("valve_high_setting", watchdog_vh);
    if (watchdog_vl > 0) state_set_number("valve_low_setting", watchdog_vl);
    watchdog_heat = watchdog_vh = watchdog_vl = 0;
  }

  if (process_finished) {
    emergency_shutdown();
    state_set_text("status_message", "DONE");
    return;
  }

  if (control_process_done(tank, state_number("max_tank_temp"))) {
    ESP_LOGI(TAG, "max tank temp reached, process finished");
    process_finished = true;
    emergency_shutdown();
    state_set_text("status_message", "DONE");
    return;
  }

  state_set_text("status_message", "RUNNING");
  actuators_set_heater(state_number("heat_power") / (float)HEATER_MAX_W);
  state_set_binary("heating_status", state_number("heat_power") > 0);

  float vh = 0, vl = 0;
  const float target = state_number("target_column_temp");
  const float delta = state_number("delta");
  if (control_should_close_valves(column, target, delta)) {
    if (!overheat_active) {
      overheat_active = true;
      overheat_since = now_ms();
      if (tank >= REDUCTION_TANK_THRESHOLD && state_switch("use_reduction_coefficient")) {
        float reduced = state_number("coef_otbora") * 0.9f;
        state_set_number("coef_otbora", reduced);
        ESP_LOGI(TAG, "overheat: tank >= 84, coef reduced to %.3f", reduced);
      }
    }
    if (state_switch("disable_upper_valve_closing")) {
      vh = control_valve_level((int)state_number("valve_high_setting"), 1.0f, false);
    }
    vl = 0;
    state_set_binary("distilling_status", state_switch("disable_upper_valve_closing") &&
                                             state_number("valve_high_setting") > 0);
  } else if (control_should_open_valves(column, target)) {
    overheat_active = false;
    const bool apply = state_switch("use_reduction_coefficient");
    vh = control_valve_level((int)state_number("valve_high_setting"), 1.0f, false);
    vl = control_valve_level((int)state_number("valve_low_setting"), state_number("coef_otbora"), apply);
    state_set_binary("distilling_status", vh > 0 || vl > 0);
    if (actuators_buzzer_playing()) {
      actuators_buzzer_stop();
      state_set_binary("alarm_status", false);
      overheat_since = 0;
    }
  }

  if (control_alarm_due(overheat_active, overheat_since, now_ms(), ALARM_DEBOUNCE_MS) &&
      !actuators_buzzer_playing()) {
    actuators_buzzer_play(
        "Imperial:d=4,o=5,b=100:e,e,e,8c,16g,e,8c,16g,e,p,b,b,b,8c6,16g,d#,8c,16g,e");
    state_set_binary("alarm_status", true);
  }

  actuators_set_valve(true, vh);
  actuators_set_valve(false, vl);
}

void control_task(void *arg) {
  (void)arg;
  while (true) {
    if (control_needed) {
      control_needed = false;
      run_control();
    }
    unsigned long now = now_ms();
    if (control_watchdog_due(sensors_last_update_ms(), now, WATCHDOG_TIMEOUT_MS)) {
      ESP_LOGE(TAG, "no temperature update for 60s, shutting down");
      watchdog_heat = state_number("heat_power");
      watchdog_vh = state_number("valve_high_setting");
      watchdog_vl = state_number("valve_low_setting");
      emergency_shutdown();
      sensors_note_update();  // avoid retriggering the watchdog every tick
    }
    if (actuators_buzzer_playing()) {
      actuators_set_volume((int)state_number("buzzer_volume"));
    }
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

}  // namespace

esp_err_t control_start() {
  state_set_button_hook(button_hook);
  xTaskCreate(control_task, "control", 4096, nullptr, 5, nullptr);
  return ESP_OK;
}

void control_on_temperature() { control_needed = true; }
