#include "web_server.h"

#include <errno.h>
#include <esp_http_server.h>
#include <esp_log.h>
#include <esp_timer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <freertos/task.h>
#include <lwip/sockets.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "actuators.h"
#include "credentials.h"
#include "display.h"
#include "ota.h"
#include "sensors.h"
#include "state.h"
#include "ui_assets.h"

namespace {

constexpr char TAG[] = "web";
constexpr int MAX_SSE_CLIENTS = 6;
constexpr size_t URI_CAP = 256;

struct SseClient {
  httpd_handle_t handle;
  int fd;
  bool active;
};

SseClient clients[MAX_SSE_CLIENTS];
SemaphoreHandle_t clients_mutex;
httpd_handle_t server;
char auth_header[256];

static const char *ROOT_HTML =
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\">"
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, "
    "maximum-scale=1, user-scalable=no\"></head>"
    "<body><script src=\"/ui.js\"></script></body></html>";

void base64(const char *in, char *out, size_t cap) {
  static const char table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  size_t len = strlen(in);
  size_t at = 0;
  for (size_t i = 0; i < len && at + 4 < cap; i += 3) {
    uint32_t v = (uint32_t)(unsigned char)in[i] << 16;
    if (i + 1 < len) v |= (uint32_t)(unsigned char)in[i + 1] << 8;
    if (i + 2 < len) v |= (uint32_t)(unsigned char)in[i + 2];
    out[at++] = table[(v >> 18) & 63];
    out[at++] = table[(v >> 12) & 63];
    out[at++] = i + 1 < len ? table[(v >> 6) & 63] : '=';
    out[at++] = i + 2 < len ? table[v & 63] : '=';
  }
  out[at] = '\0';
}

bool authorized(httpd_req_t *req) {
  char value[256];
  if (httpd_req_get_hdr_value_str(req, "Authorization", value, sizeof(value)) != ESP_OK) return false;
  return strcmp(value, auth_header) == 0;
}

esp_err_t deny(httpd_req_t *req) {
  httpd_resp_set_hdr(req, "WWW-Authenticate", "Basic realm=\"Moonshiner\"");
  return httpd_resp_send_err(req, HTTPD_401_UNAUTHORIZED, "Unauthorized");
}

void url_decode(char *text) {
  char *out = text;
  char *in = text;
  while (*in != '\0') {
    if (*in == '%' && in[1] != '\0' && in[2] != '\0') {
      auto hex = [](char c) -> int {
        if (c >= '0' && c <= '9') return c - '0';
        if (c >= 'a' && c <= 'f') return c - 'a' + 10;
        if (c >= 'A' && c <= 'F') return c - 'A' + 10;
        return -1;
      };
      int hi = hex(in[1]);
      int lo = hex(in[2]);
      if (hi >= 0 && lo >= 0) {
        *out++ = (char)((hi << 4) | lo);
        in += 3;
        continue;
      }
    }
    *out++ = *in++;
  }
  *out = '\0';
}

void json_escape(const char *text, char *out, size_t cap) {
  size_t at = 0;
  for (const char *p = text; *p != '\0' && at + 2 < cap; p++) {
    if (*p == '"' || *p == '\\') out[at++] = '\\';
    out[at++] = *p;
  }
  out[at] = '\0';
}

void send_all(const char *frame, size_t frame_len) {
  if (clients_mutex == nullptr) return;
  // httpd_resp_send_chunk() started a chunked response; later socket writes
  // bypass the httpd framing layer, so each frame must carry its own chunk
  // header/footer. sizeof(frame) here would be the pointer size (4), never
  // the frame length — the caller passes it explicitly.
  char chunked[512];
  int len = snprintf(chunked, sizeof(chunked), "%x\r\n%.*s\r\n", (unsigned)frame_len,
                     (int)frame_len, frame);
  xSemaphoreTake(clients_mutex, portMAX_DELAY);
  for (auto &client : clients) {
    if (!client.active) continue;
    // Never block the shared client mutex on a dead/stale SSE socket: a hung
    // send here stalls every state_set_* caller, including REST handlers.
    int sent = httpd_socket_send(client.handle, client.fd, chunked, (size_t)len, MSG_DONTWAIT);
    if (sent < 0 && errno != EAGAIN && errno != EWOULDBLOCK) client.active = false;
  }
  xSemaphoreGive(clients_mutex);
}

void on_state(const char *id, const char *state, void *ctx) {
  (void)ctx;
  const EntityDef *def = state_find(id);
  if (def == nullptr) return;
  char sse_id[80];
  state_sse_id(def, sse_id, sizeof(sse_id));
  const bool numeric = def->type == EntityType::Number || def->type == EntityType::Sensor;
  char safe[160];
  json_escape(state, safe, sizeof(safe));
  char frame[320];
  if (numeric) {
    snprintf(frame, sizeof(frame), "event: state\ndata: {\"id\":\"%s\",\"state\":%s}\n\n", sse_id,
             state[0] == '\0' ? "null" : state);
  } else {
    snprintf(frame, sizeof(frame), "event: state\ndata: {\"id\":\"%s\",\"state\":\"%s\"}\n\n", sse_id, safe);
  }
  send_all(frame, strlen(frame));
}

void free_client(void *ctx) {
  auto *client = static_cast<SseClient *>(ctx);
  if (client != nullptr) client->active = false;
}

esp_err_t handle_root(httpd_req_t *req) {
  if (!authorized(req)) return deny(req);
  httpd_resp_set_type(req, "text/html");
  return httpd_resp_send(req, ROOT_HTML, HTTPD_RESP_USE_STRLEN);
}

esp_err_t handle_ui(httpd_req_t *req) {
  if (!authorized(req)) return deny(req);
  char accept[128];
  bool gzip = httpd_req_get_hdr_value_str(req, "Accept-Encoding", accept, sizeof(accept)) == ESP_OK &&
              strstr(accept, "gzip") != nullptr;
  httpd_resp_set_type(req, "application/javascript");
  const char *data = nullptr;
  size_t len = 0;
  if (gzip) {
    httpd_resp_set_hdr(req, "Content-Encoding", "gzip");
    data = reinterpret_cast<const char *>(ui_js_gzip);
    len = ui_js_gzip_len;
  } else {
    data = reinterpret_cast<const char *>(ui_js_raw);
    len = ui_js_raw_len;
  }
  // Stream the 72 KB asset in small chunks: a single large blocking send()
  // can stall the httpd task once sockets/sessions have churned.
  for (size_t offset = 0; offset < len; offset += 4096) {
    size_t part = len - offset < 4096 ? len - offset : 4096;
    esp_err_t err = httpd_resp_send_chunk(req, data + offset, part);
    if (err != ESP_OK) return err;
  }
  return httpd_resp_send_chunk(req, nullptr, 0);
}

esp_err_t handle_events(httpd_req_t *req) {
  if (!authorized(req)) return deny(req);
  httpd_resp_set_status(req, HTTPD_200);
  httpd_resp_set_type(req, "text/event-stream");
  httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
  httpd_resp_set_hdr(req, "Connection", "keep-alive");
  httpd_resp_send_chunk(req, "\r\n", 2);

  SseClient *client = nullptr;
  xSemaphoreTake(clients_mutex, portMAX_DELAY);
  for (auto &slot : clients) {
    if (!slot.active) {
      slot.active = true;
      slot.handle = req->handle;
      slot.fd = httpd_req_to_sockfd(req);
      client = &slot;
      break;
    }
  }
  xSemaphoreGive(clients_mutex);

  if (client == nullptr) {
    ESP_LOGW(TAG, "too many SSE clients");
    httpd_resp_send_chunk(req, nullptr, 0);
    return ESP_OK;
  }
  req->sess_ctx = client;
  req->free_ctx = free_client;

  // Greet the new client with current values so a page load is never blank.
  state_emit_all();
  return ESP_OK;
}

bool split_path(const char *uri, char *domain, char *name, size_t cap) {
  if (uri == nullptr || uri[0] != '/') return false;
  const char *slash = strchr(uri + 1, '/');
  if (slash == nullptr) return false;
  size_t dlen = (size_t)(slash - (uri + 1));
  if (dlen == 0 || dlen >= cap) return false;
  memcpy(domain, uri + 1, dlen);
  domain[dlen] = '\0';
  const char *rest = slash + 1;
  // REST writes have a third segment (/set, /turn_on, /press); the entity
  // name must stop there or state_find() would look for "Delta/set".
  const char *next = strchr(rest, '/');
  size_t nlen = next != nullptr ? (size_t)(next - rest) : strlen(rest);
  if (nlen == 0 || nlen >= cap) return false;
  memcpy(name, rest, nlen);
  name[nlen] = '\0';
  url_decode(name);
  return true;
}

bool domain_matches(const char *domain, EntityType type) {
  if (strcmp(domain, "number") == 0) return type == EntityType::Number;
  if (strcmp(domain, "switch") == 0) return type == EntityType::Switch;
  if (strcmp(domain, "sensor") == 0) return type == EntityType::Sensor;
  if (strcmp(domain, "binary_sensor") == 0) return type == EntityType::BinarySensor;
  if (strcmp(domain, "text_sensor") == 0) return type == EntityType::TextSensor;
  if (strcmp(domain, "button") == 0) return type == EntityType::Button;
  return false;
}

esp_err_t handle_rest_get(httpd_req_t *req) {
  if (!authorized(req)) return deny(req);
  char uri[URI_CAP];
  char domain[64], name[URI_CAP];
  strncpy(uri, req->uri, sizeof(uri) - 1);
  uri[sizeof(uri) - 1] = '\0';
  // Some httpd versions leave the query string attached to req->uri.
  char *query_mark = strchr(uri, '?');
  if (query_mark != nullptr) *query_mark = '\0';
  if (!split_path(uri, domain, name, sizeof(name))) return httpd_resp_send_404(req);
  const EntityDef *def = state_find(name);
  if (def == nullptr || !domain_matches(domain, def->type)) return httpd_resp_send_404(req);

  char value[160];
  state_format(def, value, sizeof(value));
  char body[512];
  if (def->type == EntityType::Number || def->type == EntityType::Sensor) {
    snprintf(body, sizeof(body), "{\"value\":%s,\"state\":\"%s\"}",
             value[0] == '\0' ? "null" : value, value);
  } else if (def->type == EntityType::TextSensor) {
    snprintf(body, sizeof(body), "%s", value);
  } else if (def->type == EntityType::Switch || def->type == EntityType::BinarySensor) {
    snprintf(body, sizeof(body), "%s", value);
  } else {
    body[0] = '\0';
  }
  httpd_resp_set_type(req, "application/json");
  return httpd_resp_send(req, body, HTTPD_RESP_USE_STRLEN);
}

esp_err_t handle_rest_post(httpd_req_t *req) {
  if (!authorized(req)) return deny(req);
  char uri[URI_CAP];
  char domain[64], name[URI_CAP];
  strncpy(uri, req->uri, sizeof(uri) - 1);
  uri[sizeof(uri) - 1] = '\0';
  // Some httpd versions leave the query string attached to req->uri.
  char *query_mark = strchr(uri, '?');
  if (query_mark != nullptr) *query_mark = '\0';
  if (!split_path(uri, domain, name, sizeof(name))) return httpd_resp_send_404(req);
  const EntityDef *def = state_find(name);
  if (def == nullptr || !domain_matches(domain, def->type)) return httpd_resp_send_404(req);

  const char *tail = strrchr(uri, '/');
  if (tail == nullptr) return httpd_resp_send_404(req);
  const char *command = tail + 1;
  if (def->type == EntityType::Number && strcmp(command, "set") == 0) {
    char query[128];
    char raw[64];
    if (httpd_req_get_url_query_str(req, query, sizeof(query)) != ESP_OK ||
        httpd_query_key_value(query, "value", raw, sizeof(raw)) != ESP_OK) {
      return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "value required");
    }
    state_set_number(def->id, strtof(raw, nullptr));
  } else if (def->type == EntityType::Switch && strcmp(command, "turn_on") == 0) {
    state_set_switch(def->id, true);
  } else if (def->type == EntityType::Switch && strcmp(command, "turn_off") == 0) {
    state_set_switch(def->id, false);
  } else if (def->type == EntityType::Button && strcmp(command, "press") == 0) {
    state_press_button(def->id);
  } else {
    return httpd_resp_send_404(req);
  }
  return httpd_resp_send(req, "", 0);
}

