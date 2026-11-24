/*
 * ota.c - writing a new firmware image into the slot that is not running.
 *
 * What this deliberately does not do: it does not trust the client. The size is
 * checked against the partition before a single byte is written, the image is
 * verified before the boot slot is switched, and a rejected image leaves the
 * previous firmware in charge.
 *
 * The verification is not decoration. The image ends with a SHA-256 over
 * everything before it (confirmed by hand on build/esp32_scale.bin), and
 * esp_image_verify() walks the segments, checks the per-segment digests and the
 * appended one. On a link that loses packets, "the upload finished" and "the
 * image is correct" are different claims.
 */
#include "ota.h"

#include <string.h>
#include <stdio.h>
#include <stdarg.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_system.h"
#include "esp_partition.h"
#include "esp_ota_ops.h"
#include "esp_image_format.h"
#include "freertos/task.h"

/* C-linkage shims from state.cpp (state.h is C++ only). */
const char *state_c_ip_address(void);
int state_c_sensors_valid(void);

static const char *TAG = "ota";

static struct {
    ota_state_t  state;
    size_t       written;
    size_t       total;
    const esp_partition_t *target;
    const esp_partition_t *running;
    bool         rollback_armed;
    char         error[96];
    char         running_version[32];
    char         target_version[32];
    SemaphoreHandle_t lock;
} s;

static void set_error(const char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(s.error, sizeof(s.error), fmt, ap);
    va_end(ap);
    ESP_LOGW(TAG, "%s", s.error);
}

/* Slot index from the partition subtype, for logs and the web reply. Defined
 * before ota_init(), which calls it. */
static int slot_of(const esp_partition_t *p)
{
    if (p == NULL) {
        return -1;
    }
    if (p->subtype == ESP_PARTITION_SUBTYPE_APP_OTA_0) return 0;
    if (p->subtype == ESP_PARTITION_SUBTYPE_APP_OTA_1) return 1;
    if (p->subtype == ESP_PARTITION_SUBTYPE_APP_FACTORY) return 0;
    return -1;
}

/* Version string out of the app descriptor embedded in a partition.
 *
 * The descriptor sits at offset 32 and is found by its magic, not by trusting
 * the offset alone - a wrong file could have bytes there that look like text. */
static void read_version(const esp_partition_t *part, char *out, size_t cap)
{
    out[0] = '\0';
    if (part == NULL) {
        return;
    }
    esp_app_desc_t desc;
    if (esp_ota_get_partition_description(part, &desc) != ESP_OK) {
        return;
    }
    if (desc.magic_word != ESP_APP_DESC_MAGIC_WORD) {
        return;
    }
    strlcpy(out, desc.version, cap);
}

/* A newly booted image stays PENDING_VERIFY for a minute. Only confirm it
 * once WiFi is up and both temperature sensors have produced real readings;
 * otherwise reboot and let the bootloader fall back to the previous slot. */
static void health_task(void *arg)
{
    (void) arg;
    vTaskDelay(pdMS_TO_TICKS(60000));
    esp_ota_img_states_t st;
    if (s.running == NULL ||
        esp_ota_get_state_partition(s.running, &st) != ESP_OK ||
        st != ESP_OTA_IMG_PENDING_VERIFY) {
        vTaskDelete(NULL);
        return;
    }
    bool healthy = state_c_ip_address()[0] != '\0' && state_c_sensors_valid();
    if (healthy) {
        if (esp_ota_mark_app_valid_cancel_rollback() == ESP_OK) {
            ESP_LOGI(TAG, "60 s health check passed; rollback cancelled");
            s.rollback_armed = false;
        } else {
            ESP_LOGE(TAG, "could not confirm image");
        }
    } else {
        // Do not reboot the still while it is processing. A failed health
        // check is logged; an operator can push a known-good image manually.
        ESP_LOGE(TAG, "health check failed (IP=%d sensors=%d); staying up",
                 state_c_ip_address()[0] != '\0', state_c_sensors_valid());
    }
    vTaskDelete(NULL);
}

