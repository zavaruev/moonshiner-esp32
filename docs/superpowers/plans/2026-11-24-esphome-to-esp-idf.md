# ESPHome → native ESP-IDF migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ESPHome firmware of the Moonshiner distillation controller with a native ESP-IDF 6.0.1 C++ application at the repository root, preserving the web UI, on-device MCP and OTA while dropping Home Assistant integration.

**Architecture:** One ESP-IDF project in `main/` with a single in-memory entity registry backed by NVS. Two `esp_http_server` instances: port 80 for the existing UI/REST/SSE (Basic Auth) and port 8080 for the stateless JSON-RPC MCP endpoint (Bearer token). GPIO/control logic is ported verbatim from `moonshiner_esp32.yaml` scripts into C++ functions; ESPHome component code in `components/mcp_server/` is ported by replacing entity lookups with registry lookups.

**Tech Stack:** ESP-IDF 6.0.1 (container `esp-idf-6.0.1-local`, invoked through `dexec.js`), C++17, FreeRTOS, ArduinoJson 7.4.3, espressif/onewire_bus 1.1.2, espressif/ds18b20 0.4.0, ESP-IDF httpd / esp_ota / NVS / LEDC / I2C.

**Spec:** conversation design of 2026-11-24 (variant A, pure native port); source of truth for behavior: `moonshiner_esp32.yaml`, `moonshiner_ui_v24.js`, `components/mcp_server/mcp_server.cpp`, `mcp-moonshiner/src/*`.

## Global Constraints

- Device: ESP32 (`esp32dev`), 4 MB flash. Partition table is copied verbatim from `.esphome/build/moonshiner-esp32/partitions.csv` (`app0`/`app1` = 0x1C0000, otadata 0x2000, nvs 0x70000) so OTA slots stay compatible.
- Access points/endpoints: `http://192.168.22.231`, web Basic Auth from gitignored secrets, MCP `http://192.168.22.231:8080/mcp` with `Authorization: Bearer <mcp_api_key>`; `opencode.json` must not change.
- GPIO: heater SSR GPIO27 (software 1 s PWM only — never LEDC on ADC2), high valve GPIO14, low valve GPIO13, buzzer GPIO33 (LEDC), OneWire GPIO4, I2C SDA GPIO21 / SCL GPIO22, OLED SH1106 128x64 at 0x3C.
- Safety: on boot and on shutdown all outputs off; configure safe GPIO state before any network/server init; 60 s temperature watchdog shuts everything down; cold start (tank < 70 °C) resets heat and valves to zero.
- NVS migration: none. All former `restore_value` values (including boot_counter and process_finished) start at their YAML initial values.
- Secrets: `main/credentials.h` is gitignored and created from committed `main/credentials.h.example`; OTA push credentials stay in `~/.config/moonshiner/esp32.env`; never commit credentials.
- UI contract: SSE `event: state` with `data: {"id":..., "state":...}`, heartbeat every 3 s using id `sensor-uptime`; POST `/number/<Display Name>/set?value=…`, `/switch/<Display Name>/turn_on|turn_off`, `/button/restart_process/press`; GET `/<domain>/<Display Name>`; names are in `moonshiner_ui_v24.js` lines 1145–1178 and `esp32-api.ts` ENTITY_NAMES.
- MCP contract: exactly the 14 current tools, stateless HTTP quirks preserved (202 for notifications, 405 on GET /mcp, echoed protocolVersion, 4096-byte body cap), unique httpd `ctrl_port = port + 1000`.
- Tests that must stay green: `npm test` (UI JSDOM suites), `cd mcp-moonshiner && npm test` (96 vitest tests).

## Review Focus

- Heater/valve state during reset: with unknown external pulldowns, GPIO27/14/13 must be driven low before WiFi starts — Task 2 pins this with a boot-order check in the code review step.
- First cutover: the native image must fit 0x1C0000 and use the identical partition table; Task 2 checks binary size, Task 7 checks the ESPHome binary backup exists before flashing.
- False SSE disconnect: no state frames for >5 s makes the UI show Disconnected; Task 4 adds a 3 s `sensor-uptime` heartbeat and tests frame cadence.
- MCP session behavior: opencode's remote MCP client may reject a "clean" Streamable HTTP rewrite; Task 5 ports `handle_rpc` and HTTP handlers verbatim and verifies with curl (`initialize`, `tools/list`, 401, 202, 405).
- Rollback: `esp_ota_mark_app_valid_cancel_rollback()` too early leaves a broken image running; Task 6 marks valid only after a 60 s health check and verifies that a failed health check triggers the bootloader rollback on reboot.

