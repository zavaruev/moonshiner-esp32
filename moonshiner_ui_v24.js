(function () {
    window.onerror = function (msg, url, line, col, error) {
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:#1d1d1f;color:#fff;z-index:9999;padding:12px 20px;font-family:system-ui,sans-serif;font-size:14px;border-bottom:2px solid #0066cc';
        div.innerText = 'Error: ' + msg;
        document.body.appendChild(div);
        return false;
    };

    function injectAssets() {
        const meta = document.querySelector('meta[name="viewport"]');
        if (!meta) {
            const m = document.createElement('meta');
            m.name = 'viewport';
            m.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
            document.head.appendChild(m);
        }

        // Themed favicon — distillation flask
        const storedTheme = localStorage.getItem('theme');
        const initialTheme = storedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        const fg = initialTheme === 'dark' ? '#2997ff' : '#0066cc';
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M19 4v7l8 12a4 4 0 0 1-3.33 6H8.33A4 4 0 0 1 5 23l8-12V4h6z" fill="none" stroke="' + fg + '" stroke-width="2" stroke-linejoin="round"/><path d="M5 20h22" stroke="' + fg + '" stroke-width="1.5"/><path d="M11 4h10" stroke="' + fg + '" stroke-width="2" stroke-linecap="round"/><rect x="9" y="16" width="14" height="6" rx="1" fill="' + fg + '" opacity="0.25"/></svg>';
        const link = document.querySelector('link[rel="icon"]');
        if (link) link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
        else {
            const l = document.createElement('link');
            l.rel = 'icon'; l.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
            document.head.appendChild(l);
        }

        const style = document.createElement('style');
        style.textContent = `
            esp-app, .esp-app, body > esp-app { display: none !important; }
            *, *::before, *::after { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

            :root {
                --font-display: "SF Pro Display", system-ui, -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
                --font-text: "SF Pro Text", system-ui, -apple-system, BlinkMacSystemFont, "Inter", sans-serif;

                --primary: #0066cc;
                --primary-hover: #0071e3;
                --primary-on-dark: #2997ff;
                --ink: #1d1d1f;
                --ink-muted: #7a7a7a;
                --ink-subtle: #a1a1a6;
                --canvas: #ffffff;
                --canvas-alt: #f5f5f7;
                --card-bg: #ffffff;
                --card-border: rgba(0,0,0,0.08);
                --divider: #e0e0e0;
                --divider-soft: #f0f0f0;
                --surface-pearl: #fafafc;
                --badge-bg: rgba(0,0,0,0.05);
                --danger: #ff3b30;
                --success: #34c759;
                --warn: #ff9f0a;
                --input-bg: #f5f5f7;
                --input-border: rgba(0,0,0,0.08);
                --shadow-sm: 0 1px 3px rgba(0,0,0,0.04);
                --radius-sm: 8px;
                --radius-md: 11px;
                --radius-lg: 18px;
                --radius-pill: 9999px;
                --body-font: var(--font-text);
                --body-size: 17px;
                --body-leading: 1.47;
                --body-tracking: -0.374px;
            }

            [data-theme="dark"] {
                --primary: #2997ff;
                --primary-hover: #66bbff;
                --primary-on-dark: #2997ff;
                --ink: #f5f5f7;
                --ink-muted: #a1a1a6;
                --ink-subtle: #6e6e73;
                --canvas: #000000;
                --canvas-alt: #1d1d1f;
                --card-bg: #1d1d1f;
                --card-border: rgba(255,255,255,0.08);
                --divider: #333333;
                --divider-soft: #2a2a2c;
                --surface-pearl: #272729;
                --badge-bg: rgba(255,255,255,0.08);
                --danger: #ff453a;
                --success: #30d158;
                --warn: #ffd60a;
                --input-bg: #2a2a2c;
                --input-border: rgba(255,255,255,0.08);
                --shadow-sm: 0 1px 3px rgba(0,0,0,0.2);
            }

            body {
                margin: 0;
                padding: 0;
                background: var(--canvas);
                color: var(--ink);
                font-family: var(--body-font);
                font-size: var(--body-size);
                line-height: var(--body-leading);
                letter-spacing: var(--body-tracking);
                -webkit-font-smoothing: antialiased;
                transition: background 0.3s, color 0.3s;
            }

            #custom-app {
                max-width: 800px;
                margin: 0 auto;
                padding: 20px 16px 40px;
                display: grid;
                gap: 16px;
            }

            .card {
                background: var(--card-bg);
                border: 1px solid var(--card-border);
                border-radius: var(--radius-lg);
                padding: 20px;
                box-shadow: var(--shadow-sm);
                transition: background 0.3s, border-color 0.3s, box-shadow 0.3s;
            }

            .card-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 14px;
                flex-wrap: wrap;
                gap: 12px;
            }

            .card-title {
                font-family: var(--font-display);
                font-size: 20px;
                font-weight: 600;
                letter-spacing: -0.374px;
                color: var(--ink);
                margin: 0;
            }

            .card-section-title {
                font-family: var(--font-text);
                font-size: 14px;
                font-weight: 600;
                letter-spacing: -0.224px;
                color: var(--ink-muted);
                margin: 20px 0 12px;
                text-transform: uppercase;
            }

            .card-section-title:first-child { margin-top: 0; }

            /* === Top Bar === */
            .top-bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
            }

            .top-bar-left {
                display: flex;
                align-items: center;
            }
            .top-bar-left #conn-status {
                font-size: 13px;
                color: var(--ink-muted);
                font-weight: 500;
            }

            .top-bar-right {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 6px;
                flex-shrink: 0;
            }
            .top-bar-utils {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .conn-dot {
                display: inline-block;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: var(--success);
                transition: all 0.2s ease;
            }

            .conn-dot.disconnected { background: var(--danger); }

            .badge-row {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
            }

            .badge {
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.3px;
                padding: 4px 10px;
                border-radius: var(--radius-pill);
                background: var(--badge-bg);
                color: var(--ink-muted);
                text-transform: uppercase;
                border: 1px solid var(--card-border);
                transition: all 0.3s;
            }

            .badge.on {
                background: rgba(0, 102, 204, 0.12);
                color: var(--primary);
                border-color: rgba(0, 102, 204, 0.2);
            }

            [data-theme="dark"] .badge.on {
                background: rgba(41, 151, 255, 0.12);
                border-color: rgba(41, 151, 255, 0.2);
            }

            .badge.danger {
                background: rgba(255, 59, 48, 0.12);
                color: var(--danger);
                border-color: rgba(255, 59, 48, 0.2);
                animation: pulse 1s infinite;
            }

            @keyframes pulse { 50% { opacity: 0.5; } }

            /* === Status Message === */
            .status-bar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                flex-wrap: wrap;
            }

            .status-msg {
                font-family: var(--font-display);
                font-size: 13px;
                font-weight: 500;
                letter-spacing: 0;
                color: var(--ink);
            }

            .status-msg.done { color: var(--primary); }

            /* === Buttons === */
            .btn {
                font-family: var(--font-text);
                font-size: 14px;
                font-weight: 400;
                letter-spacing: -0.224px;
                padding: 8px 16px;
                border-radius: var(--radius-pill);
                border: none;
                cursor: pointer;
                transition: all 0.2s;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                white-space: nowrap;
                text-decoration: none;
            }

            .btn:active { transform: scale(0.95); }

            .btn-primary {
                background: var(--primary);
                color: #fff;
            }

            .btn-primary:hover { background: var(--primary-hover); }

            .btn-ghost {
                background: transparent;
                color: var(--primary);
                border: 1px solid var(--primary);
            }

            .btn-ghost:hover { background: rgba(0, 102, 204, 0.08); }

            [data-theme="dark"] .btn-ghost:hover { background: rgba(41, 151, 255, 0.08); }

            .btn-danger {
                background: var(--danger);
                color: #fff;
            }

            .btn-danger:hover { opacity: 0.9; }

            .btn-icon {
                width: 36px;
                height: 36px;
                padding: 0;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                background: var(--input-bg);
                border: 1px solid var(--card-border);
                color: var(--ink);
                font-size: 18px;
            }

            .btn-icon:active { transform: scale(0.9); }

            .theme-toggle {
                position: relative;
                width: 32px;
                height: 32px;
                padding: 0;
                border-radius: 50%;
                border: 1px solid var(--card-border);
                background: var(--card-bg);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 15px;
                transition: all 0.2s;
                flex-shrink: 0;
            }

            .theme-toggle:active { transform: scale(0.9); }

            .theme-toggle .icon { line-height: 1; }

            /* === Sensors === */
            .sensor-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                margin-bottom: 0;
            }

            .sensor-item {
                background: var(--input-bg);
                border-radius: var(--radius-md);
                padding: 10px 12px;
                text-align: center;
                border: 1px solid var(--card-border);
                position: relative;
                overflow: hidden;
            }

            .sensor-item .label {
                font-size: 11px;
                font-weight: 400;
                color: var(--ink-muted);
                letter-spacing: 0;
                margin-bottom: 1px;
            }

            .sensor-item .value {
                font-family: var(--font-display);
                font-size: 22px;
                font-weight: 600;
                letter-spacing: -0.374px;
                color: var(--ink);
            }

            .sensor-item .temp-ring {
                position: absolute;
                bottom: 4px;
                right: 6px;
                width: 34px;
                height: 34px;
                opacity: 0.25;
            }

            .sensor-item.temp-hot .value { color: var(--danger); }

            /* === Skeleton === */
            .skel {
                display: inline-block;
                background: var(--divider);
                border-radius: 4px;
                color: transparent !important;
                animation: skel-pulse 1.2s ease-in-out infinite;
                min-width: 1.2em;
                user-select: none;
                pointer-events: none;
            }
            @keyframes skel-pulse { 50% { opacity: 0.3; } }
            .sensor-item.temp-warm .value { color: var(--warn); }
            .sensor-item.temp-cold .value { color: var(--primary); }

            @media (max-width: 734px) {
                .sensor-item .value { font-size: 28px; }
            }
            @media (max-width: 419px) {
                .sensor-item .value { font-size: 24px; }
            }

            /* === Controls === */
            .control-group {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
            }

            .control-item {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .control-item.full { grid-column: 1 / -1; }

            .control-item label {
                font-size: 14px;
                font-weight: 400;
                color: var(--ink-muted);
                letter-spacing: 0;
            }

            .input-row {
                display: flex;
                align-items: center;
                gap: 10px;
                min-width: 0;
            }
            .input-row > * { min-width: 0; }

            .number-wrap {
                position: relative;
                display: inline-flex;
                align-items: center;
                flex-shrink: 0;
            }
            .number-unit {
                position: absolute;
                right: 8px;
                font-size: 11px;
                font-weight: 400;
                color: var(--ink-muted);
                pointer-events: none;
                line-height: 1;
            }
            input[type="number"] {
                font-family: var(--font-text);
                font-size: 15px;
                font-weight: 400;
                width: 80px;
                max-width: 80px;
                padding: 8px 6px;
                border-radius: var(--radius-sm);
                border: 1px solid var(--input-border);
                background: var(--input-bg);
                color: var(--ink);
                text-align: center;
                outline: none;
                transition: border-color 0.2s;
            }
            input[type="number"].has-unit {
                padding-right: 24px;
            }

            .btn-stepper {
                width: 36px;
                height: 36px;
                padding: 0;
                border-radius: 50%;
                background: var(--input-bg);
                border: 1px solid var(--input-border);
                color: var(--primary);
                font-size: 18px;
                font-weight: 400;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                flex-shrink: 0;
                transition: all 0.15s;
                line-height: 1;
            }

            .btn-stepper:active { transform: scale(0.85); background: var(--primary); color: #fff; }

            .btn-stepper.sending { animation: send-flash 0.4s ease; }
            input.sending { border-color: var(--primary) !important; box-shadow: 0 0 0 3px rgba(0,102,204,0.15) !important; }
            [data-theme="dark"] input.sending { box-shadow: 0 0 0 3px rgba(41,151,255,0.15) !important; }
            .delta-inline {
                display: flex;
                align-items: center;
                gap: 4px;
                flex-shrink: 0;
            }
            .delta-inline .delta-label {
                font-size: 12px;
                font-weight: 600;
                color: var(--ink-muted);
            }
            .delta-inline input[type="number"] {
                width: 50px;
                max-width: 50px;
                padding: 6px 4px;
                font-size: 13px;
            }

            @keyframes send-flash { 0% { background: var(--primary); color: #fff; } 100% { background: var(--input-bg); color: var(--primary); } }

            input[type="number"]:focus {
                border-color: var(--primary);
                box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.12);
            }

            [data-theme="dark"] input[type="number"]:focus {
                box-shadow: 0 0 0 3px rgba(41, 151, 255, 0.12);
            }

            input[type="range"] {
                flex: 1;
                height: 4px;
                border-radius: 2px;
                background: var(--divider);
                outline: none;
                -webkit-appearance: none;
                appearance: none;
                min-width: 0;
            }

            input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: var(--primary);
                cursor: pointer;
                border: 2px solid var(--card-bg);
                box-shadow: 0 1px 4px rgba(0,0,0,0.2);
                transition: transform 0.15s;
            }

            input[type="range"]::-webkit-slider-thumb:active { transform: scale(1.15); }

            input[type="range"]::-moz-range-thumb {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: var(--primary);
                cursor: pointer;
                border: 2px solid var(--card-bg);
                box-shadow: 0 1px 4px rgba(0,0,0,0.2);
            }

            .slider-wrap {
                position: relative;
                flex: 1;
                display: flex;
                align-items: center;
                align-self: stretch;
            }
            .slider-wrap input[type="range"] {
                width: 100%;
            }
            .ss-marker {
                position: absolute;
                top: 50%;
                width: 4px;
                height: 4px;
                background: var(--primary);
                transform: translate(-50%, -50%);
                pointer-events: none;
                opacity: 0.3;
                border-radius: 50%;
            }
            .ss-label {
                position: absolute;
                top: calc(50% + 10px);
                left: 50%;
                transform: translateX(-50%);
                font-family: var(--font-text);
                font-size: 10px;
                font-weight: 400;
                color: var(--ink-muted);
                white-space: nowrap;
                letter-spacing: -0.08px;
                line-height: 1;
                cursor: pointer;
                transition: color 0.15s;
            }
            .ss-label:hover { color: var(--primary); }

            .switch-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 8px 0;
            }

            .switch-row label {
                font-size: 14px;
                font-weight: 400;
                color: var(--ink-muted);
                cursor: pointer;
            }

            .switch {
                position: relative;
                display: inline-block;
                width: 44px;
                height: 26px;
                flex-shrink: 0;
            }

            .switch input { opacity: 0; width: 0; height: 0; }

            .switch .track {
                position: absolute;
                cursor: pointer;
                top: 0; left: 0; right: 0; bottom: 0;
                background: #e0e0e0;
                border-radius: 13px;
                transition: background 0.3s;
            }

            [data-theme="dark"] .switch .track { background: #444; }

            .switch .track::before {
                position: absolute;
                content: "";
                height: 22px; width: 22px;
                left: 2px; bottom: 2px;
                background: #fff;
                border-radius: 50%;
                transition: transform 0.25s;
                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            }

            .switch input:checked + .track { background: var(--primary); }
            .switch input:checked + .track::before { transform: translateX(18px); }

            /* === Volume (mini top-bar) === */
            .vol-mini {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .vol-mini .vol-icon {
                font-size: 12px;
                color: var(--ink-muted);
                cursor: pointer;
                transition: color 0.15s;
            }
            .vol-mini .vol-icon:hover { color: var(--primary); }
            .vol-mini input[type="range"] {
                width: 52px;
                height: 3px;
            }
            .vol-mini .vol-val {
                font-size: 10px;
                font-weight: 600;
                color: var(--ink-muted);
                font-variant-numeric: tabular-nums;
                min-width: 18px;
                text-align: right;
            }

            /* === Responsive === */
            @media (max-width: 734px) {
                #custom-app { padding: 12px; gap: 12px; }

                .card { padding: 16px; border-radius: 14px; }

                .top-bar { flex-wrap: wrap; }

                .sensor-grid { grid-template-columns: 1fr; }

                .control-group { grid-template-columns: 1fr; }

                .sensor-item .value { font-size: 24px; }

                .status-bar { flex-direction: column; align-items: flex-start; }
            }

            @media (max-width: 419px) {
                #custom-app { padding: 8px; gap: 8px; }

                .card { padding: 12px; }

                .top-bar { flex-direction: column; align-items: flex-start; }

                .card-title { font-size: 18px; }

                .sensor-item { padding: 10px 12px; }
                .sensor-item .value { font-size: 20px; }

                input[type="number"] { width: 60px; font-size: 13px; padding: 6px 6px; }
                .btn-stepper { width: 30px; height: 30px; font-size: 15px; }
            }
        `;
        document.head.appendChild(style);
    }

    function initUI() {
        if (document.getElementById('custom-app')) return;

        injectAssets();

        const app = document.createElement('div');
        app.id = 'custom-app';
        document.body.appendChild(app);

        app.innerHTML = `
            <div class="card">
                <div class="top-bar">
                    <div class="top-bar-left">
                        <span id="conn-status"><span class="conn-dot disconnected"></span> Connecting...</span>
                    </div>
                    <div class="top-bar-right">
                        <div class="top-bar-utils">
                            <div class="vol-mini">
                                <span class="vol-icon" id="vol-icon">&#9835;</span>
                                <input type="range" id="in-vol-slider" min="0" max="100" step="1" value="100">
                                <span class="vol-val" id="vol-val">100</span>
                                <input type="number" id="in-vol" value="100" style="display:none;">
                            </div>
                            <button class="theme-toggle" id="btn-theme" aria-label="Toggle theme">
                                <span class="icon">&#9790;</span>
                            </button>
                        </div>
                        <div class="badge-row">
                            <span id="st-distilling" class="badge">Distilling</span>
                            <span id="st-heating" class="badge">Heating</span>
                            <span id="st-alarm" class="badge">Alarm</span>
                        </div>
                    </div>
                </div>

                <div class="status-bar" style="margin-top:8px;">
                    <span class="status-msg" id="val-msg">Connecting...</span>
                    <button class="btn btn-danger" id="btn-restart" style="display:none;">Restart</button>
                </div>
            </div>

            <div class="card">
                <div class="card-header" style="margin-bottom:12px">
                    <h2 class="card-title">Temperatures</h2>
                </div>
                <div class="sensor-grid">
                    <div class="sensor-item" id="col-temp-card">
                        <div class="label">Column</div>
                        <div class="value"><span id="val-col-temp" class="skel">--</span></div>
                        <svg class="temp-ring" viewBox="0 0 34 34" id="col-temp-ring">
                            <circle cx="17" cy="17" r="14" fill="none" stroke="var(--divider)" stroke-width="2.5"/>
                            <circle cx="17" cy="17" r="14" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-dasharray="88" stroke-dashoffset="88" transform="rotate(-90 17 17)" id="col-temp-arc"/>
                        </svg>
                    </div>
                    <div class="sensor-item" id="tank-temp-card">
                        <div class="label">Tank</div>
                        <div class="value"><span id="val-tank-temp" class="skel">--</span></div>
                        <svg class="temp-ring" viewBox="0 0 34 34" id="tank-temp-ring">
                            <circle cx="17" cy="17" r="14" fill="none" stroke="var(--divider)" stroke-width="2.5"/>
                            <circle cx="17" cy="17" r="14" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-dasharray="88" stroke-dashoffset="88" transform="rotate(-90 17 17)" id="tank-temp-arc"/>
                        </svg>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">Column Control</h2>
                </div>

                <div class="control-group">
                    <div class="control-item full">
                        <label>Target Temperature</label>
                        <div class="input-row">
                            <button class="btn btn-stepper" data-stepper="in-target" data-step="-0.1">&minus;</button>
                            <input type="number" id="in-target" step="0.01" min="0" max="100" value="95.00">
                            <input type="range" id="in-target-slider" min="0" max="100" step="0.01" value="95.00">
                            <button class="btn btn-stepper" data-stepper="in-target" data-step="0.1">&plus;</button>
                            <div class="delta-inline">
                                <span class="delta-label">Δ</span>
                                <input type="number" id="in-delta" step="0.01" min="0" max="5" value="0.30">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="control-item full" style="margin-top:12px;">
                    <label>Coef Otbora</label>
                    <div class="input-row">
                        <input type="number" id="in-coef" step="0.05" min="0" max="1" value="1.0">
                        <input type="range" id="in-coef-slider" min="0" max="1" step="0.05" value="1.0">
                    </div>
                </div>

                <div style="margin-top:8px;">
                    <div class="switch-row" style="padding:4px 0">
                        <label for="sw-reduction">Use Reduction</label>
                        <label class="switch">
                            <input type="checkbox" id="sw-reduction" checked>
                            <span class="track"></span>
                        </label>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">Valves & Heater</h2>
                </div>

                <div class="control-group">
                    <div class="control-item">
                        <label>Valve High</label>
                        <div class="input-row">
                            <div class="number-wrap">
                                <input type="number" id="in-vh" class="has-unit" step="1" min="0" max="100" value="0">
                                <span class="number-unit">%</span>
                            </div>
                            <div class="slider-wrap">
                                <input type="range" id="in-vh-slider" min="0" max="100" step="1" value="0">
                                <div class="ss-marker" style="left:2%"></div>
                                <div class="ss-label" style="left:2%" data-target="in-vh" data-value="2">Heads</div>
                                <div class="ss-marker" style="left:21.5%"></div>
                                <div class="ss-label" style="left:21.5%" data-target="in-vh" data-value="22">Hearts</div>
                            </div>
                        </div>
                    </div>
                    <div class="control-item">
                        <label>Valve Low</label>
                        <div class="input-row">
                            <div class="number-wrap">
                                <input type="number" id="in-vl" class="has-unit" step="1" min="0" max="100" value="0">
                                <span class="number-unit">%</span>
                            </div>
                            <div class="slider-wrap">
                                <input type="range" id="in-vl-slider" min="0" max="100" step="1" value="0">
                                <div class="ss-marker" style="left:21.5%"></div>
                                <div class="ss-label" style="left:21.5%" data-target="in-vl" data-value="22">Hearts</div>
                            </div>
                        </div>
                    </div>
                    <div class="control-item full">
                        <label>Heater Power</label>
                        <div class="input-row">
                            <div class="number-wrap">
                                <input type="number" id="in-heat" class="has-unit" step="10" min="0" max="2750" value="0">
                                <span class="number-unit">W</span>
                            </div>
                            <div class="slider-wrap">
                                <input type="range" id="in-heat-slider" min="0" max="2750" step="10" value="0">
                                <div class="ss-marker" style="left:63.6%"></div>
                                <div class="ss-label" style="left:63.6%" data-target="in-heat" data-value="1750">Working Power</div>
                                <div class="ss-marker" style="left:100%"></div>
                                <div class="ss-label" style="left:100%;transform:translateX(-100%)" data-target="in-heat" data-value="2750">Preheat</div>
                            </div>
                        </div>
                    </div>
                    <div class="control-item full">
                        <label>Max Tank Temp</label>
                        <div class="input-row">
                            <div class="number-wrap">
                                <input type="number" id="in-max-tank" class="has-unit" step="0.1" min="0" max="100" value="99.0">
                                <span class="number-unit">°C</span>
                            </div>
                            <input type="range" id="in-max-tank-slider" min="0" max="100" step="0.1" value="99.0">
                        </div>
                    </div>
                </div>

                <div style="margin-top:8px;">
                    <div class="switch-row" style="padding:4px 0">
                        <label for="sw-disable-close">Disable Upper Valve Closing</label>
                        <label class="switch">
                            <input type="checkbox" id="sw-disable-close">
                            <span class="track"></span>
                        </label>
                    </div>
                </div>

            </div>

            <div class="card" id="diag-card" style="position:relative;">
                <div class="card-header" style="margin-bottom:8px;cursor:pointer;" id="diag-toggle">
                    <h2 class="card-title" style="font-size:16px;">&#9881; Diagnostics</h2>
                    <span id="diag-arrow" style="color:var(--ink-muted);font-size:14px;">&#9656;</span>
                </div>
                <div id="diag-body" style="display:none">
                    <div class="sensor-grid" style="grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
                        <div class="sensor-item" style="padding:8px;">
                            <div class="label">Connection</div>
                            <div class="value" style="font-size:16px;" id="val-diag-conn">--</div>
                        </div>
                        <div class="sensor-item" style="padding:8px;">
                            <div class="label">Uptime</div>
                            <div class="value" style="font-size:16px;" id="val-diag-uptime">--</div>
                        </div>
                        <div class="sensor-item" style="padding:8px;">
                            <div class="label">WiFi Signal</div>
                            <div class="value" style="font-size:16px;" id="val-diag-wifi">--</div>
                        </div>
                        <div class="sensor-item" style="padding:8px;">
                            <div class="label">Free Heap</div>
                            <div class="value" style="font-size:16px;" id="val-diag-heap">--</div>
                        </div>
                        <div class="sensor-item" style="padding:8px;">
                            <div class="label">Loop Time</div>
                            <div class="value" style="font-size:16px;" id="val-loop-time" class="skel">--</div>
                        </div>
                        <div class="sensor-item" style="padding:8px;">
                            <div class="label">Display</div>
                            <div class="value" style="font-size:16px;" id="val-diag" class="skel">--</div>
                        </div>
                        <div class="sensor-item" style="padding:8px;grid-column:1/-1;">
                            <div class="label">Reset Reason</div>
                            <div class="value" style="font-size:14px;" id="val-reset-log">--</div>
                        </div>
                    </div>
                    <div id="log-area" style="background:var(--input-bg);border-radius:var(--radius-sm);padding:8px;font-family:'Menlo','Monaco','Consolas',monospace;font-size:11px;line-height:1.6;color:var(--ink);max-height:200px;overflow-y:auto;border:1px solid var(--card-border);white-space:pre-wrap;"></div>
                </div>
            </div>
        `;

        // === Theme Toggle ===
        const themeToggle = document.getElementById('btn-theme');
        const icon = themeToggle.querySelector('.icon');

        function getPreferredTheme() {
            const stored = localStorage.getItem('theme');
            if (stored) return stored;
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }

        function updateFavicon(theme) {
            const fg = theme === 'dark' ? '#2997ff' : '#0066cc';
            const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M19 4v7l8 12a4 4 0 0 1-3.33 6H8.33A4 4 0 0 1 5 23l8-12V4h6z" fill="none" stroke="' + fg + '" stroke-width="2" stroke-linejoin="round"/><path d="M5 20h22" stroke="' + fg + '" stroke-width="1.5"/><path d="M11 4h10" stroke="' + fg + '" stroke-width="2" stroke-linecap="round"/><rect x="9" y="16" width="14" height="6" rx="1" fill="' + fg + '" opacity="0.25"/></svg>';
            const link = document.querySelector('link[rel="icon"]');
            if (link) link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
        }

        function applyTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            icon.textContent = theme === 'dark' ? '\u2600' : '\u263E';
            updateFavicon(theme);
        }

        applyTheme(getPreferredTheme());

        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            applyTheme(current === 'dark' ? 'light' : 'dark');
        });

        // === Logic & Data Binding ===
        const parseNum = (v) => {
            const n = parseFloat(v);
            return isNaN(n) ? null : n;
        };

        const entities = {
            'sensor-column_temperature': { el: 'val-col-temp', fmt: v => { const n = parseNum(v); return n !== null ? n.toFixed(2) + '\u00B0' : '--'; }, temp: 'val-col-temp' },
            'sensor-tank_temperature': { el: 'val-tank-temp', fmt: v => { const n = parseNum(v); return n !== null ? n.toFixed(1) + '\u00B0' : '--'; }, temp: 'val-tank-temp' },
            'sensor-uptime': { el: 'val-uptime', fmt: v => { const s = parseInt(v); return isNaN(s) ? '--' : Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm'; } },
            'sensor-wifi_signal': { el: 'val-wifi', fmt: v => { const n = parseNum(v); return n !== null ? Math.round(n) : '--'; } },
            'sensor-free_heap': { el: 'val-heap', fmt: v => { const n = parseNum(v); return n !== null ? Math.round(n / 1024) + 'KB' : '--'; } },
            'sensor-loop_time': { el: 'val-loop-time', fmt: v => { const n = parseNum(v); return n !== null ? n.toFixed(0) + 'ms' : '--'; } },

            'text_sensor-status_message': { el: 'val-msg' },
            'text_sensor-reset_reason': { el: 'val-reset' },
            'text_sensor-diagnostic_message': { el: 'val-diag', noStore: true },

            'number-target_column_temp': { in: 'in-target', sl: 'in-target-slider', api: 'number/target_column_temp' },
            'number-delta': { in: 'in-delta', api: 'number/delta' },
            'number-coef_otbora': { in: 'in-coef', sl: 'in-coef-slider', api: 'number/coef_otbora' },
            'number-max_tank_temp': { in: 'in-max-tank', sl: 'in-max-tank-slider', api: 'number/max_tank_temp' },
            'number-valve_high_setting': { in: 'in-vh', sl: 'in-vh-slider', api: 'number/valve_high_setting', pct: true },
            'number-valve_low_setting': { in: 'in-vl', sl: 'in-vl-slider', api: 'number/valve_low_setting', pct: true },
            'number-heater_power': { in: 'in-heat', sl: 'in-heat-slider', api: 'number/heater_power' },
            'number-buzzer_volume': { in: 'in-vol', sl: 'in-vol-slider', api: 'number/buzzer_volume' },

            'switch-use_reduction_coefficient': { sw: 'sw-reduction', api: 'switch/use_reduction_coefficient' },
            'switch-disable_upper_valve_closing': { sw: 'sw-disable-close', api: 'switch/disable_upper_valve_closing' },

            'binary_sensor-distilling_status': { st: 'st-distilling' },
            'binary_sensor-heating_status': { st: 'st-heating' },
            'binary_sensor-alarm_status': { st: 'st-alarm', cls: 'danger' }
        };

        // Restore last known values from sessionStorage
        function restoreSession() {
            Object.keys(entities).forEach(function (id) {
                let saved; try { saved = sessionStorage.getItem('ms_' + id); } catch (e) { saved = null; }
                if (saved === null) return;
                const cfg = entities[id];
                if (cfg.el && !cfg.noStore) {
                    const el = document.getElementById(cfg.el);
                    if (el) {
                        const val = cfg.fmt ? cfg.fmt(saved) : saved;
                        if (val !== '--' && val !== null) { el.textContent = val; el.classList.remove('skel'); }
                    }
                }
                if (cfg.in) {
                    const input = document.getElementById(cfg.in);
                    if (input) {
                        var num = parseFloat(saved);
                        if (cfg.pct) num = Math.round(num * 100 / 1023);
                        if (!isNaN(num) && num >= parseFloat(input.min) && num <= parseFloat(input.max)) {
                            input.value = num;
                            if (cfg.sl) {
                                const slider = document.getElementById(cfg.sl);
                                if (slider) slider.value = num;
                            }
                        }
                    }
                }
                if (cfg.sw) {
                    const sw = document.getElementById(cfg.sw);
                    if (sw) sw.checked = (saved === 'ON');
                }
            });
        }
        restoreSession();

        // Log ring buffer for diagnostics
        var logBuffer = [];
        var MAX_LOG = 20;
        function addLog(msg) {
            var ts = new Date().toLocaleTimeString();
            logBuffer.push(ts + ' ' + msg);
            if (logBuffer.length > MAX_LOG) logBuffer.shift();
            var el = document.getElementById('log-area');
            if (el) {
                el.innerHTML = logBuffer.map(function (l) { return '<div>' + l.replace(/</g, '&lt;') + '</div>'; }).join('');
                el.scrollTop = el.scrollHeight;
            }
        }
        function renderLog() {
            var el = document.getElementById('log-area');
            if (el) {
                el.innerHTML = logBuffer.map(function (l) { return '<div>' + l.replace(/</g, '&lt;') + '</div>'; }).join('');
                el.scrollTop = el.scrollHeight;
            }
        }

        function debounce(func, wait) {
            let timeout;
            return function (...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        }

        Object.keys(entities).forEach(entityId => {
            const cfg = entities[entityId];

            if (cfg.in) {
                const input = document.getElementById(cfg.in);
                const slider = cfg.sl ? document.getElementById(cfg.sl) : null;
                const apiPath = cfg.api;

                if (input && apiPath) {
                    const debouncedUpdate = debounce((value) => {
                        var apiValue = cfg.pct ? Math.round(value * 1023 / 100) : value;
                        input.classList.add('sending');
                        fetch('/' + apiPath + '/set?value=' + apiValue, { method: 'POST' })
                            .then(() => input.classList.remove('sending'))
                            .catch(err => { input.classList.remove('sending'); console.error('Failed to update ' + entityId + ':', err); });
                    }, 400);

                    input.addEventListener('change', e => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) debouncedUpdate(val);
                    });

                    if (slider) {
                        input.addEventListener('input', e => {
                            slider.value = e.target.value;
                        });

                        slider.addEventListener('input', e => {
                            input.value = e.target.value;
                            debouncedUpdate(e.target.value);
                        });
                    }
                }
            }

            if (cfg.sw) {
                const switchEl = document.getElementById(cfg.sw);
                const apiPath = cfg.api;

                if (switchEl && apiPath) {
                    switchEl.addEventListener('change', e => {
                        const cmd = e.target.checked ? 'turn_on' : 'turn_off';
                        fetch('/' + apiPath + '/' + cmd, { method: 'POST' })
                            .catch(err => console.error('Failed to toggle ' + entityId + ':', err));
                    });
                }
            }
        });

        const restartBtn = document.getElementById('btn-restart');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                if (!confirm('Restart distillation process? All current settings will be preserved.')) return;
                fetch('/button/restart_process/press', { method: 'POST' })
                    .then(() => {
                        restartBtn.style.display = 'none';
                    })
                    .catch(err => console.error('Failed to restart process:', err));
            });
        }

        // Volume slider sync
        const volSlider = document.getElementById('in-vol-slider');
        const volVal = document.getElementById('vol-val');
        if (volSlider && volVal) {
            volSlider.addEventListener('input', function () {
                volVal.textContent = this.value;
            });
        }

        // Stepper buttons for numeric inputs
        document.querySelectorAll('.btn-stepper').forEach(btn => {
            btn.addEventListener('click', function () {
                const targetId = this.dataset.stepper;
                const step = parseFloat(this.dataset.step);
                const input = document.getElementById(targetId);
                if (!input) return;
                this.classList.remove('sending');
                void this.offsetWidth;
                this.classList.add('sending');
                const current = parseFloat(input.value) || 0;
                const min = parseFloat(input.min) || 0;
                const max = parseFloat(input.max) || 100;
                const precision = (String(step).split('.')[1] || '').length;
                const next = Math.min(max, Math.max(min, parseFloat((current + step).toFixed(precision))));
                input.value = next;
                input.dispatchEvent(new Event('change'));
                const sliderId = targetId + '-slider';
                const slider = document.getElementById(sliderId);
                if (slider) slider.value = next;
            });
        });

        const source = new EventSource('/events');
        let connTimer;

        addLog('Diagnostics initialized. Monitoring...');

        // Collapsible diagnostics card
        var diagBody = document.getElementById('diag-body');
        var diagArrow = document.getElementById('diag-arrow');
        document.getElementById('diag-toggle').addEventListener('click', function () {
            var hidden = diagBody.style.display === 'none';
            diagBody.style.display = hidden ? '' : 'none';
            diagArrow.textContent = hidden ? '\u25BC' : '\u25B6';
        });

        function updateTempVisuals(sensorId, tempC) {
            const card = document.getElementById(sensorId === 'sensor-column_temperature' ? 'col-temp-card' : 'tank-temp-card');
            const arc = document.getElementById(sensorId === 'sensor-column_temperature' ? 'col-temp-arc' : 'tank-temp-arc');
            if (!card || tempC === null) return;
            card.classList.remove('temp-cold', 'temp-warm', 'temp-hot');
            const frac = Math.min(1, Math.max(0, (tempC - 20) / 80));
            const circ = 88;
            if (arc) arc.setAttribute('stroke-dashoffset', circ - frac * circ);
            const color = tempC < 60 ? 'var(--primary)' : tempC < 80 ? 'var(--warn)' : 'var(--danger)';
            if (arc) arc.setAttribute('stroke', color);
            if (tempC < 60) card.classList.add('temp-cold');
            else if (tempC < 80) card.classList.add('temp-warm');
            else card.classList.add('temp-hot');
        }

        function setConnected(state) {
            const el = document.getElementById('conn-status');
            const connDot = el ? el.querySelector('.conn-dot') : null;
            var statusText;
            if (state) {
                statusText = '<span class="conn-dot"></span> Connected';
                el.innerHTML = statusText;
                const dot = el.querySelector('.conn-dot');
                if (dot) {
                    dot.style.opacity = '1';
                    dot.style.transform = 'scale(1.3)';
                    setTimeout(function () {
                        dot.style.opacity = '';
                        dot.style.transform = '';
                    }, 200);
                }
            } else {
                statusText = '<span class="conn-dot disconnected"></span> Disconnected';
                el.innerHTML = statusText;
            }
            var dc = document.getElementById('val-diag-conn');
            if (dc) dc.innerHTML = statusText;
        }

        source.addEventListener('state', e => {
            setConnected(true);
            clearTimeout(connTimer);
            connTimer = setTimeout(function () { setConnected(false); }, 5000);

            const data = JSON.parse(e.data);

            if (!entities[data.id]) {
                console.warn('Unknown entity: ' + data.id + ' = ' + data.state);
                return;
            }

            const cfg = entities[data.id];

            // Save to sessionStorage for fast restore on refresh
            try { sessionStorage.setItem('ms_' + data.id, String(data.state)); } catch (e) {}

            if (cfg.el) {
                const el = document.getElementById(cfg.el);
                if (el) {
                    const newText = cfg.fmt ? cfg.fmt(data.state) : data.state;
                    el.textContent = newText;

                    if (data.id === 'text_sensor-status_message') {
                        const btn = document.getElementById('btn-restart');
                        if (btn) {
                            btn.style.display = (data.state === 'DONE') ? 'inline-flex' : 'none';
                        }
                        el.classList.toggle('done', data.state === 'DONE');
                    }

                    if (data.id === 'text_sensor-diagnostic_message') {
                        addLog(String(data.state));
                    }

                    el.classList.remove('skel');

                    if (data.id === 'sensor-column_temperature' || data.id === 'sensor-tank_temperature') {
                        const n = parseFloat(data.state);
                        if (!isNaN(n)) updateTempVisuals(data.id, n);
                    }
                }

                // Mirror to diagnostics card (runs even if old header element is gone)
                var _dt = cfg.fmt ? cfg.fmt(data.state) : data.state;
                if (data.id === 'text_sensor-reset_reason') {
                    var _rl = document.getElementById('val-reset-log');
                    if (_rl) _rl.textContent = String(data.state);
                }
                if (data.id === 'sensor-uptime') {
                    var _du = document.getElementById('val-diag-uptime');
                    if (_du) _du.textContent = _dt;
                }
                if (data.id === 'sensor-wifi_signal') {
                    var _dw = document.getElementById('val-diag-wifi');
                    if (_dw) _dw.textContent = _dt;
                }
                if (data.id === 'sensor-free_heap') {
                    var _dh = document.getElementById('val-diag-heap');
                    if (_dh) _dh.textContent = _dt;
                }
            }

            if (cfg.in) {
                const input = document.getElementById(cfg.in);
                if (input && document.activeElement !== input) {
                    if (data.state !== null && data.state !== '' && data.state !== undefined) {
                        let numericValue = data.state;
                        if (typeof data.state === 'string') {
                            const match = data.state.match(/-?\d+\.?\d*/);
                            if (match) numericValue = match[0];
                        }
                        let numVal = parseFloat(numericValue);
                        if (!isNaN(numVal)) {
                            if (cfg.pct) numVal = Math.round(numVal * 100 / 1023);
                            const stepVal = parseFloat(input.getAttribute('step') || '1');
                            const d = stepVal > 0 && stepVal < 1 ? stepVal.toString().split('.')[1].length : 0;
                            const displayVal = numVal.toFixed(d);
                            input.value = displayVal;
                            if (cfg.sl) {
                                const slider = document.getElementById(cfg.sl);
                                if (slider && document.activeElement !== slider) {
                                    slider.value = displayVal;
                                }
                            }
                        }
                    }
                }
            }

            if (cfg.sw) {
                const el = document.getElementById(cfg.sw);
                if (el) {
                    el.checked = (data.state === 'ON');
                }
            }

            if (cfg.st) {
                const el = document.getElementById(cfg.st);
                if (el) {
                    const activeClass = cfg.cls || 'on';
                    if (data.state === 'ON') {
                        el.classList.add(activeClass);
                    } else {
                        el.classList.remove(activeClass);
                    }
                }
            }
        });

        source.onerror = function () {
            setConnected(false);
        };

        // Click handler for slider markers
        document.addEventListener('click', function (e) {
            var label = e.target.closest('.ss-label');
            if (!label) return;
            var targetId = label.getAttribute('data-target');
            var value = label.getAttribute('data-value');
            if (!targetId || !value) return;
            var input = document.getElementById(targetId);
            if (!input) return;
            input.value = value;
            input.classList.add('sending');
            var wrap = label.closest('.slider-wrap');
            if (wrap) {
                var slider = wrap.querySelector('input[type="range"]');
                if (slider) slider.value = value;
            }
            input.dispatchEvent(new Event('change'));
            setTimeout(function () { input.classList.remove('sending'); }, 1000);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI);
    else initUI();
})();
