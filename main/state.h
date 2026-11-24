#ifndef MOONSHINER_STATE_H
#define MOONSHINER_STATE_H

#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

enum class EntityType : uint8_t { Number, Switch, Sensor, BinarySensor, TextSensor, Button };

struct EntityDef {
  const char *id;        // snake_case, MCP id
  const char *display;   // web_server v3 display name
  EntityType type;
  float initial;
  float min;
  float max;
  float step;
  uint8_t decimals;
  bool persistent;
};

using StateCallback = void (*)(const char *id, const char *state, void *ctx);

esp_err_t state_init();
void state_subscribe(StateCallback cb, void *ctx);

float state_number(const char *id);
void state_set_number(const char *id, float value);
bool state_switch(const char *id);
void state_set_switch(const char *id, bool value);
bool state_binary(const char *id);
void state_set_binary(const char *id, bool value);
float state_sensor(const char *id);
void state_set_sensor(const char *id, float value);
const char *state_text(const char *id);
void state_set_text(const char *id, const char *value);
void state_press_button(const char *id);
using ButtonHook = void (*)(const char *id);
void state_set_button_hook(ButtonHook hook);

// Lookup by snake_case id or by display name (case-insensitive).
const EntityDef *state_find(const char *key);
// "number-delta", "sensor-column_temperature", ... (the UI's canonical SSE id).
void state_sse_id(const EntityDef *entity, char *out, size_t cap);
// State string as the UI/MCP expect it: numeric for numbers/sensors,
// "ON"/"OFF" for switches and binary sensors, verbatim for text sensors.
void state_format(const EntityDef *entity, char *out, size_t cap);
// Send a state frame for every known entity (used when SSE connects).
void state_emit_all();

#endif  // MOONSHINER_STATE_H
