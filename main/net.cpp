#include "net.h"

#include <esp_event.h>
#include <esp_log.h>
#include <esp_netif.h>
#include <esp_wifi.h>
#include <stdio.h>
#include <string.h>

#include "credentials.h"
#include "state.h"

namespace {

constexpr char TAG[] = "net";
constexpr char HOSTNAME[] = "moonshiner-esp32";

void on_wifi_event(void *arg, esp_event_base_t base, int32_t id, void *data) {
  (void)arg;
  (void)data;
  if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
    ESP_LOGW(TAG, "STA disconnected, retrying");
    esp_wifi_connect();
  }
}

void on_ip_event(void *arg, esp_event_base_t base, int32_t id, void *data) {
  (void)arg;
  (void)base;
  (void)data;
  if (id == IP_EVENT_STA_GOT_IP) {
    auto *event = static_cast<ip_event_got_ip_t *>(data);
    char address[16];
    snprintf(address, sizeof(address), IPSTR, IP2STR(&event->ip_info.ip));
    state_set_text("ip_address", address);
    ESP_LOGI(TAG, "STA got IP %s", address);
  }
}

}  // namespace

esp_err_t net_start() {
  ESP_ERROR_CHECK(esp_netif_init());
  ESP_ERROR_CHECK(esp_event_loop_create_default());

  esp_netif_t *sta = esp_netif_create_default_wifi_sta();
  esp_netif_set_hostname(sta, HOSTNAME);
  esp_netif_t *ap = esp_netif_create_default_wifi_ap();

  wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
  ESP_ERROR_CHECK(esp_wifi_init(&init));
  ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID, on_wifi_event, nullptr, nullptr));
  ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP, on_ip_event, nullptr, nullptr));

  wifi_config_t sta_config{};
  strncpy(reinterpret_cast<char *>(sta_config.sta.ssid), MS_WIFI_SSID, sizeof(sta_config.sta.ssid) - 1);
  strncpy(reinterpret_cast<char *>(sta_config.sta.password), MS_WIFI_PASSWORD, sizeof(sta_config.sta.password) - 1);
  sta_config.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;

  wifi_config_t ap_config{};
  strncpy(reinterpret_cast<char *>(ap_config.ap.ssid), "Moonshiner ESP32 Hotspot", sizeof(ap_config.ap.ssid) - 1);
  strncpy(reinterpret_cast<char *>(ap_config.ap.password), MS_AP_PASSWORD, sizeof(ap_config.ap.password) - 1);
  ap_config.ap.authmode = WIFI_AUTH_WPA_WPA2_PSK;
  ap_config.ap.max_connection = 4;

  ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_APSTA));
  ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &sta_config));
  ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap_config));
  ESP_ERROR_CHECK(esp_wifi_start());
  esp_wifi_connect();
  ESP_LOGI(TAG, "STA '%s' + AP fallback started", MS_WIFI_SSID);
  return ESP_OK;
}
