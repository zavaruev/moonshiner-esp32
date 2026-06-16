(function () {
    /**
     * Moonshiner UI v24 (Refactored & Robust)
     */

    // 0. Global Error Handler
    window.onerror = function (msg, url, line, col, error) {
        const div = document.createElement('div');
        div.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; background: #cf6679; color: white; z-index: 9999; padding: 10px; font-family: monospace; font-size: 12px;';
        div.innerText = `JS ERROR: ${msg}\nLine: ${line}`;
        document.body.appendChild(div);
        return false;
    };

    console.log("Moonshiner UI v24 (Robust) loading...");

    // 1. Asset Injection
    function injectAssets() {
        const faviconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="256" fill="#000"/><g fill="#FFAB40"><path d="M156 300c0 120 44 160 100 160s100-40 100-160v-50h-200z"/><path d="M186 250c0-70 34-100 54-110v-30h32v30c20 10 54 40 54 110z"/><path d="M240 110V80c0-20 20-30 40-30h100c20 0 30 20 30 40v110h-20V90H272v20z"/></g><path d="M400 210q0 30 0 30c-10 10-10 20 0 30 10-10 10-20 0-30q0 0 0-30z" fill="#FFD700"/></svg>`;
        const dataURI = `data:image/svg+xml;utf8,${encodeURIComponent(faviconSVG)}`;

        const link = document.createElement("link");
        link.rel = "icon"; link.type = "image/svg+xml"; link.href = dataURI;
        document.head.appendChild(link);

        if (!document.querySelector('meta[name="viewport"]')) {
            const meta = document.createElement('meta');
            meta.name = 'viewport';
            meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
            document.head.appendChild(meta);
        }

        const style = document.createElement('style');
        style.textContent = `
            esp-app, .esp-app, body > esp-app { display: none !important; }
            * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
            body { background-color: #121212; color: #e0e0e0; font-family: 'Roboto', sans-serif; margin: 0; padding: 0; }
            :root {
                --bg: #121212; --card: #1e1e1e; --text: #e0e0e0; --text-dim: #a0a0a0;
                --accent: #03dac6; --danger: #cf6679; --success: #00c853; --warn: #ffab00;
            }
            #custom-app { max-width: 800px; margin: 0 auto; padding: 15px; display: grid; gap: 15px; }
            .card { background: var(--card); border-radius: 12px; padding: 15px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
            h2 { font-size: 1.1rem; color: var(--text-dim); margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px; }
            h3 { font-size: 0.9rem; color: var(--text-dim); margin: 10px 0; }
            
            .sensor-group { display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 15px; }
            .sensor-display { flex: 1; min-width: 120px; text-align: center; }
            .sensor-display .label { font-size: 0.8rem; color: var(--text-dim); margin-bottom: 5px; }
            .sensor-display .value { font-size: 2.2rem; font-weight: bold; color: var(--accent); }
            .sensor-controls { flex: 2; min-width: 200px; }
            
            .control-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
            .control-row label { font-size: 0.9rem; color: var(--text-dim); min-width: 110px; }
            .input-group { flex: 1; display: flex; gap: 8px; align-items: center; }
            
            input[type="number"] { background: #333; border: none; color: var(--text); padding: 8px; border-radius: 6px; font-size: 1rem; width: 100px; text-align: center; }
            input[type="range"] { flex-grow: 1; height: 6px; border-radius: 3px; background: #333; outline: none; -webkit-appearance: none; }
            input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: var(--accent); cursor: pointer; }
            
            .status-badge { padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; text-transform: uppercase; display: inline-block; margin-left: 5px; background: #333; color: var(--text-dim); }
            .status-active { background: rgba(0, 200, 83, 0.2); color: var(--success); }
            .status-alarm { background: rgba(207, 102, 121, 0.2); color: var(--danger); animation: pulse 1s infinite; }
            @keyframes pulse { 50% { opacity: 0.5; } }
            
            .switch { position: relative; display: inline-block; width: 36px; height: 18px; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #333; transition: .4s; border-radius: 18px; }
            .slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 2px; bottom: 2px; background-color: white; transition: .4s; border-radius: 50%; }
            input:checked + .slider { background-color: var(--warn); }
            input:checked + .slider:before { transform: translateX(18px); }
            
            @media (max-width: 600px) {
                .sensor-group { flex-direction: column; }
                .control-row { flex-direction: column; align-items: stretch; gap: 5px; }
                input[type="number"] { width: 100%; }
            }
        `;
        document.head.appendChild(style);
    }

    // 2. UI Initialization
    function initUI() {
        if (document.getElementById('custom-app')) return;

        injectAssets();

        const app = document.createElement('div');
        app.id = 'custom-app';
        document.body.appendChild(app);

        // Added default values to inputs to prevent empty fields on load
        app.innerHTML = `
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <h2>Moonshiner v24 <span id="hb" style="color:var(--success); opacity:0.2;">●</span></h2>
                        <div style="font-size: 0.8rem; color: #888;">
                            <span id="conn-status" style="color: var(--warn)">Connecting...</span> | 
                            Up: <span id="val-uptime">--</span> | 
                            WiFi: <span id="val-wifi">--</span> dBm |
                            Heap: <span id="val-heap">--</span>
                        </div>
                        <div style="font-size: 0.7rem; color: #666; margin-top: 2px;">
                            Reset: <span id="val-reset">--</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                        <span id="st-distilling" class="status-badge">Distilling</span>
                        <span id="st-heating" class="status-badge">Heating</span>
                        <span id="st-alarm" class="status-badge">ALARM</span>
                    </div>
                </div>
                
                <div style="margin-top: 10px; display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.05); padding: 5px 10px; border-radius: 8px;">
                    <span style="font-size: 1.2rem;">🔊</span>
                    <input type="range" id="in-vol-slider" min="0" max="100" step="1" value="100" style="width: 80px;">
                    <input type="number" id="in-vol" value="100" style="display:none;">
                </div>

                <div style="margin-top: 15px; text-align: center; font-size: 1.1rem; color: var(--text); background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 15px;">
                    <span id="val-msg">Подключение...</span>
                    <button id="btn-restart" style="
                        background: linear-gradient(135deg, #ff6b6b, #ee5a24);
                        border: none;
                        color: white;
                        padding: 8px 16px;
                        border-radius: 20px;
                        font-size: 0.85rem;
                        font-weight: bold;
                        cursor: pointer;
                        box-shadow: 0 4px 15px rgba(238, 90, 36, 0.4);
                        transition: all 0.3s ease;
                        display: none;
                    " onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 20px rgba(238, 90, 36, 0.6)';"
                       onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 15px rgba(238, 90, 36, 0.4)';">
                        🔄 Restart
                    </button>
                </div>
            </div>

            <div class="card">
                <h2>Column Control</h2>
                <div class="sensor-group">
                    <div class="sensor-display">
                        <div class="label">Column Temp</div>
                        <div class="value"><span id="val-col-temp">--</span></div>
                    </div>
                    <div class="sensor-controls">
                        <div class="control-row">
                            <label>Target (°C)</label>
                            <div class="input-group">
                                <input type="number" id="in-target" step="0.1" min="0" max="100" value="95.0">
                                <input type="range" id="in-target-slider" min="0" max="100" step="0.1" value="95.0">
                            </div>
                        </div>
                        <div class="control-row">
                            <label>Delta</label>
                            <div class="input-group">
                                <input type="number" id="in-delta" step="0.1" min="0" max="5" value="0.3">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="control-row">
                    <label>Coef Otbora</label>
                    <div class="input-group">
                        <input type="number" id="in-coef" step="0.05" min="0" max="1" value="1.0">
                        <input type="range" id="in-coef-slider" min="0" max="1" step="0.05" value="1.0">
                    </div>
                </div>
                
                <div class="control-row">
                    <label>Use Reduction</label>
                    <label class="switch">
                        <input type="checkbox" id="sw-reduction" checked>
                        <span class="slider"></span>
                    </label>
                </div>

                <h3>Valves (PWM 0-1023)</h3>
                <div class="control-row">
                    <label>Valve High</label>
                    <div class="input-group">
                        <input type="number" id="in-vh" step="1" min="0" max="1023" value="0">
                        <input type="range" id="in-vh-slider" min="0" max="1023" step="1" value="0">
                    </div>
                </div>
                <div class="control-row">
                    <label>Valve Low</label>
                    <div class="input-group">
                        <input type="number" id="in-vl" step="1" min="0" max="1023" value="0">
                        <input type="range" id="in-vl-slider" min="0" max="1023" step="1" value="0">
                    </div>
                </div>
                <div class="control-row">
                    <label>Disable Closing</label>
                    <label class="switch">
                        <input type="checkbox" id="sw-disable-close">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>

            <div class="card">
                <h2>Tank Control</h2>
                <div class="sensor-group">
                    <div class="sensor-display">
                        <div class="label">Tank Temp</div>
                        <div class="value"><span id="val-tank-temp">--</span></div>
                    </div>
                    <div class="sensor-controls">
                        <div class="control-row">
                            <label>Max Tank</label>
                            <div class="input-group">
                                <input type="number" id="in-max-tank" step="0.1" min="0" max="100" value="99.0">
                            </div>
                        </div>
                    </div>
                </div>
                <div class="control-row">
                    <label>Heater Power</label>
                    <div class="input-group">
                        <input type="number" id="in-heat" step="1" min="0" max="1023" value="0">
                        <input type="range" id="in-heat-slider" min="0" max="1023" step="1" value="0">
                    </div>
                </div>
            </div>
        `;

        // 3. Logic & Data Binding

        // Helper for robust number parsing
        const parseNum = (v) => {
            const n = parseFloat(v);
            return isNaN(n) ? null : n;
        };

        // Entity Mapping - Keys MUST match ESPHome entity IDs exactly (domain-snake_case_name)
        // ESPHome Web Server v3 uses the 'name' field to generate IDs, not the 'id' field
        const entities = {
            // Sensors (read-only displays)
            'sensor-column_temperature': { el: 'val-col-temp', fmt: v => parseNum(v) !== null ? parseNum(v).toFixed(4) + ' °C' : '--' },
            'sensor-tank_temperature': { el: 'val-tank-temp', fmt: v => parseNum(v) !== null ? parseNum(v).toFixed(1) + ' °C' : '--' },
            'sensor-uptime': { el: 'val-uptime', fmt: v => { const s = parseInt(v); return isNaN(s) ? '--' : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`; } },
            'sensor-wifi_signal': { el: 'val-wifi', fmt: v => parseNum(v) !== null ? Math.round(parseNum(v)) : '--' },
            'sensor-free_heap': { el: 'val-heap', fmt: v => parseNum(v) !== null ? Math.round(parseNum(v) / 1024) + 'KB' : '--' },

            // Text Sensors
            'text_sensor-status_message': { el: 'val-msg' },
            'text_sensor-reset_reason': { el: 'val-reset' },

            // Number Inputs (user controls)
            'number-target_column_temp': { in: 'in-target', sl: 'in-target-slider', api: 'number/target_column_temp' },
            'number-delta': { in: 'in-delta', api: 'number/delta' },
            'number-coef_otbora': { in: 'in-coef', sl: 'in-coef-slider', api: 'number/coef_otbora' },
            'number-max_tank_temp': { in: 'in-max-tank', api: 'number/max_tank_temp' },
            'number-valve_high_setting': { in: 'in-vh', sl: 'in-vh-slider', api: 'number/valve_high_setting' },
            'number-valve_low_setting': { in: 'in-vl', sl: 'in-vl-slider', api: 'number/valve_low_setting' },
            'number-heater_power': { in: 'in-heat', sl: 'in-heat-slider', api: 'number/heater_power' },
            'number-buzzer_volume': { in: 'in-vol', sl: 'in-vol-slider', api: 'number/buzzer_volume' },

            // Switches
            'switch-use_reduction_coefficient': { sw: 'sw-reduction', api: 'switch/use_reduction_coefficient' },
            'switch-disable_upper_valve_closing': { sw: 'sw-disable-close', api: 'switch/disable_upper_valve_closing' },

            // Binary Sensors (status indicators)
            'binary_sensor-distilling_status': { st: 'st-distilling' },
            'binary_sensor-heating_status': { st: 'st-heating' },
            'binary_sensor-alarm_status': { st: 'st-alarm', cls: 'status-alarm' }
        };

        // Debounce helper
        function debounce(func, wait) {
            let timeout;
            return function (...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        }

        // Setup Event Listeners for User Inputs
        // CRITICAL: Create debounced functions ONCE per element, then reuse them
        Object.keys(entities).forEach(entityId => {
            const cfg = entities[entityId];

            // Handle Number Inputs
            if (cfg.in) {
                const input = document.getElementById(cfg.in);
                const slider = cfg.sl ? document.getElementById(cfg.sl) : null;
                const apiPath = cfg.api; // Use explicit API path from config

                if (input && apiPath) {
                    // Create debounced fetch function ONCE (not inside event handler!)
                    const debouncedUpdate = debounce((value) => {
                        fetch(`/${apiPath}/set?value=${value}`, { method: 'POST' })
                            .catch(err => console.error(`Failed to update ${entityId}:`, err));
                    }, 400);

                    // Input field: update on change (when user finishes typing)
                    input.addEventListener('change', e => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) debouncedUpdate(val);
                    });

                    // Sync slider with input
                    if (slider) {
                        input.addEventListener('input', e => {
                            slider.value = e.target.value;
                        });

                        // Slider: update on drag (debounced to prevent DDOS)
                        slider.addEventListener('input', e => {
                            input.value = e.target.value;
                            debouncedUpdate(e.target.value);
                        });
                    }
                }
            }

            // Handle Switches
            if (cfg.sw) {
                const switchEl = document.getElementById(cfg.sw);
                const apiPath = cfg.api;

                if (switchEl && apiPath) {
                    switchEl.addEventListener('change', e => {
                        const cmd = e.target.checked ? 'turn_on' : 'turn_off';
                        fetch(`/${apiPath}/${cmd}`, { method: 'POST' })
                            .catch(err => console.error(`Failed to toggle ${entityId}:`, err));
                    });
                }
            }
        });

        // Restart Process Button Handler
        const restartBtn = document.getElementById('btn-restart');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                fetch('/button/restart_process/press', { method: 'POST' })
                    .then(() => {
                        restartBtn.style.display = 'none';
                        console.log('[UI] Restart Process button pressed');
                    })
                    .catch(err => console.error('Failed to restart process:', err));
            });
        }

        // EventSource for real-time updates
        const source = new EventSource("/events");
        let connTimer;

        function setConnected(state) {
            const el = document.getElementById('conn-status');
            const hb = document.getElementById('hb');
            if (state) {
                el.textContent = 'Connected';
                el.style.color = 'var(--success)';
                if (hb) { hb.style.opacity = 1; setTimeout(() => hb.style.opacity = 0.2, 200); }
            } else {
                el.textContent = 'Disconnected';
                el.style.color = 'var(--danger)';
            }
        }

        source.addEventListener('state', e => {
            setConnected(true);
            clearTimeout(connTimer);
            connTimer = setTimeout(() => setConnected(false), 5000);

            const data = JSON.parse(e.data);

            // DEBUG: Log ALL incoming data
            console.log(`[EventSource] ID: ${data.id}, State: "${data.state}", Type: ${typeof data.state}`);

            // Debug: log unknown entity IDs
            if (!entities[data.id]) {
                console.warn(`[EventSource] Unknown Entity ID: ${data.id}, State: ${data.state}`);
                return;
            }

            const cfg = entities[data.id];

            // Update Text Elements (sensors, status)
            if (cfg.el) {
                const el = document.getElementById(cfg.el);
                if (el) {
                    const newText = cfg.fmt ? cfg.fmt(data.state) : data.state;
                    console.log(`[Update Text] ${data.id} -> ${cfg.el}: "${newText}"`);
                    el.textContent = newText;

                    // Show/hide restart button based on status message
                    if (data.id === 'text_sensor-status_message') {
                        const restartBtn = document.getElementById('btn-restart');
                        if (restartBtn) {
                            restartBtn.style.display = (data.state === 'DONE') ? 'inline-block' : 'none';
                        }
                    }
                }
            }

            // Update Number Inputs (only if not focused AND value is meaningful)
            if (cfg.in) {
                const input = document.getElementById(cfg.in);
                const currentValue = input ? input.value : 'N/A';

                console.log(`[Update Input] ${data.id} -> ${cfg.in}: Current="${currentValue}", New="${data.state}", Focused=${document.activeElement === input}`);

                if (input && document.activeElement !== input) {
                    // Only update if we have a valid, non-empty value
                    if (data.state !== null && data.state !== '' && data.state !== undefined) {
                        // CRITICAL FIX: ESPHome sends values with units (e.g., "95.0000 °C")
                        // HTML <input type="number"> only accepts pure numbers
                        // Extract numeric part from string
                        let numericValue = data.state;

                        // If state is a string, try to extract the number
                        if (typeof data.state === 'string') {
                            // Remove units and extra whitespace, keep only number
                            // Match: optional minus, digits, optional decimal point and digits
                            const match = data.state.match(/-?\d+\.?\d*/);
                            if (match) {
                                numericValue = match[0];
                            }
                        }

                        const numVal = parseFloat(numericValue);
                        if (!isNaN(numVal)) {
                            console.log(`[Input UPDATED] ${cfg.in}: "${currentValue}" -> "${numericValue}" (from "${data.state}")`);
                            input.value = numericValue;

                            // Sync slider if exists and not focused
                            if (cfg.sl) {
                                const slider = document.getElementById(cfg.sl);
                                if (slider && document.activeElement !== slider) {
                                    slider.value = numericValue;
                                }
                            }
                        } else {
                            console.warn(`[Input SKIPPED] ${cfg.in}: Invalid number "${data.state}"`);
                        }
                    } else {
                        console.warn(`[Input SKIPPED] ${cfg.in}: Empty/null value "${data.state}"`);
                    }
                }
            }

            // Update Switches
            if (cfg.sw) {
                const el = document.getElementById(cfg.sw);
                if (el) {
                    const newState = (data.state === 'ON');
                    console.log(`[Update Switch] ${data.id} -> ${cfg.sw}: ${newState}`);
                    el.checked = newState;
                }
            }

            // Update Status Badges
            if (cfg.st) {
                const el = document.getElementById(cfg.st);
                if (el) {
                    const activeClass = cfg.cls || 'status-active';
                    if (data.state === 'ON') {
                        el.classList.add(activeClass);
                    } else {
                        el.classList.remove(activeClass);
                    }
                }
            }
        });

        source.onerror = () => {
            console.error('[EventSource] Connection error');
            setConnected(false);
        };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI);
    else initUI();

})();
