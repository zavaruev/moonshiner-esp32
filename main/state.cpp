#include "state.h"

#include <ctype.h>
#include <esp_log.h>
#include <math.h>
#include <nvs_flash.h>
#include <stdio.h>
#include <string.h>

namespace {

constexpr char TAG[] = "state";
constexpr size_t kMaxCallbacks = 4;
constexpr size_t kTextCap = 160;

struct Entity {
  EntityDef def;
  float num;
  bool flag;
  char text[kTextCap];
};

#define E_NUM(id_, name_, init_, min_, max_, step_, dec_, pers_) \
  { {id_, name_, EntityType::Number, init_, min_, max_, step_, dec_, pers_}, init_, false, {0} }
#define E_SENS(id_, name_, dec_) \
  { {id_, name_, EntityType::Sensor, 0, 0, 0, 0, dec_, false}, NAN, false, {0} }
#define E_SW(id_, name_, init_, pers_) \
  { {id_, name_, EntityType::Switch, 0, 0, 0, 0, 0, pers_}, 0, init_, {0} }
#define E_BIN(id_, name_) \
  { {id_, name_, EntityType::BinarySensor, 0, 0, 0, 0, 0, false}, 0, false, {0} }
#define E_TEXT(id_, name_, init_) \
  { {id_, name_, EntityType::TextSensor, 0, 0, 0, 0, 0, false}, 0, false, init_ }
#define E_BTN(id_, name_) \
  { {id_, name_, EntityType::Button, 0, 0, 0, 0, 0, false}, 0, false, {0} }

Entity entities[] = {
    E_NUM("target_column_temp", "Target Column Temp", 95.0f, 0, 100, 0.01f, 2, true),
    E_NUM("delta", "Delta", 0.3f, 0, 5, 0.01f, 2, true),
    E_NUM("max_tank_temp", "Max Tank Temp", 99.0f, 0, 100, 0.1f, 1, true),
    E_NUM("coef_otbora", "Coef Otbora", 1.0f, 0, 1, 0.001f, 3, true),
    E_NUM("heat_power", "Heater Power", 1747.0f, 0, 2750, 10, 0, true),
    E_NUM("valve_high_setting", "Valve High Setting", 0, 0, 1023, 1, 0, true),
    E_NUM("valve_low_setting", "Valve Low Setting", 0, 0, 1023, 1, 0, true),
    E_NUM("buzzer_volume", "Buzzer Volume", 100, 0, 100, 1, 0, true),
    E_SW("use_reduction_coefficient", "Use Reduction Coefficient", true, true),
    E_SW("disable_upper_valve_closing", "Disable Upper Valve Closing", false, true),
    E_SENS("column_temperature", "Column Temperature", 2),
    E_SENS("tank_temperature", "Tank Temperature", 1),
    E_SENS("uptime", "Uptime", 0),
    E_SENS("wifi_signal", "WiFi Signal", 0),
    E_SENS("free_heap", "Free Heap", 0),
    E_SENS("loop_time", "Loop Time", 0),
    E_BIN("distilling_status", "Distilling Status"),
    E_BIN("heating_status", "Heating Status"),
    E_BIN("alarm_status", "Alarm Status"),
    E_TEXT("status_message", "Status Message", "unknown"),
    E_TEXT("diagnostic_message", "Diagnostic Message", "Booting..."),
    E_TEXT("reset_reason", "Reset Reason", "unknown"),
    E_TEXT("ip_address", "IP Address", ""),
    E_BTN("refresh_ui", "Refresh UI"),
    E_BTN("restart_process", "Restart Process"),
};

struct Subscriber {
  StateCallback cb;
  void *ctx;
};

Subscriber subscribers[kMaxCallbacks];
ButtonHook button_hook = nullptr;

size_t index_of(const Entity *e) { return static_cast<size_t>(e - entities); }

Entity *find_entity(const char *key) {
  if (key == nullptr) return nullptr;
  for (auto &e : entities) {
    if (strcasecmp(key, e.def.id) == 0 || strcasecmp(key, e.def.display) == 0) return &e;
  }
  return nullptr;
}

void nvs_key(size_t index, char *out, size_t cap) {
  snprintf(out, cap, "e%02u", (unsigned)index);
}

void notify(Entity *e) {
  char state[kTextCap];
  state_format(&e->def, state, sizeof(state));
  for (auto &sub : subscribers) {
    if (sub.cb != nullptr) sub.cb(e->def.id, state, sub.ctx);
  }
}

}  // namespace

esp_err_t state_init() {
  nvs_handle_t handle;
  esp_err_t err = nvs_open("moonshiner", NVS_READWRITE, &handle);
  if (err != ESP_OK) {
    ESP_LOGW(TAG, "nvs_open failed: %s", esp_err_to_name(err));
    return err;
  }
  for (size_t i = 0; i < sizeof(entities) / sizeof(entities[0]); i++) {
    Entity &e = entities[i];
    char key[8];
    nvs_key(i, key, sizeof(key));
    if (e.def.type == EntityType::Number && e.def.persistent) {
      // ESP-IDF 6 removed nvs_get_float; store the IEEE-754 bits as u32.
      uint32_t bits = 0;
      if (nvs_get_u32(handle, key, &bits) == ESP_OK) {
        float value;
        memcpy(&value, &bits, sizeof(value));
        if (value >= e.def.min && value <= e.def.max) e.num = value;
      }
    } else if (e.def.type == EntityType::Switch && e.def.persistent) {
      uint8_t value;
      if (nvs_get_u8(handle, key, &value) == ESP_OK) e.flag = value != 0;
    }
  }
  nvs_close(handle);
  return ESP_OK;
}

