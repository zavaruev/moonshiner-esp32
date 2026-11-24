idf_component_register(
  SRCS "app_main.cpp" "state.cpp" "web_server.cpp" "net.cpp"
       "control.cpp" "control_task.cpp" "actuators.cpp" "sensors.cpp" "display.cpp"
       "mcp_server.cpp" "ota.c" "boot_diag.cpp"
  INCLUDE_DIRS "."
  REQUIRES esp_http_server nvs_flash driver esp_driver_gpio esp_driver_i2c esp_driver_ledc esp_driver_uart
           esp_system esp_timer esp_wifi esp_netif esp_event onewire_bus ds18b20 arduinojson
           app_update esp_partition bootloader_support lwip
)
