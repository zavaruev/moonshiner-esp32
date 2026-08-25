#!/usr/bin/env bash
# Tail ESP32 logs safely: kills stale `esphome logs` processes inside the container
# (they used to pile up and exhaust the device's API connection limit) and runs
# logs with an in-container timeout so nothing can outlive this command.
set -euo pipefail

SERVER="alexander@192.168.22.102"
CONFIG="/config/moonshiner_latest/moonshiner_esp32.yaml"
DEVICE="192.168.22.231"
SECONDS="${1:-40}"

kill_stale() {
  ssh "$SERVER" "docker exec esphome sh -c '
self=\$\$
for pid in /proc/[0-9]*; do
  pid=\${pid#/proc/}
  [ \"\$pid\" = \"\$self\" ] && continue
  if [ -r /proc/\$pid/cmdline ] && tr \"\\0\" \" \" < /proc/\$pid/cmdline 2>/dev/null | grep -q \"esphome logs\"; then
    kill -9 \$pid 2>/dev/null || true
    echo \"killed stale logs pid \$pid\"
  fi
done
' 2>/dev/null || true"
}

kill_stale

ssh "$SERVER" "docker exec esphome timeout -k 5 $SECONDS esphome logs $CONFIG --device $DEVICE 2>&1 | grep -vE 'igmp|multicast|sysctl'" || true

# Final sweep: ensure nothing survived (timeout's SIGTERM can be ignored by python)
kill_stale