constexpr int OTA_CHUNK_MAX = 8192;
constexpr int OTA_RECV_TIMEOUT_MAX = 3;

void delayed_reboot(void *arg) {
  (void)arg;
  // Give the HTTP reply time to leave before the socket disappears.
  vTaskDelay(pdMS_TO_TICKS(1500));
  esp_restart();
}

void schedule_reboot() {
  xTaskCreate(delayed_reboot, "reboot", 2048, nullptr, 1, nullptr);
}

esp_err_t ota_send_json(httpd_req_t *req, const char *json) {
  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Cache-Control", "no-store");
  return httpd_resp_send(req, json, HTTPD_RESP_USE_STRLEN);
}

esp_err_t ota_status_json(httpd_req_t *req) {
  ota_status_t status;
  ota_get_status(&status);
  char body[512];
  snprintf(body, sizeof(body),
           "{\"state\":%d,\"written\":%u,\"total\":%u,\"part\":%u,"
           "\"target\":%d,\"running\":%d,\"rollback\":%s,"
           "\"run_ver\":\"%s\",\"tgt_ver\":\"%s\",\"error\":\"%s\"}",
           (int)status.state, (unsigned)status.written, (unsigned)status.total,
           (unsigned)status.partition_size, status.target_slot, status.running_slot,
           status.rollback_armed ? "true" : "false", status.running_version,
           status.target_version, status.error);
  return ota_send_json(req, body);
}