void state_subscribe(StateCallback cb, void *ctx) {
  for (auto &sub : subscribers) {
    if (sub.cb == nullptr) {
      sub.cb = cb;
      sub.ctx = ctx;
      return;
    }
  }
}

const EntityDef *state_find(const char *key) {
  Entity *e = find_entity(key);
  return e == nullptr ? nullptr : &e->def;
}

void state_sse_id(const EntityDef *entity, char *out, size_t cap) {
  const char *prefix = "sensor";
  switch (entity->type) {
    case EntityType::Number: prefix = "number"; break;
    case EntityType::Switch: prefix = "switch"; break;
    case EntityType::BinarySensor: prefix = "binary_sensor"; break;
    case EntityType::TextSensor: prefix = "text_sensor"; break;
    case EntityType::Button: prefix = "button"; break;
    case EntityType::Sensor: prefix = "sensor"; break;
  }
  snprintf(out, cap, "%s-%s", prefix, entity->id);
}

void state_format(const EntityDef *entity, char *out, size_t cap) {
  if (out == nullptr || cap == 0) return;
  Entity *e = const_cast<Entity *>(reinterpret_cast<const Entity *>(entity));
  switch (entity->type) {
    case EntityType::Number:
    case EntityType::Sensor:
      if (isnan(e->num)) out[0] = '\0';
      else snprintf(out, cap, "%.*f", entity->decimals, e->num);
      break;
    case EntityType::Switch:
    case EntityType::BinarySensor:
      snprintf(out, cap, "%s", e->flag ? "ON" : "OFF");
      break;
    case EntityType::TextSensor:
      snprintf(out, cap, "%s", e->text);
      break;
    case EntityType::Button:
      out[0] = '\0';
      break;
  }
}

float state_number(const char *id) {
  Entity *e = find_entity(id);
  return e == nullptr ? NAN : e->num;
}

void state_set_number(const char *id, float value) {
  Entity *e = find_entity(id);
  if (e == nullptr || e->def.type != EntityType::Number || isnan(value)) return;
  if (value < e->def.min) value = e->def.min;
  if (value > e->def.max) value = e->def.max;
  e->num = value;
  if (e->def.persistent) {
    nvs_handle_t handle;
    if (nvs_open("moonshiner", NVS_READWRITE, &handle) == ESP_OK) {
      char key[8];
      nvs_key(index_of(e), key, sizeof(key));
      uint32_t bits;
      memcpy(&bits, &value, sizeof(bits));
      nvs_set_u32(handle, key, bits);
      nvs_commit(handle);
      nvs_close(handle);
    }
  }
  notify(e);
}

bool state_switch(const char *id) {
  Entity *e = find_entity(id);
  return e != nullptr && e->flag;
}

void state_set_switch(const char *id, bool value) {
  Entity *e = find_entity(id);
  if (e == nullptr || e->def.type != EntityType::Switch) return;
  e->flag = value;
  if (e->def.persistent) {
    nvs_handle_t handle;
    if (nvs_open("moonshiner", NVS_READWRITE, &handle) == ESP_OK) {
      char key[8];
      nvs_key(index_of(e), key, sizeof(key));
      nvs_set_u8(handle, key, value ? 1 : 0);
      nvs_commit(handle);
      nvs_close(handle);
    }
  }
  notify(e);
}

bool state_binary(const char *id) {
  Entity *e = find_entity(id);
  return e != nullptr && e->flag;
}

void state_set_binary(const char *id, bool value) {
  Entity *e = find_entity(id);
  if (e == nullptr || e->def.type != EntityType::BinarySensor) return;
  e->flag = value;
  notify(e);
}

float state_sensor(const char *id) {
  Entity *e = find_entity(id);
  return e == nullptr ? NAN : e->num;
}

void state_set_sensor(const char *id, float value) {
  Entity *e = find_entity(id);
  if (e == nullptr || e->def.type != EntityType::Sensor) return;
  e->num = value;
  notify(e);
}

const char *state_text(const char *id) {
  Entity *e = find_entity(id);
  return e == nullptr ? "" : e->text;
}

void state_set_text(const char *id, const char *value) {
  Entity *e = find_entity(id);
  if (e == nullptr || e->def.type != EntityType::TextSensor || value == nullptr) return;
  strncpy(e->text, value, kTextCap - 1);
  e->text[kTextCap - 1] = '\0';
  notify(e);
}

void state_press_button(const char *id) {
  Entity *e = find_entity(id);
  if (e == nullptr || e->def.type != EntityType::Button) return;
  if (button_hook != nullptr) button_hook(e->def.id);
  notify(e);
}

void state_set_button_hook(ButtonHook hook) { button_hook = hook; }

void state_emit_all() {
  Entity *first = entities;
  for (size_t i = 0; i < sizeof(entities) / sizeof(entities[0]); i++) {
    notify(first + i);
  }
}

extern "C" const char *state_c_ip_address() { return state_text("ip_address"); }

extern "C" int state_c_sensors_valid() {
  return isfinite(state_sensor("column_temperature")) && isfinite(state_sensor("tank_temperature")) ? 1 : 0;
}
