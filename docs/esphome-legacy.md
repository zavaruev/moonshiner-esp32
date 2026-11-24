# ESPHome legacy backup

Last known-good ESPHome firmware is preserved before the native ESP-IDF migration.

## Git refs

- Branch: `esphome-legacy` → `a87e8bdc77387ce565103c1e7ba277b0e8551e6d` (last ESPHome `main`).
- Tag: `v1.09-esphome-final` → same commit.
- Remote: `git@github.com:zavaruev/moonshiner-esp32.git`

The local `main` additionally contains commit `f05a438` ("docs: record ESPHome 2026.10.0 version"), a one-line documentation update to `AGENTS.md`. No firmware source changed in that commit.

## Firmware artifact

Built from the exact tree in `/config/moonshiner_latest/` on the build server (its `moonshiner_esp32.yaml` and `moonshiner_ui_v24.js` SHA-256 match this repository at `a87e8bd`):

```bash
node /mnt/media/docker-compose/opencode/.home/dexec.js esphome \
  esphome compile /config/moonshiner_latest/moonshiner_esp32.yaml
```

Image: `/config/moonshiner_latest/.esphome/build/moonshiner-esp32/build/firmware.ota.bin`

SHA-256: `833d4e98799d53d1d43603b99d6774783cee5613b14b0f8be0d8e374895cfef7`
Size: 958896 bytes (fits the 0x1C0000 app slot).

Release asset: `esphome-v1.09-final.bin` at
https://github.com/zavaruev/moonshiner-esp32/releases/download/v1.09-esphome-final/esphome-v1.09-final.bin
Release page: https://github.com/zavaruev/moonshiner-esp32/releases/tag/v1.09-esphome-final

The compile initially failed because ESPHome's cached ninja path was absent; a symlink to `/usr/local/bin/ninja` fixed it. The resulting image reports `config_hash=0x7533d336`, built with ESPHome 2026.11.0.

## Why keep it

The native firmware can write any raw OTA image into the inactive app slot. Keeping this binary means a botched native cutover can be undone through the native `/api/ota` endpoint without a USB cable.