---

### Task 1: GitHub backup of the last ESPHome firmware

**Files:**
- Create: `docs/esphome-legacy.md` (pointer to the backup branch/tag and binary asset)
- No firmware files are modified in this task.

**Interfaces:**
- Produces: GitHub branch `esphome-legacy` and tag `v1.09-esphome-final` at commit `a87e8bd` (plus the local `AGENTS.md` version-line commit), and a documented GitHub Release asset holding the last ESPHome `firmware.bin`.

- [ ] **Step 1: Commit the pending documentation change**

```bash
cd /mnt/media/docker-compose/MoonshinerNew
PATH=/home/node/.local/bin:$PATH git add AGENTS.md
PATH=/home/node/.local/bin:$PATH git commit -m "docs: record ESPHome 2026.10.0 version"
```

Expected: clean `git status` apart from untracked new directories.

- [ ] **Step 2: Create backup branch and tag on GitHub**

Use `tools.github.create_branch` with `owner=zavaruev`, `repo=moonshiner-esp32`, `branch=esphome-legacy`, `from_sha=a87e8bdc77387ce565103c1e7ba277b0e8551e6d`. Create tag `v1.09-esphome-final` through the GitHub web UI (no local SSH in this environment) from the same commit.

- [ ] **Step 3: Capture a known-good ESPHome binary**

On the build server, compile the tagged config and save the resulting `firmware.bin` plus its SHA-256 to a GitHub Release asset named `esphome-v1.09-final.bin` (via the GitHub web UI or `gh release upload`). Record the exact command and hash in `docs/esphome-legacy.md`.

- [ ] **Step 4: Verify the backup**

Run `tools.github.get_file_contents` for `moonshiner_esp32.yaml` on branch `esphome-legacy` and `tools.github.list_commits` for tag `v1.09-esphome-final`. Expected: both resolve to the last ESPHome tree.

- [ ] **Step 5: Commit** `docs/esphome-legacy.md` to `main`.

### Task 2: ESP-IDF skeleton, safe boot and build container

**Files:**
- Create: `CMakeLists.txt`, `partitions.csv`, `sdkconfig.defaults`, `dependencies.lock`, `main/CMakeLists.txt`, `main/app_main.cpp`, `main/credentials.h.example`, `tools/deploy.sh`
- Modify: `.gitignore` (ignore `main/credentials.h`, `sdkconfig`, `build/`, `managed_components/`)

**Interfaces:**
- Produces: `app_main()` that initializes NVS, drives GPIO27/14/13 low before any network setup, and starts the diagnostic HTTP server on port 8080 with `GET /diag`; `tools/deploy.sh` builds via `dexec.js` in container `esp-idf-moonshiner`.

- [ ] **Step 1: Create the container**

Create container `esp-idf-moonshiner` from image `esp-idf-6.0.1-local` with bind mount `/mnt/media/docker-compose/MoonshinerNew → /project` (docker socket API via node/dexec.js; no docker CLI). Verify with `node /mnt/media/docker-compose/opencode/.home/dexec.js esp-idf-moonshiner idf --version` → `ESP-IDF v6.0.1`.

- [ ] **Step 2: Write project scaffolding**

`CMakeLists.txt`: `cmake_minimum_required(VERSION 3.22)`, `include($ENV{IDF_PATH}/tools/cmake/project.cmake)`, `project(moonshiner)`. `partitions.csv`: verbatim copy of the ESPHome table. `sdkconfig.defaults`: `CONFIG_IDF_TARGET="esp32"`, 4 MB flash, `CONFIG_LWIP_MAX_SOCKETS=16`, `CONFIG_ESP_TASK_WDT_TIMEOUT_S=15`, `CONFIG_HTTPD_MAX_REQ_HDR_LEN=1024`, custom partition table, `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y`, `CONFIG_APP_ROLLBACK_ENABLE=y`.

- [ ] **Step 3: Implement `app_main()`**

Order: `nvs_flash_init()` → configure GPIO27/14/13 as outputs, level 0, internal pulldowns → start diagnostics httpd → then WiFi/other services (added in later tasks). `GET /diag` returns JSON with `phases` bitmask, heap and uptime (same shape as current firmware).

- [ ] **Step 4: Build and verify**

Run `node .../dexec.js esp-idf-moonshiner idf build` (after `idf set-target esp32` once). Expected: build succeeds; `build/moonshiner.bin` size < `0x1C0000` (1835008 bytes).

