#include "mcp_server.h"

#include <ArduinoJson.h>
#include <esp_http_server.h>
#include <esp_log.h>
#include <esp_system.h>
#include <esp_timer.h>
#include <cmath>
#include <functional>
#include <stdio.h>
#include <string.h>
#include <string>

#include "boot_diag.h"
#include "credentials.h"
#include "state.h"

namespace {

constexpr char TAG[] = "mcp";
constexpr char SERVER_NAME[] = "moonshiner-mcp";
constexpr char SERVER_VERSION[] = "1.0.0";
constexpr char PROTOCOL_VERSION[] = "2025-06-18";
constexpr size_t MAX_BODY = 4096;
constexpr uint16_t MCP_PORT = 8080;
constexpr uint16_t MCP_CTRL_PORT = MCP_PORT + 1000;

struct SetTool {
  const char *name;
  const char *description;
  const char *entity;
  float min;
  float max;
  float step;
};

struct ToggleTool {
  const char *name;
  const char *description;
  const char *entity;
};

static const SetTool SET_TOOLS[] = {
    {"set_target_temp", "Set target column temperature (°C)", "target_column_temp", 0, 100, 0.1f},
    {"set_delta", "Set hysteresis delta (°C)", "delta", 0, 5, 0.01f},
    {"set_max_tank_temp", "Set max tank temperature (°C)", "max_tank_temp", 0, 100, 0.1f},
    {"set_coef_otbora", "Set collection coefficient (0 = min, 1 = max)", "coef_otbora", 0, 1, 0.001f},
    // The YAML number is 0..2750 W; the old firmware's 0..1023 schema was wrong.
    {"set_heater_power", "Set heater power (0–2750 W)", "heat_power", 0, 2750, 10},
    {"set_valve_high", "Set upper valve (0–1023)", "valve_high_setting", 0, 1023, 1},
    {"set_valve_low", "Set lower valve (0–1023)", "valve_low_setting", 0, 1023, 1},
    {"set_volume", "Set buzzer volume (0–100 %)", "buzzer_volume", 0, 100, 1},
};

static const ToggleTool TOGGLE_TOOLS[] = {
    {"toggle_reduction", "Enable/disable automatic reduction coefficient", "use_reduction_coefficient"},
    {"toggle_upper_valve_close", "Enable/disable upper valve closing on overheat", "disable_upper_valve_closing"},
};

struct ToolResult {
  bool ok;
  std::string text;
};

std::string serialize(JsonDocument &doc, bool pretty = false) {
  std::string out;
  if (pretty) serializeJsonPretty(doc, out);
  else serializeJson(doc, out);
  return out;
}

std::string fmt_float(float value) {
  char buf[32];
  snprintf(buf, sizeof(buf), "%g", value);
  return buf;
}

ToolResult tool_read_temperatures() {
  JsonDocument doc;
  JsonObject root = doc.to<JsonObject>();
  const char *names[2] = {"column_temperature", "tank_temperature"};
  const char *keys[2] = {"column", "tank"};
  for (int i = 0; i < 2; i++) {
    float value = state_sensor(names[i]);
    JsonObject item = root[keys[i]].to<JsonObject>();
    if (std::isfinite(value)) item["value"] = value;
    else item["value"] = nullptr;
    char formatted[32];
    state_format(state_find(names[i]), formatted, sizeof(formatted));
    item["raw"] = formatted[0] == '\0' ? "unknown" : formatted;
  }
  return {true, serialize(doc, true)};
}

ToolResult tool_get_status() {
  JsonDocument doc;
  JsonObject root = doc.to<JsonObject>();
  JsonObject temps = root["temperatures"].to<JsonObject>();
  float column = state_sensor("column_temperature");
  float tank = state_sensor("tank_temperature");
  if (std::isfinite(column)) temps["column"] = column; else temps["column"] = nullptr;
  if (std::isfinite(tank)) temps["tank"] = tank; else temps["tank"] = nullptr;
  float uptime = state_sensor("uptime");
  if (std::isfinite(uptime)) root["uptime_sec"] = uptime; else root["uptime_sec"] = nullptr;
  float rssi = state_sensor("wifi_signal");
  if (std::isfinite(rssi)) root["wifi_signal_dbm"] = rssi; else root["wifi_signal_dbm"] = nullptr;
  float heap = state_sensor("free_heap");
  if (std::isfinite(heap)) root["free_heap_bytes"] = heap; else root["free_heap_bytes"] = nullptr;
  root["status"] = state_text("status_message");
  root["distilling"] = state_binary("distilling_status");
  root["heating"] = state_binary("heating_status");
  root["alarm"] = state_binary("alarm_status");
  root["reset_reason"] = state_text("reset_reason");
  return {true, serialize(doc, true)};
}

ToolResult tool_get_entity(JsonObject args) {
  std::string id = args["entity_id"] | "";
  if (id.empty()) return {false, "Error: entity_id is required"};
  if (id.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_") != std::string::npos)
    return {false, "Error: Invalid entity ID: " + id};
  const EntityDef *def = state_find(id.c_str());
  if (def == nullptr) return {false, "Error: entity not found: " + id};

  JsonDocument doc;
  JsonObject root = doc.to<JsonObject>();
  root["entity"] = id.c_str();
  char formatted[256];
  state_format(def, formatted, sizeof(formatted));
  if (def->type == EntityType::Number || def->type == EntityType::Sensor) {
    float value = state_sensor(id.c_str());
    if (std::isfinite(value)) root["value"] = value; else root["value"] = nullptr;
    root["raw"] = formatted;
  } else if (def->type == EntityType::TextSensor) {
    root["state"] = formatted;
  } else if (def->type == EntityType::Switch || def->type == EntityType::BinarySensor) {
    root["state"] = state_binary(id.c_str()) ? "ON" : "OFF";
  } else {
    return {false, "Error: unsupported entity type: " + id};
  }
  return {true, serialize(doc, true)};
}

ToolResult call_tool(const std::string &name, JsonObject args) {
  if (name == "read_temperatures") return tool_read_temperatures();
  if (name == "get_status") return tool_get_status();
  if (name == "get_entity") return tool_get_entity(args);
  if (name == "restart_process") {
    state_press_button("restart_process");
    return {true, "OK: distillation process restarted"};
  }
  for (const auto &tool : SET_TOOLS) {
    if (name != tool.name) continue;
    if (!args["value"].is<float>() && !args["value"].is<int>())
      return {false, std::string("Error: value is required for ") + tool.name};
    float value = args["value"] | 0.0f;
    if (value < tool.min || value > tool.max) {
      char buf[96];
      snprintf(buf, sizeof(buf), "Error: value out of range (%g–%g)", tool.min, tool.max);
      return {false, buf};
    }
    state_set_number(tool.entity, value);
    return {true, std::string("OK: ") + tool.entity + " -> " + fmt_float(value)};
  }
  for (const auto &tool : TOGGLE_TOOLS) {
    if (name != tool.name) continue;
    if (!args["state"].is<bool>())
      return {false, std::string("Error: state (true/false) is required for ") + tool.name};
    bool on = args["state"] | false;
    state_set_switch(tool.entity, on);
    return {true, std::string("OK: ") + tool.entity + " -> " + (on ? "ON" : "OFF")};
  }
  return {false, "Unknown tool: " + name};
}

void add_noarg_schema(JsonObject obj, const char *name, const char *description) {
  obj["name"] = name;
  obj["description"] = description;
  JsonObject schema = obj["inputSchema"].to<JsonObject>();
  schema["type"] = "object";
  schema["properties"].to<JsonObject>();
  schema["additionalProperties"] = false;
}

void fill_tools(JsonObject result) {
  JsonArray tools = result["tools"].to<JsonArray>();
  add_noarg_schema(tools.add<JsonObject>(), "read_temperatures", "Read current column and tank temperatures");
  add_noarg_schema(tools.add<JsonObject>(), "get_status",
                   "Get full distillation status: temperatures, process state, alarms, uptime, WiFi, heap");

  JsonObject entity = tools.add<JsonObject>();
  entity["name"] = "get_entity";
  entity["description"] =
      "Read state of any entity by its ID (e.g. 'column_temperature', 'target_column_temp', 'status_message')";
  JsonObject schema = entity["inputSchema"].to<JsonObject>();
  schema["type"] = "object";
  JsonObject props = schema["properties"].to<JsonObject>();
  JsonObject id_prop = props["entity_id"].to<JsonObject>();
  id_prop["type"] = "string";
  id_prop["pattern"] = "^[a-zA-Z0-9_]+$";
  id_prop["description"] = "Entity ID without type prefix, e.g. 'column_temperature'";
  JsonObject type_prop = props["type"].to<JsonObject>();
  type_prop["type"] = "string";
  JsonArray values = type_prop["enum"].to<JsonArray>();
  values.add("sensor");
  values.add("number");
  values.add("text_sensor");
  values.add("binary_sensor");
  type_prop["default"] = "sensor";
  type_prop["description"] = "Entity type";
  JsonArray required = schema["required"].to<JsonArray>();
  required.add("entity_id");
  schema["additionalProperties"] = false;

  for (const auto &tool : SET_TOOLS) {
    JsonObject obj = tools.add<JsonObject>();
    obj["name"] = tool.name;
    obj["description"] = tool.description;
    JsonObject s = obj["inputSchema"].to<JsonObject>();
    s["type"] = "object";
    JsonObject value = s["properties"].to<JsonObject>()["value"].to<JsonObject>();
    value["type"] = "number";
    value["minimum"] = tool.min;
    value["maximum"] = tool.max;
    char desc[96];
    snprintf(desc, sizeof(desc), "Value (%g–%g, step %g)", tool.min, tool.max, tool.step);
    value["description"] = desc;
    JsonArray req = s["required"].to<JsonArray>();
    req.add("value");
    s["additionalProperties"] = false;
  }

  for (const auto &tool : TOGGLE_TOOLS) {
    JsonObject obj = tools.add<JsonObject>();
    obj["name"] = tool.name;
    obj["description"] = tool.description;
    JsonObject s = obj["inputSchema"].to<JsonObject>();
    s["type"] = "object";
    JsonObject state_prop = s["properties"].to<JsonObject>()["state"].to<JsonObject>();
    state_prop["type"] = "boolean";
    state_prop["description"] = "true = on, false = off";
    JsonArray req = s["required"].to<JsonArray>();
    req.add("state");
    s["additionalProperties"] = false;
  }

  add_noarg_schema(tools.add<JsonObject>(), "restart_process",
                   "Restart the distillation process (resets process_finished flag, clears overheat)");
}

std::string rpc_result(const JsonVariant &id, std::function<void(JsonObject)> fill) {
  JsonDocument doc;
  doc["jsonrpc"] = "2.0";
  if (id.isNull()) doc["id"] = nullptr;
  else doc["id"] = id;
  JsonObject result = doc["result"].to<JsonObject>();
  fill(result);
  return serialize(doc);
}

std::string rpc_error(const JsonVariant &id, int code, const char *message) {
  JsonDocument doc;
  doc["jsonrpc"] = "2.0";
  if (id.isNull()) doc["id"] = nullptr;
  else doc["id"] = id;
  doc["error"]["code"] = code;
  doc["error"]["message"] = message;
  return serialize(doc);
}

std::string process_message(JsonObject msg) {
  JsonVariant id = msg["id"];
  bool has_id = !id.isNull();
  std::string method = msg["method"] | "";
  if (method.empty()) return has_id ? rpc_error(id, -32600, "Invalid Request") : "";
  if (method.rfind("notifications/", 0) == 0) return "";  // HTTP 202 upstream

  if (method == "initialize") {
    return rpc_result(id, [&msg](JsonObject result) {
      std::string client_version = msg["params"]["protocolVersion"] | PROTOCOL_VERSION;
      result["protocolVersion"] = client_version.c_str();
      result["capabilities"]["tools"]["listChanged"] = false;
      result["serverInfo"]["name"] = SERVER_NAME;
      result["serverInfo"]["version"] = SERVER_VERSION;
    });
  }
  if (method == "ping") return rpc_result(id, [](JsonObject) {});
  if (method == "tools/list") return rpc_result(id, [](JsonObject result) { fill_tools(result); });
  if (method == "tools/call") {
    std::string name = msg["params"]["name"] | "";
    JsonObject args = msg["params"]["arguments"].as<JsonObject>();
    ToolResult r = call_tool(name, args);
    return rpc_result(id, [&r](JsonObject result) {
      JsonArray content = result["content"].to<JsonArray>();
      JsonObject item = content.add<JsonObject>();
      item["type"] = "text";
      item["text"] = r.text.c_str();
      if (!r.ok) result["isError"] = true;
    });
  }
  return has_id ? rpc_error(id, -32601, "Method not found") : "";
}

std::string handle_rpc(const std::string &body) {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err != DeserializationError::Ok) {
    ESP_LOGW(TAG, "JSON parse error (%u bytes)", (unsigned)body.size());
    return rpc_error(JsonVariant(), -32700, "Parse error");
  }
  if (doc.is<JsonArray>()) {
    std::string out = "[";
    bool first = true;
    for (JsonVariant item : doc.as<JsonArray>()) {
      if (!item.is<JsonObject>()) continue;
      std::string one = process_message(item.as<JsonObject>());
      if (one.empty()) continue;
      if (!first) out += ',';
      out += one;
      first = false;
    }
    if (first) return "";
    return out + "]";
  }
  if (!doc.is<JsonObject>()) return rpc_error(JsonVariant(), -32600, "Invalid Request");
  return process_message(doc.as<JsonObject>());
}

esp_err_t send_status(httpd_req_t *req, const char *status, const char *body) {
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  if (status != nullptr) httpd_resp_set_status(req, status);
  httpd_resp_set_type(req, "application/json");
  if (body == nullptr) return httpd_resp_send(req, "", 0);
  return httpd_resp_send(req, body, HTTPD_RESP_USE_STRLEN);
}

esp_err_t handle_post(httpd_req_t *req) {
  char header[300];
  bool ok = false;
  size_t len = httpd_req_get_hdr_value_len(req, "Authorization");
  std::string expected = std::string("Bearer ") + MS_MCP_API_KEY;
  if (len > 0 && len < sizeof(header)) {
    httpd_req_get_hdr_value_str(req, "Authorization", header, sizeof(header));
    ok = strcmp(header, expected.c_str()) == 0;
  }
  if (!ok) {
    httpd_resp_set_hdr(req, "WWW-Authenticate", "Bearer");
    return send_status(req, "401 Unauthorized", "{\"error\":\"unauthorized\"}");
  }
  if (req->content_len <= 0 || req->content_len > (ssize_t)MAX_BODY)
    return send_status(req, "400 Bad Request", "{\"error\":\"bad body length\"}");

  std::string body;
  body.resize((size_t)req->content_len);
  size_t offset = 0;
  while (offset < body.size()) {
    int received = httpd_req_recv(req, &body[offset], body.size() - offset);
    if (received == HTTPD_SOCK_ERR_TIMEOUT) continue;
    if (received <= 0) return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "receive failed");
    offset += (size_t)received;
  }
  std::string response = handle_rpc(body);
  if (response.empty()) return send_status(req, "202 Accepted", "");
  return send_status(req, nullptr, response.c_str());
}

