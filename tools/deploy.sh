#!/bin/sh
# Build inside the esp-idf-moonshiner container (the host has no idf.py/docker
# CLI). The container exports IDF_TARGET=esp32; do not override it here.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
CID=${ESP_IDF_CONTAINER:-esp-idf-moonshiner}
DEXEC="node /mnt/media/docker-compose/opencode/.home/dexec.js $CID"

$DEXEC idf build

IMAGE="$ROOT/build/moonshiner.bin"
ls -l "$IMAGE"

if [ "${1:-}" = "--ota" ]; then
  shift
  "$ROOT/tools/ota_push.py" "$IMAGE" "$@"
fi