esp_err_t handle_reboot_post(httpd_req_t *req) {
  if (!authorized(req)) return deny(req);
  esp_err_t result = ota_send_json(req, "{\"ok\":true}");
  schedule_reboot();
  return result;
}

esp_err_t handle_ota_get(httpd_req_t *req) {
  if (!authorized(req)) return deny(req);
  return ota_status_json(req);
}

esp_err_t handle_ota_post(httpd_req_t *req) {
  if (!authorized(req)) return deny(req);
  char query[128] = {0};
  if (httpd_req_get_url_query_len(req) < sizeof(query)) {
    httpd_req_get_url_query_str(req, query, sizeof(query));
  }
  if (strstr(query, "commit")) {
    esp_err_t result = ota_finish();
    // The new slot is marked to boot; restart automatically so an OTA no
    // longer needs a human to power-cycle the device.
    if (result == ESP_OK) schedule_reboot();
    return ota_status_json(req);
  }
  if (strstr(query, "abort")) {
    ota_abort();
    return ota_status_json(req);
  }
  const char *size_param = strstr(query, "size=");
  if (size_param != nullptr) {
    ota_begin((size_t)strtoul(size_param + 5, nullptr, 10));
    return ota_status_json(req);
  }
  const char *offset_param = strstr(query, "offset=");
  if (offset_param == nullptr) {
    httpd_resp_set_status(req, "400 Bad Request");
    return ota_send_json(req, "{\"error\":\"offset missing\"}");
  }
  uint32_t offset = (uint32_t)strtoul(offset_param + 7, nullptr, 10);
  uint8_t *buffer = static_cast<uint8_t *>(malloc(OTA_CHUNK_MAX));
  if (buffer == nullptr) {
    httpd_resp_set_status(req, "503 Service Unavailable");
    return ota_send_json(req, "{\"error\":\"out of memory\"}");
  }
  int remaining = req->content_len;
  int timeouts = 0;
  while (remaining > 0) {
    int want = remaining < OTA_CHUNK_MAX ? remaining : OTA_CHUNK_MAX;
    int received = httpd_req_recv(req, reinterpret_cast<char *>(buffer), want);
    if (received <= 0) {
      if (received == HTTPD_SOCK_ERR_TIMEOUT && ++timeouts < OTA_RECV_TIMEOUT_MAX) continue;
      break;
    }
    timeouts = 0;
    if (ota_write_chunk(offset, buffer, (size_t)received) != ESP_OK) break;
    offset += (uint32_t)received;
    remaining -= received;
  }
  free(buffer);
  return ota_status_json(req);
}

