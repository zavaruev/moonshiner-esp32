#include <driver/gpio.h>
#include <esp_err.h>
#include <esp_log.h>
#include <esp_system.h>
#include <nvs_flash.h>
#include <stdio.h>

#include "actuators.h"
#include "boot_diag.h"
#include "control_task.h"
#include "display.h"
#include "mcp_server.h"
#include "net.h"
#include "ota.h"
#include "sensors.h"
#include "state.h"
#include "web_server.h"

namespace {

constexpr char TAG[] = "app";

// Actuators: heater SSR, upper valve, lower valve. The hardware state during
// reset is not guaranteed, so drive all three low before any network service
// starts. The heater must stay a software PWM (never LEDC on ADC2).
constexpr gpio_num_t SAFE_OUTPUT_PINS[] = {GPIO_NUM_27, GPIO_NUM_14, GPIO_NUM_13};

void safe_gpio_init() {
  for (gpio_num_t pin : SAFE_OUTPUT_PINS) {
    gpio_config_t config{};
    config.pin_bit_mask = 1ULL << static_cast<int>(pin);
    config.mode = GPIO_MODE_OUTPUT;
    config.pull_up_en = GPIO_PULLUP_DISABLE;
    config.pull_down_en = GPIO_PULLDOWN_ENABLE;
    config.intr_type = GPIO_INTR_DISABLE;
    ESP_ERROR_CHECK(gpio_config(&config));
    ESP_ERROR_CHECK(gpio_set_level(pin, 0));
  }
  ESP_LOGI(TAG, "heater and valves forced OFF");
}

}  // namespace

extern "C" void app_main() {
  esp_err_t err = nvs_flash_init();
  if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    err = nvs_flash_init();
  }
  ESP_ERROR_CHECK(err);
  boot_diag_init();

  safe_gpio_init();
  ESP_ERROR_CHECK(state_init());
  ota_init();
  ESP_ERROR_CHECK(net_start());
  ESP_ERROR_CHECK(actuators_init());
  ESP_ERROR_CHECK(sensors_start());
  ESP_ERROR_CHECK(control_start());
  ESP_ERROR_CHECK(display_start());
  ESP_ERROR_CHECK(web_start());
  ESP_ERROR_CHECK(mcp_start());

  char report[256];
  snprintf(report, sizeof(report), "%s | %s | %s", sensors_status(), display_status(),
           actuators_status());
  state_set_text("diagnostic_message", report);
}