- [ ] **Step 5: Commit** the skeleton.

### Task 3: Entity registry, NVS, REST and SSE

**Files:**
- Create: `main/state.h`, `main/state.cpp`, `main/web_server.cpp`, `main/web_server.h`, `main/web/index.html`, `tools/embed_web.py`, `tools/contract_test.js`
- Modify: `main/CMakeLists.txt`, `main/app_main.cpp`

**Interfaces:**
- Consumes: `app_main()` from Task 2.
- Produces: `state_init()`, `state_get_number(id)`, `state_set_number(id, value)`, `state_get_bool(id)`, `state_set_bool(id, bool)`, `state_get_text(id)`, `state_set_text(id, const char*)`, `state_subscribe(callback)`; `web_start()` registering httpd :80; generated `main/ui_assets.h` with gzip + raw UI bytes.

- [ ] **Step 1: Write a host-side contract test** (`tools/contract_test.js`) asserting: GET `/sensor/Column Temperature` returns JSON-parseable numeric payload; POST `/number/Delta/set?value=0.45` accepts and updates the registry; SSE frame uses `event: state` and `data:` JSON with both ID forms; heartbeat id is `sensor-uptime` and interval ≤3 s. Run it against a stub HTTP server first to confirm the test itself passes only when frames/routes match.

- [ ] **Step 2: Implement the registry**

All entities from the YAML (numbers, switches, binary/text sensors, buttons) with display-name lookup. NVS persists only entities that had `restore_value: true`, initialized to YAML defaults. `state_set_*` notifies subscribers.

- [ ] **Step 3: Implement httpd :80**

Basic Auth from `credentials.h`; `/` serves minimal HTML with `<script src="/ui.js">`; `/ui.js` serves embedded gzip UI with `Content-Encoding: gzip` when the client accepts it, raw otherwise; `/events` registers SSE clients and pushes `state` frames on change plus `sensor-uptime` heartbeat every 3 s; REST GET/POST routes match the UI/MCP paths exactly.

- [ ] **Step 4: Run contract test and `npm test`**

Expected: all contract assertions pass; `npm test` UI suites remain green unmodified.

- [ ] **Step 5: Commit**.

### Task 4: Sensors, actuators, control logic and display

**Files:**
- Create: `main/sensors.cpp`, `main/actuators.cpp`, `main/control.cpp`, `main/control.h`, `main/display.cpp`, `main/rtttl.cpp`, `main/sh1106.cpp` (+ headers), `tools/control_sim.cpp`
- Modify: `main/CMakeLists.txt`, `main/app_main.cpp`, `sdkconfig.defaults`

**Interfaces:**
- Consumes: registry API from Task 3.
- Produces: `sensors_start()`, `actuators_init()`, `control_start()`, `display_start()`, `rtttl_play(const char*)`, `rtttl_stop()`.

- [ ] **Step 1: Write a host-side control simulation test**

`tools/control_sim.cpp` exercises pure helpers with assertions copied from YAML: close valves at `t_col >= target + delta`, open at `t_col <= target`, coefficient applies only to the low valve, overheat alarm after 5000 ms, `process_finished` at `t_tank >= max_tank_temp`, watchdog after 60000 ms, pulse interval `200 * 1023 / level`. Compile with `g++ -std=c++17 -I main tools/control_sim.cpp main/control.cpp -o /tmp/opencode/control_sim` and run; expected FAIL before implementation.

- [ ] **Step 2: Implement sensors**

Two DS18B20 with fixed ROM addresses `0x043C01F096B22428` and `0xBF14D0231E64FF28`, 12-bit, median-5, 5 s updates; update `last_temp_update` and trigger control on each valid reading.

- [ ] **Step 3: Implement actuators and control port**

Port every branch of `control_logic` and `emergency_shutdown` verbatim; heater software PWM 1 s on GPIO27; 200 ms valve pulses with the exact interval formula; LEDC buzzer with cubic volume curve every 50 ms; keep upper-valve override and 84 °C coefficient reduction.

- [ ] **Step 4: Implement display**

SH1106 driver: page addressing, 0x3C, GPIO21/22, 1 s refresh with the existing 3 s stuck guard; show uptime, IP, tank temperature and heartbeat dot.

- [ ] **Step 5: Run the simulation test and rebuild firmware**

Expected: simulation passes; `idf build` succeeds and image still fits the slot.

- [ ] **Step 6: Commit**.

### Task 5: On-device MCP server