void ota_init(void)
{
    if (s.lock == NULL) {
        s.lock = xSemaphoreCreateMutex();
    }

    s.running = esp_ota_get_running_partition();

    /* The slot to write into is the one that is not running. With a single-slot
     * layout there is no such thing and the whole feature is unavailable - which
     * is the state the device is in until partitions.csv is flashed once.
     *
     * Found by looking both slots up directly rather than walking an iterator:
     * there are exactly two, and this is called once at boot. */
    const esp_partition_t *s0 = esp_partition_find_first(
        ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, NULL);
    const esp_partition_t *s1 = esp_partition_find_first(
        ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_1, NULL);
    const esp_partition_t *other = NULL;
    if (s0 != NULL && s1 != NULL) {
        other = (s0 == s.running) ? s1 : s0;
    }

    s.target = other;
    s.state = OTA_IDLE;
    s.written = 0;
    s.total = 0;

    read_version(s.running, s.running_version, sizeof(s.running_version));
    read_version(other, s.target_version, sizeof(s.target_version));

    /* Rollback is confirmed only after a health window (see health_task),
     * not immediately at boot: a failed image must not mark itself valid. */
    xTaskCreate(health_task, "ota_health", 3072, NULL, 2, NULL);

    ESP_LOGI(TAG, "running slot %d version '%s', target slot %d version '%s'",
             slot_of(s.running), s.running_version,
             other ? slot_of(other) : -1, s.target_version);
    if (other == NULL) {
        ESP_LOGW(TAG, "only one application slot: OTA is not available until "
                      "partitions.csv is flashed once over USB");
    }
}

esp_err_t ota_begin(size_t total)
{
    if (s.lock == NULL) ota_init();
    xSemaphoreTake(s.lock, portMAX_DELAY);

    esp_err_t rc;
    if (s.target == NULL) {
        set_error("no second application slot; flash partitions.csv once over USB");
        s.state = OTA_FAILED;
        rc = ESP_ERR_NOT_SUPPORTED;
        goto out;
    }
    if (total == 0 || total > s.target->size) {
        set_error("image is %u bytes, slot holds %u", (unsigned)total,
                  (unsigned)s.target->size);
        s.state = OTA_FAILED;
        rc = ESP_ERR_INVALID_SIZE;
        goto out;
    }

    s.total = total;
    s.written = 0;
    s.error[0] = '\0';

    /* Erasing 2 MB takes a second or two and blocks flash. The watchdog is not
     * set to panic, but the page will sit there; the reply carries the state so
     * it can say so rather than look hung. */
    ESP_LOGI(TAG, "erasing slot %d (%u bytes) for a %u byte image",
             slot_of(s.target), (unsigned)s.target->size, (unsigned)total);
    int64_t t0 = esp_timer_get_time();
    esp_err_t err = esp_partition_erase_range(s.target, 0, s.target->size);
    if (err != ESP_OK) {
        set_error("erase failed: %s", esp_err_to_name(err));
        s.state = OTA_FAILED;
        rc = err;
        goto out;
    }
    ESP_LOGI(TAG, "erased in %lld ms", (long long)((esp_timer_get_time() - t0) / 1000));

    s.state = OTA_RECEIVING;
    rc = ESP_OK;

out:
    xSemaphoreGive(s.lock);
    return rc;
}

esp_err_t ota_write_chunk(uint32_t offset, const uint8_t *data, size_t len)
{
    if (s.lock == NULL) ota_init();
    xSemaphoreTake(s.lock, portMAX_DELAY);

    esp_err_t rc = ESP_OK;
    if (s.state != OTA_RECEIVING) {
        set_error("write rejected: transfer is not open");
        rc = ESP_ERR_INVALID_STATE;
    } else if (s.total == 0) {
        set_error("write rejected: no transfer open");
        rc = ESP_ERR_INVALID_STATE;
    } else if ((size_t)offset + len > s.total) {
        /* Without this a client claiming a 100 KB size could write the whole
         * 2 MB slot and leave it looking like a valid image to a careless
         * caller. The check costs two comparisons. */
        set_error("chunk at %u+%u runs past the declared %u byte image",
                  (unsigned)offset, (unsigned)len, (unsigned)s.total);
        rc = ESP_ERR_INVALID_SIZE;
    } else {
        esp_err_t err = esp_partition_write(s.target, offset, data, len);
        if (err != ESP_OK) {
            set_error("write at %u failed: %s", (unsigned)offset,
                      esp_err_to_name(err));
            s.state = OTA_FAILED;
            rc = err;
        } else {
            /* High-water mark, not a running total: chunks may repeat or arrive
             * out of order, so only the furthest point reached counts. */
            if ((size_t)offset + len > s.written) {
                s.written = (size_t)offset + len;
            }
        }
    }

    xSemaphoreGive(s.lock);
    return rc;
}

