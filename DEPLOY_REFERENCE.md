# Quick Deployment Reference

## ✅ Correct Deployment Method

```bash
cd /home/alexander/Desktop/esphome_devices/moonshiner_latest
./deploy.sh moonshiner_esp32_optimized.yaml
```

**That's it!** The script handles:
- File transfer to ESPHome server (192.168.22.102)
- Secrets.yaml symlinking
- Docker-based compilation
- OTA upload to device (192.168.22.231)

## ❌ Don't Do This

- ❌ Manual `docker run` commands
- ❌ Manual `scp` file transfers
- ❌ Local `esphome` compilation
- ❌ Reinventing the deployment workflow

## Infrastructure Reminder

| Component | Details |
|-----------|---------|
| **ESPHome Server** | 192.168.22.102 |
| **Moonshiner Device** | 192.168.22.231 |
| **Deploy Script** | `/home/alexander/Desktop/esphome_devices/moonshiner_latest/deploy.sh` |
| **Primary Config** | `moonshiner_esp32_optimized.yaml` |
| **UI File** | `moonshiner_ui_v22.js` |

## Current Status (2025-11-29)

✅ **Deployed**: Optimized firmware with display scrolling fix  
✅ **Active Config**: `moonshiner_esp32_optimized.yaml`  
⏳ **Awaiting**: User verification of display

## Display Fix Applied

```yaml
# In on_boot section:
- lambda: |-
    id(oled_display).command(0x2E);  # Disable hardware scrolling
```

SSD1306 command `0x2E` = Deactivate scroll function
