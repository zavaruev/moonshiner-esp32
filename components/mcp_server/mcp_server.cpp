#include "mcp_server.h"

#include "esphome/core/application.h"
#include "esphome/core/helpers.h"
#include "esphome/core/log.h"
#include "esphome/components/json/json_util.h"

#include "esphome/components/binary_sensor/binary_sensor.h"
#include "esphome/components/button/button.h"
#include "esphome/components/number/number.h"
#include "esphome/components/sensor/sensor.h"
#include "esphome/components/switch/switch.h"
#include "esphome/components/text_sensor/text_sensor.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <functional>
#include <string>
#include <vector>

#ifdef USE_ESP32
#include <arpa/inet.h>
#include <cerrno>
#include <esp_heap_caps.h>
#include <esp_system.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#endif

namespace esphome {
namespace mcp_server {

static const char *const TAG = "mcp_server";

// ─── boot diagnostics (UDP to LAN collector) ────────────────────
// Probes run during App.setup() *before* WiFi has an IP (can_proceed()
// defaults to true, WiFi connects asynchronously), so every message is
// buffered and retried until the network is up.
#ifdef USE_ESP32
static std::string g_pending;

// Boot-phase telemetry, readable via GET /diag even if App.setup() stalls:
//   phases bits: 1=probe P248, 2=probe P199, 4=probe P099, 8=loop ran, 16=our setup
static volatile uint32_t g_phases = 0;
static volatile int g_httpd_err = 0;
static volatile uint32_t g_dbg_calls = 0;
static volatile int g_last_send_errno = 0;
static volatile uint32_t g_send_fails = 0;

static bool udp_send(const std::string &msg) {
  static const char *const TARGETS[] = {"192.168.22.102", "192.168.22.249"};
  bool any = false;
  for (const char *target : TARGETS) {
    int fd = ::socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (fd < 0) {
      g_last_send_errno = errno;
      g_send_fails++;
      continue;
    }
    struct sockaddr_in dst {};
    dst.sin_family = AF_INET;
    dst.sin_port = htons(9001);
    inet_pton(AF_INET, target, &dst.sin_addr);
    ssize_t sent = ::sendto(fd, msg.data(), msg.size(), 0, (struct sockaddr *) &dst, sizeof(dst));
    if (sent < 0) {
      g_last_send_errno = errno;
      g_send_fails++;
    }
    ::close(fd);
    if (sent == (ssize_t) msg.size())
      any = true;
  }
  return any;
}

/// Send the first buffered line; return true when it went out.
static bool flush_one() {
  if (g_pending.empty())
    return false;
  size_t nl = g_pending.find('\n');
  std::string first = g_pending.substr(0, nl);
  if (!udp_send(first))
    return false;
  g_pending = (nl == std::string::npos) ? "" : g_pending.substr(nl + 1);
  return true;
}

/// '1' if some socket is already bound to INADDR_ANY:port (i.e. service up).
static char port_bound(uint16_t port) {
  int fd = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (fd < 0)
    return '?';
  struct sockaddr_in a {};
  a.sin_family = AF_INET;
  a.sin_port = htons(port);
  a.sin_addr.s_addr = htonl(INADDR_ANY);
  bool bound = ::bind(fd, (struct sockaddr *) &a, sizeof(a)) != 0;
  ::close(fd);
  return bound ? '1' : '0';
}

static std::string diag_line(const char *prefix) {
  char buf[176];
  snprintf(buf, sizeof(buf), "%s t=%u heap=%u maxblk=%u p80=%c p6053=%c p8080=%c", prefix, (unsigned) millis(),
           (unsigned) heap_caps_get_free_size(MALLOC_CAP_8BIT),
           (unsigned) heap_caps_get_largest_free_block(MALLOC_CAP_8BIT), port_bound(80), port_bound(6053),
           port_bound(8080));
  return std::string(buf);
}
#endif

void debug_send(const char *msg) {
#ifdef USE_ESP32
  g_dbg_calls++;
  if (strstr(msg, "P248") != nullptr)
    g_phases |= 1;
  else if (strstr(msg, "P199") != nullptr)
    g_phases |= 2;
  else if (strstr(msg, "P099") != nullptr)
    g_phases |= 4;
  else if (strstr(msg, "LOOP") != nullptr)
    g_phases |= 8;
  else
    g_phases |= 16;
  std::string line = diag_line(msg);
  if (!g_pending.empty())
    g_pending += "\n";
  g_pending += line;
  // Best effort: try now (likely fails before WiFi has an IP);
  // MCPServer::loop() keeps retrying every 300ms until it goes out.
  while (flush_one()) {}
#endif
}
static const char *const SERVER_NAME = "moonshiner-esp32";
static const char *const SERVER_VERSION = "1.0.0";
static const char *const PROTOCOL_VERSION = "2025-06-18";
static const size_t MAX_BODY = 4096;

// ─── helpers ─────────────────────────────────────────────────────

static std::string serialize_doc(JsonDocument &doc, bool pretty) {
  size_t n = pretty ? measureJsonPretty(doc) : measureJson(doc);
  std::string out(n + 1, '\0');
  size_t written = pretty ? serializeJsonPretty(doc, &out[0], n + 1) : serializeJson(doc, &out[0], n + 1);
  out.resize(written);
  return out;
}

static std::string fmt_float(float v) {
  char buf[32];
  snprintf(buf, sizeof(buf), "%.6g", v);
  return buf;
}

static std::string state_string(float value, EntityBase *entity) {
  std::string out = fmt_float(value);
  StringRef unit = entity->get_unit_of_measurement_ref();
  if (unit.size() > 0) {
    out += ' ';
    out += unit.c_str();
  }
  return out;
}

static bool object_id_equals(EntityBase *entity, const std::string &id) {
  char buf[OBJECT_ID_MAX_LEN];
  size_t len = entity->write_object_id_to(buf, sizeof(buf));
  return len == id.size() && memcmp(buf, id.data(), len) == 0;
}

static sensor::Sensor *find_sensor(const std::string &id) {
  for (auto *obj : App.get_sensors())
    if (obj != nullptr && object_id_equals(obj, id))
      return obj;
  return nullptr;
}
static number::Number *find_number(const std::string &id) {
  for (auto *obj : App.get_numbers())
    if (obj != nullptr && object_id_equals(obj, id))
      return obj;
  return nullptr;
}
static switch_::Switch *find_switch(const std::string &id) {
  for (auto *obj : App.get_switches())
    if (obj != nullptr && object_id_equals(obj, id))
      return obj;
  return nullptr;
}
static button::Button *find_button(const std::string &id) {
  for (auto *obj : App.get_buttons())
    if (obj != nullptr && object_id_equals(obj, id))
      return obj;
  return nullptr;
}
static text_sensor::TextSensor *find_text_sensor(const std::string &id) {
  for (auto *obj : App.get_text_sensors())
    if (obj != nullptr && object_id_equals(obj, id))
      return obj;
  return nullptr;
}
static binary_sensor::BinarySensor *find_binary_sensor(const std::string &id) {
  for (auto *obj : App.get_binary_sensors())
    if (obj != nullptr && object_id_equals(obj, id))
      return obj;
  return nullptr;
}

// ─── tool tables (mirror mcp-moonshiner/src/index.ts) ────────────

struct NoArgTool {
  const char *name;
  const char *description;
};

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
    {"set_target_temp", "Set target column temperature (°C)", "target_column_temp", 0, 100, 0.1},
    {"set_delta", "Set hysteresis delta (°C)", "delta", 0, 5, 0.01},
    {"set_max_tank_temp", "Set max tank temperature (°C)", "max_tank_temp", 0, 100, 0.1},
    {"set_coef_otbora", "Set collection coefficient (0 = min, 1 = max)", "coef_otbora", 0, 1, 0.001},
    {"set_heater_power", "Set heater power (0–1023)", "heater_power", 0, 1023, 1},
    {"set_valve_high", "Set upper valve (0–1023)", "valve_high_setting", 0, 1023, 1},
    {"set_valve_low", "Set lower valve (0–1023)", "valve_low_setting", 0, 1023, 1},
    {"set_volume", "Set buzzer volume (0–100 %)", "buzzer_volume", 0, 100, 1},
};

static const ToggleTool TOGGLE_TOOLS[] = {
    {"toggle_reduction", "Enable/disable automatic reduction coefficient", "use_reduction_coefficient"},
    {"toggle_upper_valve_close", "Enable/disable upper valve closing on overheat", "disable_upper_valve_closing"},
};

// ─── tool implementations ───────────────────────────────────────

struct ToolResult {
  bool ok;
  std::string text;
};

static void put_sensor_value(JsonObject obj, const char *key, sensor::Sensor *s) {
  if (s != nullptr && s->has_state())
    obj[key] = s->state;
  else
    obj[key] = nullptr;
}

static void put_text_value(JsonObject obj, const char *key, text_sensor::TextSensor *t) {
  if (t != nullptr && t->has_state())
    obj[key] = t->state.c_str();
  else
    obj[key] = "unknown";
}

static void put_binary_value(JsonObject obj, const char *key, binary_sensor::BinarySensor *b) {
  obj[key] = (b != nullptr) && b->has_state() && b->get_state();
}

static ToolResult tool_read_temperatures() {
  auto *column = find_sensor("column_temperature");
  auto *tank = find_sensor("tank_temperature");
  if (column == nullptr || tank == nullptr)
    return {false, "Error: temperature sensors not found"};

  JsonDocument d;
  JsonObject root = d.to<JsonObject>();
  JsonObject col = root["column"].to<JsonObject>();
  JsonObject tnk = root["tank"].to<JsonObject>();
  put_sensor_value(col, "value", column);
  col["raw"] = column->has_state() ? state_string(column->state, column).c_str() : "unknown";
  put_sensor_value(tnk, "value", tank);
  tnk["raw"] = tank->has_state() ? state_string(tank->state, tank).c_str() : "unknown";
  return {true, serialize_doc(d, true)};
}

static ToolResult tool_get_status() {
  JsonDocument d;
  JsonObject root = d.to<JsonObject>();
  JsonObject temps = root["temperatures"].to<JsonObject>();

  put_sensor_value(temps, "column", find_sensor("column_temperature"));
  put_sensor_value(temps, "tank", find_sensor("tank_temperature"));
  put_sensor_value(root, "uptime_sec", find_sensor("uptime"));
  put_sensor_value(root, "wifi_signal_dbm", find_sensor("wifi_signal"));
  put_sensor_value(root, "free_heap_bytes", find_sensor("free_heap"));

  put_text_value(root, "status", find_text_sensor("status_message"));
  put_binary_value(root, "distilling", find_binary_sensor("distilling_status"));
  put_binary_value(root, "heating", find_binary_sensor("heating_status"));
  put_binary_value(root, "alarm", find_binary_sensor("alarm_status"));
  put_text_value(root, "reset_reason", find_text_sensor("reset_reason"));
  return {true, serialize_doc(d, true)};
}

static ToolResult tool_get_entity(JsonObject args) {
  std::string entity_id = args["entity_id"] | "";
  if (entity_id.empty())
    return {false, "Error: entity_id is required"};
  if (entity_id.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_") !=
      std::string::npos)
    return {false, "Error: Invalid entity ID: " + entity_id};

  std::string type = args["type"] | "sensor";

  if (type == "sensor") {
    auto *s = find_sensor(entity_id);
    if (s == nullptr)
      return {false, "Error: entity not found: " + entity_id};
    JsonDocument d;
    JsonObject root = d.to<JsonObject>();
    root["entity"] = entity_id.c_str();
    put_sensor_value(root, "value", s);
    root["raw"] = s->has_state() ? state_string(s->state, s).c_str() : "unknown";
    return {true, serialize_doc(d, true)};
  }
  if (type == "number") {
    auto *n = find_number(entity_id);
    if (n == nullptr)
      return {false, "Error: entity not found: " + entity_id};
    JsonDocument d;
    JsonObject root = d.to<JsonObject>();
    root["entity"] = entity_id.c_str();
    if (n->has_state()) {
      root["value"] = n->state;
      root["raw"] = state_string(n->state, n).c_str();
    } else {
      root["value"] = nullptr;
      root["raw"] = "unknown";
    }
    return {true, serialize_doc(d, true)};
  }
  if (type == "text_sensor") {
    auto *t = find_text_sensor(entity_id);
    if (t == nullptr)
      return {false, "Error: entity not found: " + entity_id};
    return {true, t->has_state() ? t->state : std::string("unknown")};
  }
  if (type == "binary_sensor") {
    auto *b = find_binary_sensor(entity_id);
    if (b == nullptr)
      return {false, "Error: entity not found: " + entity_id};
    bool on = b->has_state() && b->get_state();
    return {true, on ? std::string("true") : std::string("false")};
  }
  return {false, "Error: unsupported entity type: " + type};
}

static ToolResult tool_set(const SetTool &tool, JsonObject args) {
  float value = args["value"] | NAN;
  if (std::isnan(value))
    return {false, std::string("Error: value is required for ") + tool.name};
  if (value < tool.min || value > tool.max) {
    char buf[96];
    snprintf(buf, sizeof(buf), "Error: value out of range (%g–%g)", tool.min, tool.max);
    return {false, buf};
  }
  auto *num = find_number(tool.entity);
  if (num == nullptr)
    return {false, std::string("Error: entity not found: ") + tool.entity};
  auto call = num->make_call();
  call.set_value(value);
  call.perform();
  return {true, std::string("OK: ") + tool.entity + " → " + fmt_float(value)};
}

static ToolResult tool_toggle(const ToggleTool &tool, JsonObject args) {
  if (!args["state"].is<bool>())
    return {false, std::string("Error: state (true/false) is required for ") + tool.name};
  bool on = args["state"].as<bool>();
  auto *sw = find_switch(tool.entity);
  if (sw == nullptr)
    return {false, std::string("Error: entity not found: ") + tool.entity};
  if (on)
    sw->turn_on();
  else
    sw->turn_off();
  return {true, std::string("OK: ") + tool.entity + " → " + (on ? "ON" : "OFF")};
}

static ToolResult tool_restart_process() {
  auto *btn = find_button("restart_process");
  if (btn == nullptr)
    return {false, "Error: entity not found: restart_process"};
  btn->press();
  return {true, "OK: distillation process restarted"};
}

static ToolResult call_tool(const std::string &name, JsonObject args) {
  if (name == "read_temperatures")
    return tool_read_temperatures();
  if (name == "get_status")
    return tool_get_status();
  if (name == "get_entity")
    return tool_get_entity(args);
  if (name == "restart_process")
    return tool_restart_process();
  for (const auto &t : SET_TOOLS)
    if (name == t.name)
      return tool_set(t, args);
  for (const auto &t : TOGGLE_TOOLS)
    if (name == t.name)
      return tool_toggle(t, args);
  return {false, "Unknown tool: " + name};
}

// ─── tools/list ─────────────────────────────────────────────────

static void add_noarg_schema(JsonObject obj, const char *name, const char *description) {
  obj["name"] = name;
  obj["description"] = description;
  JsonObject schema = obj["inputSchema"].to<JsonObject>();
  schema["type"] = "object";
  schema["properties"].to<JsonObject>();
  schema["additionalProperties"] = false;
}

static void fill_tools(JsonObject result) {
  JsonArray tools = result["tools"].to<JsonArray>();

  // same registration order as the Node MCP server
  add_noarg_schema(tools.add<JsonObject>(), "read_temperatures",
                   "Read current column and tank temperatures");
  add_noarg_schema(tools.add<JsonObject>(), "get_status",
                   "Get full distillation status: temperatures, process state, alarms, uptime, WiFi, heap");

  {  // get_entity
    JsonObject obj = tools.add<JsonObject>();
    obj["name"] = "get_entity";
    obj["description"] =
        "Read state of any ESPHome entity by its ID (e.g. 'column_temperature', 'target_column_temp', "
        "'status_message')";
    JsonObject schema = obj["inputSchema"].to<JsonObject>();
    schema["type"] = "object";
    JsonObject props = schema["properties"].to<JsonObject>();

    JsonObject entity_id = props["entity_id"].to<JsonObject>();
    entity_id["type"] = "string";
    entity_id["pattern"] = "^[a-zA-Z0-9_]+$";
    entity_id["description"] = "Entity ID without type prefix, e.g. 'column_temperature'";

    JsonObject type = props["type"].to<JsonObject>();
    type["type"] = "string";
    JsonArray values = type["enum"].to<JsonArray>();
    values.add("sensor");
    values.add("number");
    values.add("text_sensor");
    values.add("binary_sensor");
    type["default"] = "sensor";
    type["description"] = "Entity type";

    JsonArray required = schema["required"].to<JsonArray>();
    required.add("entity_id");
    schema["additionalProperties"] = false;
  }

  for (const auto &t : SET_TOOLS) {
    JsonObject obj = tools.add<JsonObject>();
    obj["name"] = t.name;
    obj["description"] = t.description;
    JsonObject schema = obj["inputSchema"].to<JsonObject>();
    schema["type"] = "object";

    JsonObject value = schema["properties"].to<JsonObject>()["value"].to<JsonObject>();
    value["type"] = "number";
    value["minimum"] = t.min;
    value["maximum"] = t.max;
    char desc[96];
    snprintf(desc, sizeof(desc), "Value (%g–%g, step %g)", t.min, t.max, t.step);
    value["description"] = desc;

    JsonArray required = schema["required"].to<JsonArray>();
    required.add("value");
    schema["additionalProperties"] = false;
  }

  for (const auto &t : TOGGLE_TOOLS) {
    JsonObject obj = tools.add<JsonObject>();
    obj["name"] = t.name;
    obj["description"] = t.description;
    JsonObject schema = obj["inputSchema"].to<JsonObject>();
    schema["type"] = "object";

    JsonObject state = schema["properties"].to<JsonObject>()["state"].to<JsonObject>();
    state["type"] = "boolean";
    state["description"] = "true = on, false = off";

    JsonArray required = schema["required"].to<JsonArray>();
    required.add("state");
    schema["additionalProperties"] = false;
  }

  add_noarg_schema(tools.add<JsonObject>(), "restart_process",
                   "Restart the distillation process (resets process_finished flag, clears overheat)");
}

// ─── JSON-RPC envelopes ─────────────────────────────────────────

static std::string rpc_result(const JsonVariant &id, const std::function<void(JsonObject)> &fill) {
  JsonDocument doc;
  doc["jsonrpc"] = "2.0";
  if (!id.isNull())
    doc["id"] = id;
  else
    doc["id"] = nullptr;
  JsonObject result = doc["result"].to<JsonObject>();
  fill(result);
  return serialize_doc(doc, false);
}

static std::string rpc_error(const JsonVariant &id, int code, const char *message) {
  JsonDocument doc;
  doc["jsonrpc"] = "2.0";
  if (!id.isNull())
    doc["id"] = id;
  else
    doc["id"] = nullptr;
  doc["error"]["code"] = code;
  doc["error"]["message"] = message;
  return serialize_doc(doc, false);
}

// ─── JSON-RPC dispatch ──────────────────────────────────────────

static std::string process_message(JsonObject msg) {
  JsonVariant id = msg["id"];
  bool has_id = !id.isNull();
  std::string method = msg["method"] | "";

  if (method.empty())
    return has_id ? rpc_error(id, -32600, "Invalid Request") : "";

  // notifications never get a response (HTTP 202 upstream)
  if (method.rfind("notifications/", 0) == 0)
    return "";

  if (method == "initialize") {
    return rpc_result(id, [&msg](JsonObject result) {
      std::string client_version = msg["params"]["protocolVersion"] | PROTOCOL_VERSION;
      result["protocolVersion"] = client_version.c_str();
      result["capabilities"]["tools"]["listChanged"] = false;
      result["serverInfo"]["name"] = SERVER_NAME;
      result["serverInfo"]["version"] = SERVER_VERSION;
    });
  }

  if (method == "ping")
    return rpc_result(id, [](JsonObject result) {});

  if (method == "tools/list")
    return rpc_result(id, [](JsonObject result) { fill_tools(result); });

  if (method == "tools/call") {
    std::string name = msg["params"]["name"] | "";
    JsonObject args = msg["params"]["arguments"].as<JsonObject>();
    ToolResult r = call_tool(name, args);
    ESP_LOGD(TAG, "tools/call %s -> %s", name.c_str(), r.ok ? "ok" : "error");
    return rpc_result(id, [&r](JsonObject result) {
      JsonArray content = result["content"].to<JsonArray>();
      JsonObject item = content.add<JsonObject>();
      item["type"] = "text";
      item["text"] = r.text.c_str();
      if (!r.ok)
        result["isError"] = true;
    });
  }

  return has_id ? rpc_error(id, -32601, "Method not found") : "";
}

std::string MCPServer::handle_rpc(const std::string &body) {
  JsonDocument doc = json::parse_json(body);
  if (doc.isNull()) {
    ESP_LOGW(TAG, "JSON parse error (%u bytes)", (unsigned) body.size());
    return rpc_error(JsonVariant(), -32700, "Parse error");
  }

  if (doc.is<JsonArray>()) {  // JSON-RPC batch
    std::string out = "[";
    bool first = true;
    for (JsonVariant item : doc.as<JsonArray>()) {
      if (!item.is<JsonObject>())
        continue;
      std::string one = process_message(item.as<JsonObject>());
      if (one.empty())
        continue;
      if (!first)
        out += ',';
      out += one;
      first = false;
    }
    if (first)
      return "";
    out += ']';
    return out;
  }

  if (!doc.is<JsonObject>())
    return rpc_error(JsonVariant(), -32600, "Invalid Request");

  return process_message(doc.as<JsonObject>());
}

// ─── HTTP transport ─────────────────────────────────────────────

#ifdef USE_ESP32

static esp_err_t send_status(httpd_req_t *req, const char *status, const char *body) {
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  if (status != nullptr)
    httpd_resp_set_status(req, status);
  httpd_resp_set_type(req, "application/json");
  if (body == nullptr)
    return httpd_resp_send(req, "", 0);
  return httpd_resp_send(req, body, HTTPD_RESP_USE_STRLEN);
}

esp_err_t MCPServer::handle_post(httpd_req_t *req) {
  auto *self = static_cast<MCPServer *>(req->user_ctx);

  httpd_resp_set_hdr(req, "Access-Control-Allow-Headers",
                     "Content-Type, Authorization, Accept, Mcp-Session-Id, MCP-Protocol-Version");

  // bearer auth
  if (!self->api_key_.empty()) {
    char header[300];
    bool ok = false;
    size_t len = httpd_req_get_hdr_value_len(req, "Authorization");
    if (len > 0 && len < sizeof(header)) {
      httpd_req_get_hdr_value_str(req, "Authorization", header, sizeof(header));
      std::string expected = "Bearer " + self->api_key_;
      ok = strcmp(header, expected.c_str()) == 0;
    }
    if (!ok) {
      httpd_resp_set_hdr(req, "WWW-Authenticate", "Bearer");
      ESP_LOGW(TAG, "rejected unauthenticated request");
      return send_status(req, "401 Unauthorized", "{\"error\":\"unauthorized\"}");
    }
  }

  if (req->content_len == 0 || req->content_len > (ssize_t) MAX_BODY) {
    ESP_LOGW(TAG, "bad request body length %d", (int) req->content_len);
    return send_status(req, "400 Bad Request", "{\"error\":\"bad body length\"}");
  }

  std::string body;
  body.resize(req->content_len);
  size_t offset = 0;
  while (offset < (size_t) req->content_len) {
    int ret = httpd_req_recv(req, &body[offset], req->content_len - offset);
    if (ret <= 0) {
      if (ret == HTTPD_SOCK_ERR_TIMEOUT)
        continue;
      return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "receive failed");
    }
    offset += ret;
  }