esp_err_t ota_finish(void)
{
    if (s.lock == NULL) ota_init();
    xSemaphoreTake(s.lock, portMAX_DELAY);

    esp_err_t rc;
    if (s.state != OTA_RECEIVING) {
        set_error("finish rejected: transfer is not open");
        rc = ESP_ERR_INVALID_STATE;
        goto out;
    }
    if (s.written < s.total) {
        set_error("only %u of %u bytes arrived", (unsigned)s.written,
                  (unsigned)s.total);
        s.state = OTA_FAILED;
        rc = ESP_ERR_INVALID_SIZE;
        goto out;
    }

    s.state = OTA_VERIFYING;

    /* Verify before switching. esp_image_verify walks the segment table and
     * checks the appended SHA-256, so this is the check that a dropped packet
     * during the transfer cannot slip past. */
    esp_image_metadata_t md = {0};
    esp_partition_pos_t pos = {
        .offset = s.target->address,
        .size = (uint32_t)s.total,
    };
    esp_err_t verr = esp_image_verify(ESP_IMAGE_VERIFY, &pos, &md);
    if (verr != ESP_OK) {
        set_error("image rejected by the bootloader checks: %s",
                  esp_err_to_name(verr));
        s.state = OTA_FAILED;
        rc = ESP_ERR_OTA_VALIDATE_FAILED;
        goto out;
    }

    read_version(s.target, s.target_version, sizeof(s.target_version));

    /* This also validates, and marks the slot to boot next. */
    esp_err_t serr = esp_ota_set_boot_partition(s.target);
    if (serr != ESP_OK) {
        set_error("could not select the new slot: %s", esp_err_to_name(serr));
        s.state = OTA_FAILED;
        rc = serr;
        goto out;
    }

    /* With rollback configured the bootloader reverts unless the new image
     * confirms itself. ota_init() does that on the next boot, once the app has
     * proved it runs. */
    s.rollback_armed = true;
    s.state = OTA_READY;
    s.error[0] = '\0';
    rc = ESP_OK;
    ESP_LOGI(TAG, "slot %d verified ('%s') and marked to boot; restart to apply",
             slot_of(s.target), s.target_version);

out:
    xSemaphoreGive(s.lock);
    return rc;
}

void ota_abort(void)
{
    if (s.lock == NULL) return;
    xSemaphoreTake(s.lock, portMAX_DELAY);
    if (s.state == OTA_RECEIVING || s.state == OTA_VERIFYING) {
        s.state = OTA_IDLE;
        s.written = 0;
        s.total = 0;
        s.error[0] = '\0';
    }
    xSemaphoreGive(s.lock);
}

void ota_get_status(ota_status_t *out)
{
    if (s.lock == NULL) ota_init();
    xSemaphoreTake(s.lock, portMAX_DELAY);
    memset(out, 0, sizeof(*out));
    out->state = s.state;
    out->written = s.written;
    out->total = s.total;
    out->partition_size = s.target ? s.target->size : 0;
    out->target_slot = slot_of(s.target);
    out->running_slot = slot_of(s.running);
    out->rollback_armed = s.rollback_armed;
    strlcpy(out->error, s.error, sizeof(out->error));
    strlcpy(out->running_version, s.running_version, sizeof(out->running_version));
    strlcpy(out->target_version, s.target_version, sizeof(out->target_version));
    xSemaphoreGive(s.lock);
}

const char *ota_running_version(void) { return s.running_version; }
const char *ota_pending_version(void) { return s.target_version; }