void heartbeat(void *arg) {
  (void)arg;
  while (true) {
    vTaskDelay(pdMS_TO_TICKS(3000));
    // A state frame proves the SSE link is alive; the UI flips to
    // "Disconnected" after 5 s without one.
    state_set_sensor("uptime", (float)(esp_timer_get_time() / 1000000));
    char report[256];
    snprintf(report, sizeof(report), "%s | %s | %s", sensors_status(), display_status(),
             actuators_status());
    state_set_text("diagnostic_message", report);
  }
}

}  // namespace

esp_err_t web_start() {
  char pair[128];
  char encoded[128];
  snprintf(pair, sizeof(pair), "%s:%s", MS_WEB_USER, MS_WEB_PASSWORD);
  base64(pair, encoded, sizeof(encoded));
  snprintf(auth_header, sizeof(auth_header), "Basic %s", encoded);

  clients_mutex = xSemaphoreCreateMutex();
  if (clients_mutex == nullptr) return ESP_ERR_NO_MEM;
  memset(clients, 0, sizeof(clients));
  state_subscribe(on_state, nullptr);

  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  config.uri_match_fn = httpd_uri_match_wildcard;  // needed for the /* REST routes
  config.max_open_sockets = 12;
  config.max_uri_handlers = 12;  // 8 routes registered; default is 8 and left no room
  config.lru_purge_enable = true;  // reclaim stale SSE/REST sessions
  config.stack_size = 6144;
  esp_err_t err = httpd_start(&server, &config);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "httpd_start: %s", esp_err_to_name(err));
    return err;
  }

  static httpd_uri_t root{};
  root.uri = "/"; root.method = HTTP_GET; root.handler = handle_root;
  static httpd_uri_t ui{};
  ui.uri = "/ui.js"; ui.method = HTTP_GET; ui.handler = handle_ui;
  static httpd_uri_t events{};
  events.uri = "/events"; events.method = HTTP_GET; events.handler = handle_events;
  static httpd_uri_t ota_get{};
  ota_get.uri = "/api/ota"; ota_get.method = HTTP_GET; ota_get.handler = handle_ota_get;
  static httpd_uri_t ota_post{};
  ota_post.uri = "/api/ota"; ota_post.method = HTTP_POST; ota_post.handler = handle_ota_post;
  static httpd_uri_t reboot_post{};
  reboot_post.uri = "/api/reboot"; reboot_post.method = HTTP_POST; reboot_post.handler = handle_reboot_post;
  static httpd_uri_t rest_get{};
  rest_get.uri = "/*"; rest_get.method = HTTP_GET; rest_get.handler = handle_rest_get;
  static httpd_uri_t rest_post{};
  rest_post.uri = "/*"; rest_post.method = HTTP_POST; rest_post.handler = handle_rest_post;
  httpd_register_uri_handler(server, &root);
  httpd_register_uri_handler(server, &ui);
  httpd_register_uri_handler(server, &events);
  httpd_register_uri_handler(server, &ota_get);
  httpd_register_uri_handler(server, &ota_post);
  httpd_register_uri_handler(server, &reboot_post);
  httpd_register_uri_handler(server, &rest_get);
  httpd_register_uri_handler(server, &rest_post);

  // heartbeat calls state_set_* -> on_state -> send_all, which nests a 320
  // byte SSE frame, a 512 byte chunk header and a 256 byte report on this
  // stack. 2048 bytes overflowed it (panic: "stack overflow in task sse_beat").
  xTaskCreate(heartbeat, "sse_beat", 8192, nullptr, 2, nullptr);
  ESP_LOGI(TAG, "web server listening on :80");
  return ESP_OK;
}