**Files:**
- Create: `main/mcp_server.cpp`, `main/mcp_server.h` (ported from `components/mcp_server/`)
- Modify: `main/CMakeLists.txt`, `main/app_main.cpp`, `tools/contract_test.js`

**Interfaces:**
- Consumes: registry API from Task 3, `rtttl_*` not needed.
- Produces: `mcp_start()` with `handle_rpc(const std::string&) -> std::string` and `GET /diag`.

- [ ] **Step 1: Add MCP contract tests to `tools/contract_test.js`**

Assert: initialize returns echoed protocolVersion and capabilities; `tools/list` has exactly 14 names; `tools/call` for `read_temperatures` returns numeric values; missing Bearer token → 401; GET `/mcp` → 405; notification POST → 202 with empty body; body >4096 bytes → rejected. Run before implementation: FAIL.

- [ ] **Step 2: Port `handle_rpc` and HTTP handlers**

Keep all JSON shapes, tool descriptions/schemas, ranges and error strings verbatim; replace `find_sensor/find_number/...` with registry lookups. Fix only `set_heater_power` max from 1023 → 2750 to match YAML. Unique `ctrl_port = 8080 + 1000`; keep `/diag` unauthenticated and UDP `debug_send()` probes.

- [ ] **Step 3: Run `tools/contract_test.js`, Node MCP vitest and curl against the device**

Expected: all assertions pass; `cd mcp-moonshiner && npm test` still 96/96 (Node fallback untouched); opencode can call `read_temperatures`.

- [ ] **Step 4: Commit**.

### Task 6: OTA with rollback

**Files:**
- Create: `main/ota.cpp`, `main/ota.h`, `tools/ota_push.py`
- Modify: `main/CMakeLists.txt`, `main/web_server.cpp`, `tools/deploy.sh`, `tools/contract_test.js`

**Interfaces:**
- Consumes: httpd :80 from Task 3.
- Produces: `ota_init()`, `ota_handlers` (`GET /api/ota`, `POST /api/ota?size=N`, `POST /api/ota?offset=N`, `POST /api/ota?commit=1`), `ota_mark_healthy()` called after 60 s of verified operation (WiFi + `/`, `/events`, `/mcp` reachable, both sensors valid).

- [ ] **Step 1: Add OTA contract test**

Assert status JSON fields (`state`, `written`, `total`, `part`, `run_ver`, `target`), resumable write from an arbitrary offset, commit -> boot slot switch, and that `ota_mark_healthy()` is not called until 60 s of checks. Run before implementation: FAIL.

- [ ] **Step 2: Implement OTA handlers**

Adapt `ESP32_Scale/main/ota.c` and `tools/ota_push.py`; protect endpoints with Basic Auth; two app slots from `partitions.csv`; bootloader rollback enabled as in `sdkconfig.defaults`. On failed 60 s health check, reboot to roll back.

- [ ] **Step 3: Verify locally against the device with a harmless build**

Push a build with an unchanged feature set, check `GET /api/ota` run_ver before/after, reboot, confirm the new image stays valid after the health window. Verify the saved ESPHome binary can be pushed back through the same API (do not reboot it unless a rollback is actually needed).

- [ ] **Step 4: Commit**.

### Task 7: Cutover and documentation

**Files:**
- Modify: `README.md`, `AGENTS.md`, `CHANGELOG.md`, `.gitignore`
- Create: `docs/migration-notes.md`

**Interfaces:**
- Consumes: all previous tasks.

- [ ] **Step 1: Pre-cutover checklist**

Confirm backup tag/branch and binary asset exist; confirm current settings captured via MCP if needed; confirm device reachable; measure GPIO27/14/13 levels during reset with a multimeter; if any pin goes high, stop and solve in hardware.

- [ ] **Step 2: Flash the native image**

Use `esphome upload --file build/moonshiner.bin --device 192.168.22.231 --ota-password <from secrets.yaml>` (first transition) or the native `/api/ota` API for subsequent updates. Check `/diag`, `/events`, `/mcp` and the UI after boot; watch logs via a plain UDP collector or serial if available.

- [ ] **Step 3: Run the full verification set**

`npm test`, `cd mcp-moonshiner && npm test`, `tools/contract_test.js`, curl suite for MCP and OTA, UI in a browser, physical checks of heater/valves/buzzer/display with the process stopped.

- [ ] **Step 4: Document and tag**

Update README/AGENTS/CHANGELOG with the new architecture, build and rollback instructions; create tag `v2.0-idf-first` on `main`. Leave `esphome-legacy` untouched.

- [ ] **Step 5: Commit**.