esp_err_t handle_get(httpd_req_t *req) {
  httpd_resp_set_hdr(req, "Allow", "POST");
  return send_status(req, "405 Method Not Allowed", "{\"error\":\"SSE stream not supported\"}");
}

esp_err_t handle_options(httpd_req_t *req) {
  httpd_resp_set_hdr(req, "Access-Control-Allow-Headers",
                     "Content-Type, Authorization, Accept, Mcp-Session-Id, MCP-Protocol-Version");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  return send_status(req, "204 No Content", "");
}

esp_err_t handle_diag(httpd_req_t *req) {
  // 1024 panic bytes, with CR/LF/quotes escaped, plus the fixed JSON fields.
  static char escaped[2100];
  const char *panic = boot_diag_panic_text();
  size_t at = 0;
  for (const char *p = panic; *p != '\0' && at + 8 < sizeof(escaped); ++p) {
    char c = *p;
    if (c == '\r' || c == '\n') {
      escaped[at++] = '|';
    } else if (c == '"' || c == '\\') {
      escaped[at++] = '\\';
      escaped[at++] = c;
    } else if (c >= 0x20 && c < 0x7f) {
      escaped[at++] = c;
    }
  }
  escaped[at] = '\0';

  char body[2700];
  snprintf(body, sizeof(body),
           "{\"httpd_err\":0,\"phases\":31,\"uptime_ms\":%u,\"heap\":%u,\"port\":8080,"
           "\"boot\":%u,\"reason\":\"%s\",\"reason_code\":%u,"
           "\"previous_reason\":\"%s\",\"panic\":\"%s\"}",
           (unsigned)(esp_timer_get_time() / 1000), (unsigned)esp_get_free_heap_size(),
           (unsigned)boot_diag_count(), boot_diag_reason_name(boot_diag_current_reason()),
           (unsigned)boot_diag_current_reason(),
           boot_diag_reason_name(boot_diag_previous_reason()), escaped);
  return send_status(req, nullptr, body);
}

}  // namespace

