import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  readSensor,
  readNumber,
  readTextSensor,
  readBinarySensor,
  setNumber,
  toggleSwitch,
  pressButton,
  getAllTemperatures,
  getAllStatus,
} from "./esp32-api.js";

const server = new McpServer({
  name: "moonshiner-mcp",
  version: "1.0.0",
  description: "MCP server for Moonshiner ESP32 distillation controller",
});

// ─── Read tools ───────────────────────────────────────────────

server.tool(
  "read_temperatures",
  "Read current column and tank temperatures",
  {},
  async () => {
    try {
      const { column, tank } = await getAllTemperatures();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                column: { value: column.value, raw: column.raw },
                tank: { value: tank.value, raw: tank.raw },
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  "get_status",
  "Get full distillation status: temperatures, process state, alarms, uptime, WiFi, heap",
  {},
  async () => {
    try {
      const status = await getAllStatus();
      return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  "get_entity",
  "Read state of any ESPHome entity by its ID (e.g. 'column_temperature', 'target_column_temp', 'status_message')",
  {
    entity_id: z.string().regex(/^[a-zA-Z0-9_]+$/).describe("Entity ID without type prefix, e.g. 'column_temperature'"),
    type: z
      .enum(["sensor", "number", "text_sensor", "binary_sensor"])
      .default("sensor")
      .describe("Entity type"),
  },
  async ({ entity_id, type }) => {
    try {
      let result: unknown;
      switch (type) {
        case "sensor":
          result = await readSensor(entity_id);
          break;
        case "number":
          result = await readNumber(entity_id);
          break;
        case "text_sensor":
          result = await readTextSensor(entity_id);
          break;
        case "binary_sensor":
          result = await readBinarySensor(entity_id);
          break;
      }
      return {
        content: [
          {
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
    }
  },
);

// ─── Set / control tools ─────────────────────────────────────

const mkSetTool = (name: string, desc: string, entityId: string, min: number, max: number, step?: number) =>
  server.tool(
    name,
    desc,
    { value: z.number().min(min).max(max).describe(`Value (${min}–${max}${step ? `, step ${step}` : ''})`) },
    async ({ value }) => {
      try {
        await setNumber(entityId, value);
        return { content: [{ type: "text", text: `OK: ${entityId} → ${value}` }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  );

mkSetTool("set_target_temp", "Set target column temperature (°C)", "target_column_temp", 0, 100, 0.1);
mkSetTool("set_delta", "Set hysteresis delta (°C)", "delta", 0, 5, 0.01);
mkSetTool("set_max_tank_temp", "Set max tank temperature (°C)", "max_tank_temp", 0, 100, 0.1);
mkSetTool("set_coef_otbora", "Set collection coefficient (0 = min, 1 = max)", "coef_otbora", 0, 1, 0.001);
mkSetTool("set_heater_power", "Set heater power (0–1023)", "heater_power", 0, 1023, 1);
mkSetTool("set_valve_high", "Set upper valve (0–1023)", "valve_high_setting", 0, 1023, 1);
mkSetTool("set_valve_low", "Set lower valve (0–1023)", "valve_low_setting", 0, 1023, 1);
mkSetTool("set_volume", "Set buzzer volume (0–100 %)", "buzzer_volume", 0, 100, 1);

// ─── Switch tools ────────────────────────────────────────────

const mkSwitchTool = (name: string, desc: string, entityId: string) =>
  server.tool(
    name,
    desc,
    { state: z.boolean().describe("true = on, false = off") },
    async ({ state }) => {
      try {
        await toggleSwitch(entityId, state);
        return { content: [{ type: "text", text: `OK: ${entityId} → ${state ? "ON" : "OFF"}` }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  );

mkSwitchTool("toggle_reduction", "Enable/disable automatic reduction coefficient", "use_reduction_coefficient");
mkSwitchTool("toggle_upper_valve_close", "Enable/disable upper valve closing on overheat", "disable_upper_valve_closing");

// ─── Button tools ────────────────────────────────────────────

server.tool(
  "restart_process",
  "Restart the distillation process (resets process_finished flag, clears overheat)",
  {},
  async () => {
    try {
      await pressButton("restart_process");
      return { content: [{ type: "text", text: "OK: distillation process restarted" }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
    }
  },
);

// ─── Start ───────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && i + 1 < args.length) {
      process.env.ESP32_URL = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      process.stderr.write(`Moonshiner ESP32 MCP Server v1.0.0

Usage:
  npx @moonshiner/mcp-server --url http://<esp32-ip>

Options:
  --url <url>  ESP32 web interface URL (default: http://192.168.22.231)
  --help, -h   Show this help

Example:
  npx @moonshiner/mcp-server --url http://192.168.22.231
`);
      process.exit(0);
    }
  }
}

parseArgs();

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${e}\n`);
  process.exit(1);
});
