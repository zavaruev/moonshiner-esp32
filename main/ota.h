/*
 * ota.h - replacing the firmware over the air.
 *
 * The device has two 2 MB application slots. An update is written into the one
 * that is not running, verified, and marked to boot on the next restart. The
 * running slot is never touched, so a failure at any point leaves a device that
 * still starts.
 *
 * Transfers are resumable, and that is not an optimisation - it is the only
 * workable design for this link. Measured 2026-10-09: the connection to the
 * access point loses anywhere from 0 to 100 % of its packets, fluctuating over
 * minutes. A firmware image is about 950 KB. A single-shot upload would have to
 * survive the whole run of bad luck in one stretch, and the measured rate says
 * that stretch exists. With an offset the client asks what has landed and
 * continues from there, so a dropout costs one chunk instead of the transfer.
 */
#ifndef OTA_H
#define OTA_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "esp_err.h"

typedef enum {
    OTA_IDLE = 0,
    OTA_RECEIVING,   /* chunks are arriving */
    OTA_VERIFYING,   /* checking the written image */
    OTA_READY,       /* verified, will boot on the next restart */
    OTA_FAILED,
} ota_state_t;

typedef struct {
    ota_state_t state;
    size_t  written;      /* bytes confirmed in the target slot */
    size_t  total;        /* size the client said it would send, 0 if unknown */
    size_t  partition_size;
    int     target_slot;  /* 0 or 1, -1 if there is no second slot */
    int     running_slot;
    bool    rollback_armed; /* true when a reboot will revert if the app does
                             * not confirm itself; cleared once it has */
    char    error[96];
    char    running_version[32];
    char    target_version[32];
} ota_status_t;

#ifdef __cplusplus
extern "C" {
#endif

void ota_init(void);

/* Records how many bytes the target slot should end up with and erases it.
 * Refuses a size that does not fit, which is the one check that stops a
 * truncated or wrong file from being written into the slot. Returns
 * ESP_ERR_INVALID_SIZE if total exceeds the partition. */
esp_err_t ota_begin(size_t total);

/* Writes one chunk at an absolute offset in the target slot. Offsets may arrive
 * out of order and may repeat, so a client that lost a reply can simply send the
 * chunk again. Rejects a write that would run past the size given to
 * ota_begin(). */
esp_err_t ota_write_chunk(uint32_t offset, const uint8_t *data, size_t len);

/* Finishes: verifies the image, switches the boot slot, arms rollback.
 * Leaves the device ready to restart; the caller does the restarting. */
esp_err_t ota_finish(void);

/* Throws away a partial transfer and goes back to idle. */
void ota_abort(void);

void ota_get_status(ota_status_t *out);

/* Version string of the running image and of the one waiting in the other slot,
 * so the page can show "1.2.0 installed, 1.3.0 pending". Filled at boot. */
const char *ota_running_version(void);
const char *ota_pending_version(void);

#ifdef __cplusplus
}
#endif

#endif /* OTA_H */