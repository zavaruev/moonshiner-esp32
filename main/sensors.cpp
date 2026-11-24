#include "sensors.h"

#include <ds18b20.h>
#include <driver/gpio.h>
#include <driver/uart.h>
#include <esp_log.h>
#include <esp_system.h>
#include <esp_timer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <onewire_bus.h>
#include <onewire_bus_impl_rmt.h>
#include <onewire_bus_impl_uart.h>
#include <algorithm>
#include <cmath>
#include <cstring>
#include <stdio.h>

#include "control_task.h"
#include "state.h"

namespace {

constexpr char TAG[] = "sensors";
constexpr gpio_num_t ONEWIRE_PIN = GPIO_NUM_4;
// Addresses from the ESPHome YAML (family byte first in that notation).
constexpr uint64_t COLUMN_ADDR = 0x043C01F096B22428ULL;
constexpr uint64_t TANK_ADDR = 0xBF14D0231E64FF28ULL;

onewire_bus_handle_t bus = nullptr;
ds18b20_device_handle_t column_sensor = nullptr;
ds18b20_device_handle_t tank_sensor = nullptr;
unsigned long last_update = 0;
char sensors_status_text[128] = "sensors: not started";

uint64_t byte_reverse(uint64_t value) {
  uint64_t out = 0;
  for (int i = 0; i < 8; i++) {
    out = (out << 8) | (value & 0xff);
    value >>= 8;
  }
  return out;
}

bool matches(uint64_t found, uint64_t expected) {
  return found == expected || byte_reverse(found) == expected;
}

float median_filter(float sample, bool column) {
  static float rings[2][5] = {{NAN, NAN, NAN, NAN, NAN}, {NAN, NAN, NAN, NAN, NAN}};
  static int indices[2] = {0, 0};
  auto &ring = rings[column ? 0 : 1];
  int &index = indices[column ? 0 : 1];
  ring[index++ % 5] = sample;
  index %= 5;
  float copy[5];
  int count = 0;
  for (float value : ring) {
    if (std::isfinite(value)) copy[count++] = value;
  }
  if (count == 0) return NAN;
  std::sort(copy, copy + count);
  return copy[count / 2];
}

void sensor_task(void *arg) {
  (void)arg;
  vTaskDelay(pdMS_TO_TICKS(200));
  while (true) {
    if (bus != nullptr && (column_sensor != nullptr || tank_sensor != nullptr)) {
      if (ds18b20_trigger_temperature_conversion_for_all(bus) == ESP_OK) {
        float value;
        if (column_sensor != nullptr && ds18b20_get_temperature(column_sensor, &value) == ESP_OK) {
          state_set_sensor("column_temperature", median_filter(value, true));
          last_update = (unsigned long)(esp_timer_get_time() / 1000);
          control_on_temperature();
        }
        if (tank_sensor != nullptr && ds18b20_get_temperature(tank_sensor, &value) == ESP_OK) {
          state_set_sensor("tank_temperature", median_filter(value, false));
          last_update = (unsigned long)(esp_timer_get_time() / 1000);
          control_on_temperature();
        }
      }
    }
    state_set_sensor("uptime", (float)(esp_timer_get_time() / 1000000));
    state_set_sensor("free_heap", (float)esp_get_free_heap_size());
    vTaskDelay(pdMS_TO_TICKS(5000));
  }
}

}  // namespace

esp_err_t sensors_start() {
  onewire_bus_config_t bus_config{};
  bus_config.bus_gpio_num = ONEWIRE_PIN;
  bus_config.flags.en_pull_up = true;
  // The RMT backend enumerated zero devices on this board, while the UART
  // backend drives the same one-wire timing with fewer moving parts.
  onewire_bus_uart_config_t uart_config{};
  uart_config.uart_port_num = UART_NUM_1;
  esp_err_t bus_err = onewire_new_bus_uart(&bus_config, &uart_config, &bus);
  if (bus_err != ESP_OK) {
    onewire_bus_rmt_config_t rmt_config{};
    rmt_config.max_rx_bytes = 10;
    bus_err = onewire_new_bus_rmt(&bus_config, &rmt_config, &bus);
  }
  if (bus_err != ESP_OK) {
    snprintf(sensors_status_text, sizeof(sensors_status_text), "onewire bus: %s",
             esp_err_to_name(bus_err));
    return bus_err;
  }

  int found_count = 0;
  uint64_t first_address = 0;
  // A long 2-wire bus sometimes answers only one device per search pass.
  // Repeat with a fresh iterator until both known ROMs have been seen.
  for (int attempt = 0; attempt < 8 && (column_sensor == nullptr || tank_sensor == nullptr); attempt++) {
    onewire_device_iter_handle_t iter = nullptr;
    if (onewire_new_device_iter(bus, &iter) != ESP_OK) {
      vTaskDelay(pdMS_TO_TICKS(250));
      continue;
    }
    onewire_device_t device;
    while (onewire_device_iter_get_next(iter, &device) == ESP_OK) {
      ds18b20_config_t config{};
      ds18b20_device_handle_t handle = nullptr;
      if (ds18b20_new_device_from_enumeration(&device, &config, &handle) != ESP_OK) continue;
      onewire_device_address_t address = 0;
      ds18b20_get_device_address(handle, &address);
      if (found_count == 0) first_address = address;
      found_count++;
      ESP_LOGI(TAG, "DS18B20 found: %016llX", (unsigned long long)address);
      if (matches(address, COLUMN_ADDR)) column_sensor = handle;
      else if (matches(address, TANK_ADDR)) tank_sensor = handle;
      else ESP_LOGW(TAG, "unknown address, ignoring");
    }
    onewire_del_device_iter(iter);
    vTaskDelay(pdMS_TO_TICKS(250));
  }

  snprintf(sensors_status_text, sizeof(sensors_status_text),
           "DS18B20 found=%d col=%d tank=%d first=%016llX", found_count,
           column_sensor != nullptr, tank_sensor != nullptr, (unsigned long long)first_address);

  if (column_sensor == nullptr || tank_sensor == nullptr) {
    ESP_LOGE(TAG, "expected two DS18B20 sensors, found column=%d tank=%d",
             column_sensor != nullptr, tank_sensor != nullptr);
  }
  // 12-bit conversion busy-waits 750 ms with interrupts off, longer than the
  // 300 ms interrupt watchdog on this chip. 10-bit (187 ms) is safe.
  if (column_sensor != nullptr) ds18b20_set_resolution(column_sensor, DS18B20_RESOLUTION_10B);
  if (tank_sensor != nullptr) ds18b20_set_resolution(tank_sensor, DS18B20_RESOLUTION_10B);
  xTaskCreate(sensor_task, "ds18b20", 4096, nullptr, 4, nullptr);
  return ESP_OK;
}

unsigned long sensors_last_update_ms() { return last_update; }

void sensors_note_update() { last_update = (unsigned long)(esp_timer_get_time() / 1000); }

const char *sensors_status() { return sensors_status_text; }

bool sensors_valid() {
  return std::isfinite(state_sensor("column_temperature")) && std::isfinite(state_sensor("tank_temperature"));
}
