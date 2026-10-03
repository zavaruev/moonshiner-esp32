import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components.esp32 import add_idf_sdkconfig_option, include_builtin_idf_component
from esphome.const import CONF_ID, CONF_PORT
from esphome.types import ConfigType

CODEOWNERS = ["@zavaruev"]

# ArduinoJson wrapper for the JSON-RPC codec + every entity domain the tools touch
AUTO_LOAD = [
    "json",
    "sensor",
    "number",
    "switch",
    "button",
    "text_sensor",
    "binary_sensor",
]

mcp_server_ns = cg.esphome_ns.namespace("mcp_server")
MCPServer = mcp_server_ns.class_("MCPServer", cg.Component)

CONF_API_KEY = "api_key"

CONFIG_SCHEMA = cv.All(
    cv.Schema(
        {
            cv.GenerateID(): cv.declare_id(MCPServer),
            cv.Optional(CONF_PORT, default=8080): cv.port,
            cv.Optional(CONF_API_KEY): cv.string,
        }
    ),
    cv.only_on_esp32,
)


async def to_code(config: ConfigType) -> None:
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)

    cg.add(var.set_port(config[CONF_PORT]))
    if CONF_API_KEY in config:
        cg.add(var.set_api_key(config[CONF_API_KEY]))

    # esp_http_server is also pulled in by web_server_idf, but declare the
    # dependency explicitly so the component builds standalone as well.
    include_builtin_idf_component("esp_http_server")
    # Long Authorization headers must fit into the parsed header section.
    add_idf_sdkconfig_option("CONFIG_HTTPD_MAX_REQ_HDR_LEN", 1024)
