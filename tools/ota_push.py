#!/usr/bin/env python3
"""
Upload a firmware image to the scale over the air, resuming as needed.

Why this exists in this shape: the link to the access point loses anywhere from
0 to 100 % of its packets, measured 2026-10-09, and the image is about 950 KB. A
single-shot upload has to survive the whole run of bad luck in one stretch. So
the device is asked how much has landed and the transfer continues from there -
a dropped chunk costs one chunk, not the upload.

It also retries the control calls. The same loss makes a plain POST fail before
a single byte is written, which would look like the feature being broken rather
than the network being bad.

Usage:
    tools/ota_push.py build/esp32_scale.bin [http://192.168.22.123]
"""
import argparse
import json
import base64
import os
import sys
import time
import urllib.error
import urllib.request

CHUNK = 4096


def auth_header():
    if os.environ.get("ESP32_AUTH_HEADER"):
        return {"Authorization": os.environ["ESP32_AUTH_HEADER"]}
    user = os.environ.get("ESP32_USER", "")
    password = os.environ.get("ESP32_PASS", "")
    if not user:
        return {}
    token = base64.b64encode(("%s:%s" % (user, password)).encode()).decode()
    return {"Authorization": "Basic " + token}


def http(url, data=None, timeout=30):
    req = urllib.request.Request(url, data=data, headers=auth_header(),
                                 method="POST" if data is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read()
    try:
        return json.loads(body)
    except Exception:
        return {}


def get_status(base, tries=8):
    """The status call matters more than any other: it is how the transfer finds
    out where to resume, so it is retried rather than reported as a failure."""
    last = None
    for _ in range(tries):
        try:
            return http(base + "/api/ota", timeout=20)
        except Exception as e:
            last = e
            time.sleep(1.5)
    raise SystemExit("device not answering on %s (%s)" % (base, last))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("base", nargs="?", default="http://192.168.22.231")
    a = ap.parse_args()

    data = open(a.image, "rb").read()
    total = len(data)
    print("image %s: %d bytes" % (a.image, total))

    st = get_status(a.base)
    if st.get("target", -1) < 0:
        raise SystemExit(
            "device reports no second slot. It still has the old one-slot "
            "partition table - flash partitions.csv once over USB first.")
    cap = st.get("part", 0)
    if cap and total > cap:
        raise SystemExit("image is %d bytes, the slot holds %d" % (total, cap))

    print("running %s, target slot %s (%d bytes)"
          % (st.get("run_ver"), st.get("target"), cap))

    print("opening the transfer (this erases the slot)...")
    st = http(a.base + "/api/ota?size=%d" % total, data=b"", timeout=120)
    if st.get("state") != 1:
        raise SystemExit("device refused the transfer: %s" % st.get("error"))
    written = int(st.get("written", 0))

    t0 = time.time()
    stall = 0
    while written < total:
        end = min(written + CHUNK, total)
        payload = data[written:end]
        url = "%s/api/ota?offset=%d" % (a.base, written)
        try:
            st = http(url, data=payload, timeout=60)
            nw = int(st.get("written", written))
            if nw < written:
                # Never go backwards: the high-water mark is monotonic, so this
                # would mean a stale reply from an earlier attempt.
                stall += 1
            else:
                stall = 0
                written = nw
            if st.get("error"):
                print("\ndevice rejected a chunk: %s" % st["error"])
                stall += 1
        except Exception as e:
            # The chunk may or may not have landed. Ask, rather than assume:
            # re-sending a chunk that did land is harmless, skipping one is not.
            stall += 1
            if stall % 5 == 1:
                print("  transfer stalled (%s); asking the device where it got to"
                      % str(e)[:50])
            time.sleep(1.0)
            try:
                st = get_status(a.base, tries=4)
                written = max(written, int(st.get("written", written)))
            except SystemExit:
                pass
            continue

        if written >= total or stall:
            continue
        pct = 100.0 * written / total
        speed = written / max(time.time() - t0, 0.001)
        print("\r  %5.1f%%  %d/%d  %.1f KB/s" % (pct, written, total, speed / 1024),
              end="", flush=True)
        if stall > 60:
            raise SystemExit("\ngiving up: no progress in %d attempts" % stall)

    print("\nall %d bytes on the device, verifying..." % total)
    st = http(a.base + "/api/ota?commit=1", data=b"", timeout=180)
    if st.get("state") != 3:
        raise SystemExit("verification failed: %s" % st.get("error"))

    print("verified. Slot %s, version '%s', marked to boot."
          % (st.get("target"), st.get("tgt_ver")))
    print("Reboot the device to run it. If the new image fails to start, the")
    print("bootloader reverts to '%s' on the next restart." % st.get("run_ver"))
    return 0


if __name__ == "__main__":
    sys.exit(main())