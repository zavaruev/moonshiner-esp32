#include "actuators.h"

#include <driver/gpio.h>
#include <driver/ledc.h>
#include <esp_log.h>
#include <esp_timer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

#include "control.h"

namespace {

constexpr char TAG[] = "act";
constexpr gpio_num_t HEATER_PIN = GPIO_NUM_27;
constexpr gpio_num_t VALVE_HIGH_PIN = GPIO_NUM_14;
constexpr gpio_num_t VALVE_LOW_PIN = GPIO_NUM_13;
constexpr gpio_num_t BUZZER_PIN = GPIO_NUM_33;
constexpr unsigned long HEATER_PERIOD_MS = 1000;
constexpr unsigned long VALVE_PULSE_MS = 200;

float heater_level = 0.0f;
float valve_levels[2] = {0.0f, 0.0f};  // [0] upper, [1] lower
int buzzer_percent = 100;
volatile bool buzzer_playing = false;
char rtttl_pattern[256];
char actuator_status_text[128] = "actuators: not started";

unsigned long now_ms() { return (unsigned long)(esp_timer_get_time() / 1000); }

void heater_task(void *arg) {
  (void)arg;
  while (true) {
    unsigned long phase = now_ms() % HEATER_PERIOD_MS;
    gpio_set_level(HEATER_PIN, heater_level > 0.0f && phase < heater_level * HEATER_PERIOD_MS ? 1 : 0);
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

void valve_task(void *arg) {
  (void)arg;
  static unsigned long pulse_start[2] = {0, 0};
  while (true) {
    unsigned long now = now_ms();
    for (int i = 0; i < 2; i++) {
      float scaled = valve_levels[i] * 1023.0f;
      if (scaled <= 0.5f) {
        gpio_set_level(i == 0 ? VALVE_HIGH_PIN : VALVE_LOW_PIN, 0);
      } else if (scaled >= 1022.5f) {
        gpio_set_level(i == 0 ? VALVE_HIGH_PIN : VALVE_LOW_PIN, 1);
      } else {
        unsigned long interval = control_pulse_interval(scaled, VALVE_PULSE_MS);
        if (interval == 0 || now - pulse_start[i] >= interval) pulse_start[i] = now;
        gpio_set_level(i == 0 ? VALVE_HIGH_PIN : VALVE_LOW_PIN,
                       now - pulse_start[i] < VALVE_PULSE_MS ? 1 : 0);
      }
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

int note_frequency(char note, bool sharp, int octave) {
  static const int semitone[] = {0, 2, 4, 5, 7, 9, 11};  // C D E F G A B
  int index = note >= 'a' && note <= 'g' ? note - 'a' : note - 'A';
  if (index < 0 || index > 6) return 0;
  int midi = 12 * (octave + 1) + semitone[index] + (sharp ? 1 : 0);
  return (int)(440.0 * pow(2.0, (midi - 69) / 12.0));
}

void tone(int freq, uint32_t duration_ms) {
  if (freq <= 0) {
    ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, 0);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0);
  } else {
    ledc_set_freq(LEDC_LOW_SPEED_MODE, LEDC_TIMER_0, (uint32_t)freq);
    float slider = buzzer_percent / 100.0f;
    uint32_t duty = (uint32_t)((slider * slider * slider) * 0.5f * 8191.0f);
    ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, duty);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0);
  }
  vTaskDelay(pdMS_TO_TICKS(duration_ms));
}

void rtttl_task(void *arg) {
  (void)arg;
  while (true) {
    while (!buzzer_playing) vTaskDelay(pdMS_TO_TICKS(30));

    char pattern[sizeof(rtttl_pattern)];
    strncpy(pattern, rtttl_pattern, sizeof(pattern) - 1);
    pattern[sizeof(pattern) - 1] = '\0';

    char *colon = strchr(pattern, ':');
    if (colon == nullptr) { buzzer_playing = false; continue; }
    char *header = pattern;
    *colon = '\0';
    char *notes = colon + 1;
    *header = '\0';  // discard the song name

    int def_dur = 4, octave = 5, bpm = 100;
    char *parts = strtok(header, ",");
    while (parts != nullptr) {
      if (parts[0] == 'd') def_dur = atoi(parts + 2);
      else if (parts[0] == 'o') octave = atoi(parts + 2);
      else if (parts[0] == 'b') bpm = atoi(parts + 2);
      parts = strtok(nullptr, ",");
    }
    if (bpm < 1) bpm = 100;
    uint32_t beat = 60000 / (uint32_t)bpm;

    char *token = strtok(notes, ",");
    while (token != nullptr && buzzer_playing) {
      int i = 0;
      int dur = def_dur;
      while (token[i] >= '0' && token[i] <= '9') dur = dur * 10 + (token[i++] - '0');
      int note_octave = octave;
      bool sharp = false;
      int freq = 0;
      if (token[i] == 'p' || token[i] == 'P' || token[i] == 'r' || token[i] == 'R') {
        i++;
      } else if ((token[i] >= 'a' && token[i] <= 'g') || (token[i] >= 'A' && token[i] <= 'G')) {
        char note = token[i++];
        if (token[i] == '#') { sharp = true; i++; }
        if (token[i] >= '0' && token[i] <= '9') note_octave = token[i++] - '0';
        freq = note_frequency(note, sharp, note_octave);
      }
      uint32_t ms = dur > 0 ? beat * 4 / (uint32_t)dur : beat;
      tone(freq, ms * 9 / 10);
      tone(0, ms / 10);
      token = strtok(nullptr, ",");
    }
    tone(0, 0);
    buzzer_playing = false;
  }
}

void actuator_monitor(void *arg) {
  (void)arg;
  while (true) {
    vTaskDelay(pdMS_TO_TICKS(2000));
    int rising[2] = {0, 0};
    bool previous[2] = {false, false};
    for (int sample = 0; sample < 200; sample++) {
      for (int i = 0; i < 2; i++) {
        bool level = gpio_get_level(i == 0 ? VALVE_HIGH_PIN : VALVE_LOW_PIN) != 0;
        if (level && !previous[i]) rising[i]++;
        previous[i] = level;
      }
      vTaskDelay(pdMS_TO_TICKS(5));
    }
    snprintf(actuator_status_text, sizeof(actuator_status_text),
             "V high=%.0f low=%.0f pulses=%d/%d", valve_levels[0] * 1023.0f,
             valve_levels[1] * 1023.0f, rising[0], rising[1]);
  }
}

}  // namespace

esp_err_t actuators_init() {
  gpio_config_t outputs{};
  outputs.pin_bit_mask = (1ULL << HEATER_PIN) | (1ULL << VALVE_HIGH_PIN) | (1ULL << VALVE_LOW_PIN);
  outputs.mode = GPIO_MODE_OUTPUT;
  outputs.pull_down_en = GPIO_PULLDOWN_ENABLE;
  outputs.pull_up_en = GPIO_PULLUP_DISABLE;
  outputs.intr_type = GPIO_INTR_DISABLE;
  ESP_ERROR_CHECK(gpio_config(&outputs));
  actuators_all_off();

  ledc_timer_config_t timer{};
  timer.speed_mode = LEDC_LOW_SPEED_MODE;
  timer.timer_num = LEDC_TIMER_0;
  timer.duty_resolution = LEDC_TIMER_13_BIT;
  timer.freq_hz = 2000;
  timer.clk_cfg = LEDC_AUTO_CLK;
  ESP_ERROR_CHECK(ledc_timer_config(&timer));

  ledc_channel_config_t channel{};
  channel.gpio_num = BUZZER_PIN;
  channel.speed_mode = LEDC_LOW_SPEED_MODE;
  channel.channel = LEDC_CHANNEL_0;
  channel.timer_sel = LEDC_TIMER_0;
  channel.duty = 0;
  ESP_ERROR_CHECK(ledc_channel_config(&channel));

  xTaskCreate(heater_task, "heater", 2048, nullptr, 3, nullptr);
  xTaskCreate(valve_task, "valves", 2048, nullptr, 3, nullptr);
  xTaskCreate(rtttl_task, "rtttl", 3072, nullptr, 2, nullptr);
  xTaskCreate(actuator_monitor, "act_mon", 2048, nullptr, 1, nullptr);
  return ESP_OK;
}

void actuators_set_heater(float level) { heater_level = level < 0 ? 0 : (level > 1 ? 1 : level); }

void actuators_set_valve(bool upper, float level) {
  if (level < 0) level = 0;
  if (level > 1) level = 1;
  valve_levels[upper ? 0 : 1] = level;
}

void actuators_all_off() {
  heater_level = 0;
  valve_levels[0] = valve_levels[1] = 0;
  gpio_set_level(HEATER_PIN, 0);
  gpio_set_level(VALVE_HIGH_PIN, 0);
  gpio_set_level(VALVE_LOW_PIN, 0);
  ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, 0);
  ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0);
  buzzer_playing = false;
}

void actuators_buzzer_play(const char *rtttl) {
  if (rtttl == nullptr) return;
  strncpy(rtttl_pattern, rtttl, sizeof(rtttl_pattern) - 1);
  rtttl_pattern[sizeof(rtttl_pattern) - 1] = '\0';
  buzzer_playing = true;
}

void actuators_buzzer_stop() {
  buzzer_playing = false;
  tone(0, 0);
}

void actuators_set_volume(int percent) {
  buzzer_percent = percent < 0 ? 0 : (percent > 100 ? 100 : percent);
}

bool actuators_buzzer_playing() { return buzzer_playing; }

const char *actuators_status() { return actuator_status_text; }