  std::string response = self->handle_rpc(body);
  if (response.empty())  // notification-only payload
    return send_status(req, "202 Accepted", "");
  return send_status(req, nullptr, response.c_str());
}

esp_err_t MCPServer::handle_get(httpd_req_t *req) {
  // stateless server - no SSE stream; per spec answer 405 with Allow
  httpd_resp_set_hdr(req, "Allow", "POST");
  return send_status(req, "405 Method Not Allowed", "{\"error\":\"SSE stream not supported\"}");
}

esp_err_t MCPServer::handle_options(httpd_req_t *req) {
  httpd_resp_set_hdr(req, "Access-Control-Allow-Headers",
                     "Content-Type, Authorization, Accept, Mcp-Session-Id, MCP-Protocol-Version");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  return send_status(req, "204 No Content", "");
}

esp_err_t MCPServer::handle_diag(httpd_req_t *req) {
  // Temporary unauthenticated boot-diagnostics endpoint (TODO: remove).
  // phases bits: 1=P248 2=P199 4=P099 8=App.loop ran 16=our setup()
  char stats[200];
  snprintf(stats, sizeof(stats), "%s", diag_line("").c_str());
  char body[512];
  snprintf(body, sizeof(body),
           "{\"httpd_err\":%d,\"phases\":%u,\"dbg_calls\":%u,\"send_fails\":%u,\"send_errno\":%d,"
           "\"uptime_ms\":%u,\"stats\":\"%s\"}",
           g_httpd_err, (unsigned) g_phases, (unsigned) g_dbg_calls, (unsigned) g_send_fails, g_last_send_errno,
           (unsigned) millis(), stats);
  return send_status(req, nullptr, body);
}