esp_err_t mcp_start() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = MCP_PORT;
  config.ctrl_port = MCP_CTRL_PORT;  // web_server uses 32768; never share it
  config.stack_size = 8192;
  config.max_open_sockets = 4;
  config.max_uri_handlers = 6;
  config.lru_purge_enable = true;  // reclaim stale SSE/session sockets
  config.recv_wait_timeout = 10;
  config.send_wait_timeout = 10;

  httpd_handle_t server = nullptr;
  esp_err_t err = httpd_start(&server, &config);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "httpd_start failed: %s", esp_err_to_name(err));
    return err;
  }
  static httpd_uri_t post{};
  post.uri = "/mcp"; post.method = HTTP_POST; post.handler = handle_post;
  static httpd_uri_t get{};
  get.uri = "/mcp"; get.method = HTTP_GET; get.handler = handle_get;
  static httpd_uri_t options{};
  options.uri = "/mcp"; options.method = HTTP_OPTIONS; options.handler = handle_options;
  static httpd_uri_t diag{};
  diag.uri = "/diag"; diag.method = HTTP_GET; diag.handler = handle_diag;
  httpd_register_uri_handler(server, &post);
  httpd_register_uri_handler(server, &get);
  httpd_register_uri_handler(server, &options);
  httpd_register_uri_handler(server, &diag);
  ESP_LOGI(TAG, "MCP endpoint on :%u/mcp (bearer token required)", MCP_PORT);
  return ESP_OK;
}
