/*
 * SH1106 128x64 OLED on I2C GPIO21/22. Unlike the SSD1306 used in the sibling
 * scale project, SH1106 uses page addressing with a 2-column GDDRAM offset.
 */
#include "display.h"

#include <driver/gpio.h>
#include <driver/i2c_master.h>
#include <esp_log.h>
#include <esp_timer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <cmath>
#include <stdio.h>
#include <string.h>

#include "font5x7.h"
#include "state.h"

namespace {

constexpr char TAG[] = "display";
constexpr uint8_t OLED_ADDR = 0x3C;
constexpr int WIDTH = 128;
constexpr int PAGES = 8;
constexpr uint32_t I2C_TIMEOUT = 100;

i2c_master_dev_handle_t device = nullptr;
char status_text[128] = "display: not started";
uint8_t framebuffer[WIDTH * PAGES] = {0};
volatile bool drawing = false;
unsigned long drawing_since = 0;
unsigned long test_until = 0;

// SH1106/SSD1306 I2C frames start with a control byte: 0x00 = command stream,
// 0x40 = data stream. Sending bare command bytes is ACKed by the chip but
// silently ignored, which is why the old firmware reported OK yet showed
// nothing.
esp_err_t send_command(uint8_t command) {
  uint8_t bytes[2] = {0x00, command};
  return i2c_master_transmit(device, bytes, sizeof(bytes), I2C_TIMEOUT);
}

void clear() { memset(framebuffer, 0, sizeof(framebuffer)); }

void pixel(int x, int y, bool on) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= PAGES * 8) return;
  uint8_t &byte = framebuffer[x + (y >> 3) * WIDTH];
  if (on) byte |= 1U << (y & 7);
  else byte &= ~(1U << (y & 7));
}

void rect(int x, int y, int w, int h, bool on) {
  for (int dy = 0; dy < h; dy++)
    for (int dx = 0; dx < w; dx++) pixel(x + dx, y + dy, on);
}

void glyph(int x, int y, char ch, bool on) {
  for (size_t i = 0; i < sizeof(font5x7) / sizeof(font5x7[0]); i++) {
    if (font5x7[i][0] != (uint8_t)ch) continue;
    for (int col = 0; col < 5; col++) {
      uint8_t bits = font5x7[i][col + 1];
      for (int row = 0; row < 7; row++) {
        if (bits & (1U << row)) pixel(x + col, y + row, on);
      }
    }
    return;
  }
}

void text(int x, int y, const char *value, bool on = true) {
  if (value == nullptr) return;
  for (int i = 0; value[i] != '\0'; i++) {
    glyph(x + i * 6, y, value[i], on);
    if (x + i * 6 + 6 >= WIDTH) return;
  }
}

esp_err_t flush() {
  esp_err_t err = ESP_OK;
  for (int page = 0; page < PAGES; page++) {
    uint8_t header[4] = {0x00, (uint8_t)(0xB0 | page), 0x02, 0x10};  // SH1106 column offset 2
    err = i2c_master_transmit(device, header, sizeof(header), I2C_TIMEOUT);
    if (err != ESP_OK) return err;
    uint8_t row[WIDTH + 1];
    row[0] = 0x40;  // write data
    memcpy(row + 1, framebuffer + page * WIDTH, WIDTH);
    err = i2c_master_transmit(device, row, sizeof(row), I2C_TIMEOUT);
    if (err != ESP_OK) return err;
  }
  return ESP_OK;
}

void display_task(void *arg) {
  (void)arg;
  while (true) {
    unsigned long now = (unsigned long)(esp_timer_get_time() / 1000);
    if (drawing && now - drawing_since > 3000) {
      ESP_LOGE(TAG, "previous draw stuck >3s, skipping");
      state_set_text("diagnostic_message", "Display stuck, skipped draw");
    } else if (!drawing) {
      drawing = true;
      drawing_since = now;
      unsigned long start = now;
      clear();
      if (now < test_until) {
        for (int y = 0; y < PAGES * 8; y++)
          for (int x = 0; x < WIDTH; x++) pixel(x, y, ((x / 8) + (y / 8)) % 2 == 0);
        flush();
        drawing = false;
        vTaskDelay(pdMS_TO_TICKS(1000));
        continue;
      }
      int uptime = (int)state_sensor("uptime");
      char line[40];
      snprintf(line, sizeof(line), "Up: %02d:%02d", (uptime / 3600) % 100, (uptime / 60) % 60);
      text(0, 0, line);
      if ((now / 1000) % 2 == 0) rect(120, 1, 5, 5, true);
      const char *ip = state_text("ip_address");
      if (ip[0] != '\0') {
        snprintf(line, sizeof(line), "IP: %s", ip);
        text(0, 24, line);
      } else {
        text(0, 24, "Disconnected");
      }
      float tank = state_sensor("tank_temperature");
      if (std::isfinite(tank)) {
        snprintf(line, sizeof(line), "Tank: %.0f C", tank);
        text(0, 48, line);
      }
      flush();
      drawing = false;
      if (now - start > 500) ESP_LOGW(TAG, "slow draw: %lums", now - start);
    }
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}

}  // namespace

