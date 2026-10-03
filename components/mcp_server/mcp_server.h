#pragma once

#include "esphome/core/defines.h"
#include "esphome/core/component.h"

#ifdef USE_ESP32
#include <esp_http_server.h>
#endif

#include <string>

namespace esphome {
namespace mcp_server {

/// Diagnostic: send msg (+heap stats + local port status) via UDP to the
/// debug collector (192.168.22.102:9001). Also flushes any messages
/// buffered by MCPServer::setup() while the network was not up yet.
void debug_send(const char *msg);

/// On-device Model Context Protocol endpoint (Streamable HTTP, stateless).
///
/// Serves JSON-RPC 2.0 on POST /mcp with the same 14 tools as the Node-based
/// mcp-moonshiner server, but directly from firmware - no PC or NAS required.
/// Optional bearer-token auth via `api_key`.
class MCPServer : public Component {
 public:
  void setup() override;
  void loop() override;
  void dump_config() override;
  /// Runs after WiFi/network init (250/220) so sockets are usable, but
  /// before api(200): if App.setup() stalls later, our HTTP task still
  /// serves /diag for remote diagnosis.
  float get_setup_priority() const override { return 210.0f; }

  void set_port(uint16_t port) { this->port_ = port; }
  void set_api_key(const std::string &key) { this->api_key_ = key; }

  /// Handle a raw JSON-RPC body. Returns the response body, or an empty
  /// string for notification-only payloads (HTTP 202, no content).
  std::string handle_rpc(const std::string &body);

 protected:
#ifdef USE_ESP32
  static esp_err_t handle_post(httpd_req_t *req);
  static esp_err_t handle_get(httpd_req_t *req);
  static esp_err_t handle_options(httpd_req_t *req);
  static esp_err_t handle_diag(httpd_req_t *req);

  httpd_handle_t server_{nullptr};
#endif

  uint16_t port_{8080};
  std::string api_key_;
  bool loop_sent_{false};
  uint32_t last_flush_{0};
};

}  // namespace mcp_server
}  // namespace esphome