#endif  // USE_ESP32

// ─── component ──────────────────────────────────────────────────

void MCPServer::setup() {
#ifdef USE_ESP32
  g_phases |= 16;
  if (!g_pending.empty())
    g_pending += "\n";
  g_pending += diag_line("S210-enter");

  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = this->port_;
  // web_server's httpd instance (priority 249) binds the default UDP ctrl
  // port 32768 first; a second bind there fails with ESP_FAIL. Use a unique
  // ctrl port derived from our server port.
  config.ctrl_port = this->port_ + 1000;
  config.stack_size = 8192;
  config.max_open_sockets = 4;
  config.max_uri_handlers = 6;
  config.lru_purge_enable = true;
  config.recv_wait_timeout = 10;
  config.send_wait_timeout = 10;

  esp_err_t err = httpd_start(&this->server_, &config);
  g_httpd_err = (int) err;
  g_pending += "\n";
  g_pending += diag_line(err == ESP_OK ? "S210-httpd=OK" : "S210-httpd=FAIL");
  if (err != ESP_OK) {
    char b[96];
    snprintf(b, sizeof(b), "\nS210-err=%s(%d)", esp_err_to_name(err), (int) err);
    g_pending += b;
    this->server_ = nullptr;
    return;
  }

  httpd_uri_t uri{};
  uri.uri = "/mcp";
  uri.user_ctx = this;

  uri.method = HTTP_POST;
  uri.handler = &MCPServer::handle_post;
  httpd_register_uri_handler(this->server_, &uri);

  uri.method = HTTP_GET;
  uri.handler = &MCPServer::handle_get;
  httpd_register_uri_handler(this->server_, &uri);

  uri.method = HTTP_OPTIONS;
  uri.handler = &MCPServer::handle_options;
  httpd_register_uri_handler(this->server_, &uri);

  uri.method = HTTP_GET;
  uri.uri = "/diag";
  uri.handler = &MCPServer::handle_diag;
  httpd_register_uri_handler(this->server_, &uri);

  ESP_LOGI(TAG, "MCP endpoint listening on http://<device-ip>:%u/mcp (%s)", this->port_,
           this->api_key_.empty() ? "NO AUTH - anyone on the LAN can control outputs!" : "bearer token required");
#else
  ESP_LOGE(TAG, "mcp_server requires ESP32");
#endif
}

void MCPServer::loop() {
#ifdef USE_ESP32
  if (!this->loop_sent_) {
    this->loop_sent_ = true;
    g_phases |= 8;
    if (!g_pending.empty())
      g_pending += "\n";
    g_pending += diag_line("LOOP");
  }
  uint32_t now = millis();
  if (now - this->last_flush_ >= 300) {
    this->last_flush_ = now;
    while (flush_one()) {}
  }
#endif
}

void MCPServer::dump_config() {
  ESP_LOGCONFIG(TAG, "MCP Server:");
  ESP_LOGCONFIG(TAG, "  Port: %u", this->port_);
  ESP_LOGCONFIG(TAG, "  Auth: %s", this->api_key_.empty() ? "NONE" : "Bearer token");
}

}  // namespace mcp_server
}  // namespace esphome