esp_err_t display_start() {
  i2c_master_bus_config_t bus_config{};
  bus_config.clk_source = I2C_CLK_SRC_DEFAULT;
  bus_config.glitch_ignore_cnt = 7;
  bus_config.i2c_port = I2C_NUM_0;
  bus_config.sda_io_num = GPIO_NUM_21;
  bus_config.scl_io_num = GPIO_NUM_22;
  bus_config.flags.enable_internal_pullup = true;

  i2c_master_bus_handle_t bus = nullptr;
  esp_err_t err = i2c_new_master_bus(&bus_config, &bus);
  if (err != ESP_OK) {
    snprintf(status_text, sizeof(status_text), "i2c bus: %s", esp_err_to_name(err));
    return err;
  }
  err = i2c_master_probe(bus, OLED_ADDR, 100);
  if (err != ESP_OK) {
    snprintf(status_text, sizeof(status_text), "probe 0x3C: %s", esp_err_to_name(err));
    return err;
  }

  i2c_device_config_t dev_config{};
  dev_config.dev_addr_length = I2C_ADDR_BIT_LEN_7;
  dev_config.device_address = OLED_ADDR;
  // The ESPHome bus had no frequency override (100 kHz); 400 kHz on this
  // module/wiring is ACKed but can leave the controller unconfigured.
  dev_config.scl_speed_hz = 100000;
  err = i2c_master_bus_add_device(bus, &dev_config, &device);
  if (err != ESP_OK) {
    snprintf(status_text, sizeof(status_text), "add device: %s", esp_err_to_name(err));
    return err;
  }

  // Exact ESPHome ssd1306_i2c settings for model "SH1106 128x64",
  // defaults (flip_x/y=false, invert=false, contrast=1.0, internal VCC).
  // 0x8D/0x14 is the charge pump — 0xAD/0x8B belongs to SH1107 and leaves
  // this panel dark even though every I2C write is acknowledged.
  const uint8_t init[][2] = {
      {0xAE, 0}, {0xD5, 0x80}, {0xA8, 0x3F}, {0xD3, 0x00}, {0x40, 0},
      {0x8D, 0x14}, {0x20, 0x00}, {0xA0, 0}, {0xC8, 0}, {0xDA, 0x12},
      {0xD9, 0xF1}, {0xDB, 0x35}, {0xA4, 0}, {0xA6, 0}, {0x2E, 0},
      {0x81, 0xFF}, {0xAF, 0},
  };
  for (const auto &cmd : init) {
    uint8_t bytes[3] = {0x00, cmd[0], cmd[1]};
    err = i2c_master_transmit(device, bytes, cmd[1] == 0 ? 2 : 3, I2C_TIMEOUT);
    if (err != ESP_OK) {
      snprintf(status_text, sizeof(status_text), "init 0x%02X: %s", cmd[0], esp_err_to_name(err));
      return err;
    }
  }
  vTaskDelay(pdMS_TO_TICKS(120));  // charge pump settles before first draw
  clear();
  err = flush();
  snprintf(status_text, sizeof(status_text), "SH1106 probe=OK init=OK flush=%s", esp_err_to_name(err));
  if (err != ESP_OK) return err;
  xTaskCreate(display_task, "display", 4096, nullptr, 3, nullptr);
  ESP_LOGI(TAG, "SH1106 ready");
  return ESP_OK;
}

const char *display_status() { return status_text; }

void display_test() {
  test_until = (unsigned long)(esp_timer_get_time() / 1000) + 6000;
}
