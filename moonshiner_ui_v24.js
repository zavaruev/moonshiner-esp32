(function () {
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

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
                overflow-x: hidden;
            }
            * { box-sizing: border-box; }

            #custom-app {
                max-width: 800px;
                width: 100%;
                margin: 0 auto;
                padding: 20px 16px 40px;
                display: grid;
                gap: 16px;
                box-sizing: border-box;
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
                gap: 8px;
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
                background: var(--divider);
                color: var(--ink-muted);
                text-transform: uppercase;
                transition: all 0.15s ease;
                flex-shrink: 0;
            }

            .badge-conn {
                background: var(--success);
                color: #fff;
            }

            .badge-conn.disconnected {
                background: var(--danger);
                color: #fff;
            }

            .badge-status {
                background: var(--ink-muted);
                color: var(--card-bg);
            }

            .badge-status.done {
                background: var(--primary);
                color: #fff;
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
                width: 24px;
                height: 24px;
                padding: 0;
                border-radius: 50%;
                border: 1px solid var(--card-border);
                background: var(--card-bg);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
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

                .sensor-grid { grid-template-columns: 1fr; }

                .control-group { grid-template-columns: 1fr; }

                .sensor-item .value { font-size: 24px; }
            }

            @media (max-width: 419px) {
                #custom-app { padding: 8px; gap: 8px; }

                .card { padding: 12px; }

                .top-bar { flex-wrap: nowrap; }
                .top-bar-left { flex-shrink: 1; min-width: 0; }
                .top-bar-right { flex-shrink: 0; }
                .badge-row { flex-wrap: wrap; gap: 4px; }
                .badge { font-size: 9px; padding: 3px 6px; }
                .vol-mini input[type="range"] { width: 40px; }
                .vol-mini .vol-val { font-size: 9px; min-width: 14px; }
                .vol-mini .vol-icon { font-size: 10px; }

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


        const svgNS = "http://www.w3.org/2000/svg";
        const svgTags = new Set(['svg', 'circle', 'path', 'rect', 'g']);

        function h(tag, attrs, children) {
            const el = svgTags.has(tag) ? document.createElementNS(svgNS, tag) : document.createElement(tag);
            if (attrs) {
                for (const key in attrs) {
                    if (key === 'className') {
                        if (svgTags.has(tag)) el.setAttribute('class', attrs[key]);
                        else el.className = attrs[key];
                    }
                    else if (key === 'htmlFor') el.htmlFor = attrs[key];
                    else if (key === 'style') el.style.cssText = attrs[key];
                    else el.setAttribute(key, attrs[key]);
                }
            }
            if (children) {
                for (let i = 0; i < children.length; i++) {
                    const c = children[i];
                    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
                    else if (c) el.appendChild(c);
                }
            }
            return el;
        }

        const children = [
        h('div', {"className":"card"}, [
            h('div', {"className":"top-bar"}, [
                h('div', {"className":"top-bar-left"}, [
                    h('div', {"className":"badge-row"}, [
                        h('span', {"id":"conn-status","className":"badge badge-conn disconnected"}, [
                            "Connecting..."
                        ]),
                        h('span', {"className":"badge badge-status","id":"val-msg"}, [
                            "Connecting..."
                        ]),
                        h('span', {"id":"st-distilling","className":"badge"}, [
                            "Distilling"
                        ]),
                        h('span', {"id":"st-heating","className":"badge"}, [
                            "Heating"
                        ]),
                        h('span', {"id":"st-alarm","className":"badge"}, [
                            "Alarm"
                        ])
                    ]),
                    h('button', {"className":"btn btn-danger","id":"btn-restart","style":"display:none;padding:4px 12px;font-size:11px;"}, [
                        "Restart"
                    ])
                ]),
                h('div', {"className":"top-bar-right"}, [
                    h('div', {"className":"vol-mini"}, [
                        h('span', {"className":"vol-icon","id":"vol-icon"}, [
                            "♫"
                        ]),
                        h('input', {"type":"range","id":"in-vol-slider","min":"0","max":"100","step":"1","value":"100"}),
                        h('span', {"className":"vol-val","id":"vol-val"}, [
                            "100"
                        ]),
                        h('input', {"type":"number","id":"in-vol","value":"100","style":"display:none;"})
                    ]),
                    h('button', {"className":"theme-toggle","id":"btn-theme","aria-label":"Toggle theme"}, [
                        h('span', {"className":"icon"}, [
                            "☾"
                        ])
                    ])
                ])
            ])
        ]),
        h('div', {"className":"card","style":"padding:16px"}, [
            h('div', {"className":"card-header","style":"margin-bottom:12px"}, [
                h('h2', {"className":"card-title"}, [
                    "Temperatures"
                ])
            ]),
            h('div', {"className":"sensor-grid"}, [
                h('div', {"className":"sensor-item","id":"col-temp-card"}, [
                    h('div', {"className":"label"}, [
                        "Column"
                    ]),
                    h('div', {"className":"value"}, [
                        h('span', {"id":"val-col-temp","className":"skel"}, [
                            "--"
                        ])
                    ]),
                    h('svg', {"className":"temp-ring","viewBox":"0 0 34 34","id":"col-temp-ring"}, [
                        h('circle', {"cx":"17","cy":"17","r":"14","fill":"none","stroke":"var(--divider)","stroke-width":"2.5"}),
                        h('circle', {"cx":"17","cy":"17","r":"14","fill":"none","stroke":"var(--primary)","stroke-width":"2.5","stroke-dasharray":"88","stroke-dashoffset":"88","transform":"rotate(-90 17 17)","id":"col-temp-arc"})
                    ])
                ]),
                h('div', {"className":"sensor-item","id":"tank-temp-card"}, [
                    h('div', {"className":"label"}, [
                        "Tank"
                    ]),
                    h('div', {"className":"value"}, [
                        h('span', {"id":"val-tank-temp","className":"skel"}, [
                            "--"
                        ])
                    ]),
                    h('svg', {"className":"temp-ring","viewBox":"0 0 34 34","id":"tank-temp-ring"}, [
                        h('circle', {"cx":"17","cy":"17","r":"14","fill":"none","stroke":"var(--divider)","stroke-width":"2.5"}),
                        h('circle', {"cx":"17","cy":"17","r":"14","fill":"none","stroke":"var(--primary)","stroke-width":"2.5","stroke-dasharray":"88","stroke-dashoffset":"88","transform":"rotate(-90 17 17)","id":"tank-temp-arc"})
                    ])
                ])
            ])
        ]),
        h('div', {"className":"card"}, [
            h('div', {"className":"card-header"}, [
                h('h2', {"className":"card-title"}, [
                    "Column Control"
                ])
            ]),
            h('div', {"className":"control-group"}, [
                h('div', {"className":"control-item full"}, [
                    h('label', null, [
                        "Target Temperature"
                    ]),
                    h('div', {"className":"input-row"}, [
                        h('button', {"className":"btn btn-stepper","data-stepper":"in-target","data-step":"-0.1"}, [
                            "−"
                        ]),
                        h('input', {"type":"number","id":"in-target","step":"0.01","min":"0","max":"100","value":"95.00"}),
                        h('div', {"className":"slider-wrap"}, [
                            h('input', {"type":"range","id":"in-target-slider","min":"0","max":"100","step":"0.01","value":"95.00"}),
                            h('div', {"className":"ss-marker","style":"left:78.39%"}),
                            h('div', {"className":"ss-label","style":"left:78.39%","data-target":"in-target","data-value":"78.39"}, [
                                "Spirit"
                            ])
                        ]),
                        h('button', {"className":"btn btn-stepper","data-stepper":"in-target","data-step":"0.1"}, [
                            "+"
                        ]),
                        h('div', {"className":"delta-inline"}, [
                            h('span', {"className":"delta-label"}, [
                                "Δ"
                            ]),
                            h('input', {"type":"number","id":"in-delta","step":"0.01","min":"0","max":"5","value":"0.30"})
                        ])
                    ])
                ])
            ]),
            h('div', {"className":"control-item full","style":"margin-top:12px;"}, [
                h('label', null, [
                    "Coef Otbora"
                ]),
                h('div', {"className":"input-row"}, [
                    h('input', {"type":"number","id":"in-coef","step":"0.05","min":"0","max":"1","value":"1.0"}),
                    h('input', {"type":"range","id":"in-coef-slider","min":"0","max":"1","step":"0.05","value":"1.0"})
                ])
            ]),
            h('div', {"style":"margin-top:8px;"}, [
                h('div', {"className":"switch-row","style":"padding:4px 0"}, [
                    h('label', {"htmlFor":"sw-reduction"}, [
                        "Use Reduction"
                    ]),
                    h('label', {"className":"switch"}, [
                        h('input', {"type":"checkbox","id":"sw-reduction","checked":""}),
                        h('span', {"className":"track"})
                    ])
                ])
            ])
        ]),
        h('div', {"className":"card"}, [
            h('div', {"className":"card-header"}, [
                h('h2', {"className":"card-title"}, [
                    "Valves & Heater"
                ])
            ]),
            h('div', {"className":"control-group"}, [
                h('div', {"className":"control-item"}, [
                    h('label', null, [
                        "Valve High"
                    ]),
                    h('div', {"className":"input-row"}, [
                        h('div', {"className":"number-wrap"}, [
                            h('input', {"type":"number","id":"in-vh","className":"has-unit","step":"1","min":"0","max":"100","value":"0"}),
                            h('span', {"className":"number-unit"}, [
                                "%"
                            ])
                        ]),
                        h('div', {"className":"slider-wrap"}, [
                            h('input', {"type":"range","id":"in-vh-slider","min":"0","max":"100","step":"1","value":"0"}),
                            h('div', {"className":"ss-marker","style":"left:2%"}),
                            h('div', {"className":"ss-label","style":"left:2%","data-target":"in-vh","data-value":"2"}, [
                                "Heads"
                            ]),
                            h('div', {"className":"ss-marker","style":"left:21.5%"}),
                            h('div', {"className":"ss-label","style":"left:21.5%","data-target":"in-vh","data-value":"22"}, [
                                "Hearts"
                            ])
                        ])
                    ])
                ]),
                h('div', {"className":"control-item"}, [
                    h('label', null, [
                        "Valve Low"
                    ]),
                    h('div', {"className":"input-row"}, [
                        h('div', {"className":"number-wrap"}, [
                            h('input', {"type":"number","id":"in-vl","className":"has-unit","step":"1","min":"0","max":"100","value":"0"}),
                            h('span', {"className":"number-unit"}, [
                                "%"
                            ])
                        ]),
                        h('div', {"className":"slider-wrap"}, [
                            h('input', {"type":"range","id":"in-vl-slider","min":"0","max":"100","step":"1","value":"0"}),
                            h('div', {"className":"ss-marker","style":"left:21.5%"}),
                            h('div', {"className":"ss-label","style":"left:21.5%","data-target":"in-vl","data-value":"22"}, [
                                "Hearts"
                            ])
                        ])
                    ])
                ]),
                h('div', {"className":"control-item full"}, [
                    h('label', null, [
                        "Heater Power"
                    ]),
                    h('div', {"className":"input-row"}, [
                        h('div', {"className":"number-wrap"}, [
                            h('input', {"type":"number","id":"in-heat","className":"has-unit","step":"10","min":"0","max":"2750","value":"0"}),
                            h('span', {"className":"number-unit"}, [
                                "W"
                            ])
                        ]),
                        h('div', {"className":"slider-wrap"}, [
                            h('input', {"type":"range","id":"in-heat-slider","min":"0","max":"2750","step":"10","value":"0"}),
                            h('div', {"className":"ss-marker","style":"left:57.3%"}),
                            h('div', {"className":"ss-label","style":"left:57.3%","data-target":"in-heat","data-value":"1575"}, [
                                "Working Power"
                            ]),
                            h('div', {"className":"ss-marker","style":"left:100%"}),
                            h('div', {"className":"ss-label","style":"left:100%;transform:translateX(-100%)","data-target":"in-heat","data-value":"2750"}, [
                                "Preheat"
                            ])
                        ])
                    ])
                ]),
                h('div', {"className":"control-item full"}, [
                    h('label', null, [
                        "Max Tank Temp"
                    ]),
                    h('div', {"className":"input-row"}, [
                        h('div', {"className":"number-wrap"}, [
                            h('input', {"type":"number","id":"in-max-tank","className":"has-unit","step":"0.1","min":"0","max":"100","value":"99.0"}),
                            h('span', {"className":"number-unit"}, [
                                "°C"
                            ])
                        ]),
                        h('input', {"type":"range","id":"in-max-tank-slider","min":"0","max":"100","step":"0.1","value":"99.0"})
                    ])
                ])
            ]),
            h('div', {"style":"margin-top:8px;"}, [
                h('div', {"className":"switch-row","style":"padding:4px 0"}, [
                    h('label', {"htmlFor":"sw-disable-close"}, [
                        "Disable Upper Valve Closing"
                    ]),
                    h('label', {"className":"switch"}, [
                        h('input', {"type":"checkbox","id":"sw-disable-close"}),
                        h('span', {"className":"track"})
                    ])
                ])
            ])
        ]),
        h('div', {"className":"card","id":"diag-card","style":"position:relative;"}, [
            h('div', {"className":"card-header","style":"margin-bottom:8px;cursor:pointer;","id":"diag-toggle"}, [
                h('h2', {"className":"card-title","style":"font-size:16px;"}, [
                    "⚙ Diagnostics"
                ]),
                h('span', {"id":"diag-arrow","style":"color:var(--ink-muted);font-size:14px;"}, [
                    "▸"
                ])
            ]),
            h('div', {"id":"diag-body","style":"display:none"}, [
                h('div', {"className":"sensor-grid","style":"grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;"}, [
                    h('div', {"className":"sensor-item","style":"padding:8px;"}, [
                        h('div', {"className":"label"}, [
                            "Connection"
                        ]),
                        h('div', {"className":"value","style":"font-size:16px;","id":"val-diag-conn"}, [
                            "--"
                        ])
                    ]),
                    h('div', {"className":"sensor-item","style":"padding:8px;"}, [
                        h('div', {"className":"label"}, [
                            "Uptime"
                        ]),
                        h('div', {"className":"value","style":"font-size:16px;","id":"val-diag-uptime"}, [
                            "--"
                        ])
                    ]),
                    h('div', {"className":"sensor-item","style":"padding:8px;"}, [
                        h('div', {"className":"label"}, [
                            "WiFi Signal"
                        ]),
                        h('div', {"className":"value","style":"font-size:16px;","id":"val-diag-wifi"}, [
                            "--"
                        ])
                    ]),
                    h('div', {"className":"sensor-item","style":"padding:8px;"}, [
                        h('div', {"className":"label"}, [
                            "Free Heap"
                        ]),
                        h('div', {"className":"value","style":"font-size:16px;","id":"val-diag-heap"}, [
                            "--"
                        ])
                    ]),
                    h('div', {"className":"sensor-item","style":"padding:8px;"}, [
                        h('div', {"className":"label"}, [
                            "Loop Time"
                        ]),
                        h('div', {"className":"value","style":"font-size:16px;","id":"val-loop-time"}, [
                            "--"
                        ])
                    ]),
                    h('div', {"className":"sensor-item","style":"padding:8px;"}, [
                        h('div', {"className":"label"}, [
                            "Display"
                        ]),
                        h('div', {"className":"value","style":"font-size:16px;","id":"val-diag"}, [
                            "--"
                        ])
                    ]),
                    h('div', {"className":"sensor-item","style":"padding:8px;grid-column:1/-1;"}, [
                        h('div', {"className":"label"}, [
                            "Reset Reason"
                        ]),
                        h('div', {"className":"value","style":"font-size:14px;","id":"val-reset-log"}, [
                            "--"
                        ])
                    ])
                ]),
                h('div', {"id":"log-area","style":"background:var(--input-bg);border-radius:var(--radius-sm);padding:8px;font-family:'Menlo','Monaco','Consolas',monospace;font-size:11px;line-height:1.6;color:var(--ink);max-height:200px;overflow-y:auto;border:1px solid var(--card-border);white-space:pre-wrap;"})
            ])
        ])
        ];
        for (let i = 0; i < children.length; i++) {
            app.appendChild(children[i]);
        }

        document.body.appendChild(app);

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

            'number-target_column_temp': { in: 'in-target', sl: 'in-target-slider', api: 'number/Target Column Temp' },
            'number-delta': { in: 'in-delta', api: 'number/Delta' },
            'number-coef_otbora': { in: 'in-coef', sl: 'in-coef-slider', api: 'number/Coef Otbora' },
            'number-max_tank_temp': { in: 'in-max-tank', sl: 'in-max-tank-slider', api: 'number/Max Tank Temp' },
            'number-valve_high_setting': { in: 'in-vh', sl: 'in-vh-slider', api: 'number/Valve High Setting', pct: true },
            'number-valve_low_setting': { in: 'in-vl', sl: 'in-vl-slider', api: 'number/Valve Low Setting', pct: true },
            'number-heater_power': { in: 'in-heat', sl: 'in-heat-slider', api: 'number/Heater Power' },
            'number-buzzer_volume': { in: 'in-vol', sl: 'in-vol-slider', api: 'number/Buzzer Volume' },

            'switch-use_reduction_coefficient': { sw: 'sw-reduction', api: 'switch/Use Reduction Coefficient' },
            'switch-disable_upper_valve_closing': { sw: 'sw-disable-close', api: 'switch/Disable Upper Valve Closing' },

            'binary_sensor-distilling_status': { st: 'st-distilling' },
            'binary_sensor-heating_status': { st: 'st-heating' },
            'binary_sensor-alarm_status': { st: 'st-alarm', cls: 'danger' }
        };

        // Pre-cache DOM elements for entities to avoid dynamic lookups during critical paths
        Object.keys(entities).forEach(function(id) {
            const cfg = entities[id];
            if (cfg.el) cfg._el = document.getElementById(cfg.el);
            if (cfg.in) cfg._in = document.getElementById(cfg.in);
            if (cfg.sl) cfg._sl = document.getElementById(cfg.sl);
            if (cfg.sw) cfg._sw = document.getElementById(cfg.sw);
            if (cfg.st) cfg._st = document.getElementById(cfg.st);
        });
        const btnRestart = document.getElementById('btn-restart');

        // Restore last known values from sessionStorage
        function restoreSession() {
            for (const id in entities) {
                if (!Object.prototype.hasOwnProperty.call(entities, id)) continue;
                let saved; try { saved = sessionStorage.getItem('ms_' + id); } catch (e) { saved = null; }
                if (saved === null) continue;
                const cfg = entities[id];
                if (cfg.el && !cfg.noStore) {
                    const el = cfg._el;
                    if (el) {
                        const val = cfg.fmt ? cfg.fmt(saved) : saved;
                        if (val !== '--' && val !== null) { el.textContent = val; el.classList.remove('skel'); }
                    }
                }
                if (cfg.in) {
                    const input = cfg._in;
                    if (input) {
                        let num = parseFloat(saved);
                        if (cfg.pct) num = Math.round(num * 100 / 1023);
                        if (!isNaN(num) && num >= parseFloat(input.min) && num <= parseFloat(input.max)) {
                            input.value = num;
                            if (cfg.sl) {
                                const slider = cfg._sl;
                                if (slider) slider.value = num;
                            }
                        }
                    }
                }
                if (cfg.sw) {
                    const sw = cfg._sw;
                    if (sw) sw.checked = (saved === 'ON');
                }
            }
        }
        restoreSession();

        // Log ring buffer for diagnostics
        let logBuffer = [];
        const MAX_LOG = 20;
        let logAreaElement = null;

        function addLog(msg) {
            const ts = new Date().toLocaleTimeString();
            const logStr = ts + ' ' + msg;
            logBuffer.push(logStr);
            if (logBuffer.length > MAX_LOG) logBuffer.shift();
            let el = logAreaElement || (logAreaElement = document.getElementById('log-area'));
            if (el) {
                if (el.children.length === 0 && logBuffer.length > 1) {
                    // First time discovering the element, render everything in the buffer
                    for (var i = 0; i < logBuffer.length; i++) {
                        var bDiv = document.createElement('div');
                        bDiv.textContent = logBuffer[i];
                        el.appendChild(bDiv);
                    }
                } else {
                    var div = document.createElement('div');
                    div.textContent = logStr;
                    el.appendChild(div);
                }

                while (el.children.length > MAX_LOG) {
                    el.removeChild(el.firstChild);
                }
                el.scrollTop = el.scrollHeight;
            }
        }
        function renderLog() {
            let el = logAreaElement || (logAreaElement = document.getElementById('log-area'));
            if (el) {
                el.innerHTML = '';
                logBuffer.forEach(function (l) {
                    const div = document.createElement('div');
                    div.textContent = l;
                    el.appendChild(div);
                });
                el.scrollTop = el.scrollHeight;
            }
        }

        Object.keys(entities).forEach(entityId => {
            const cfg = entities[entityId];

            if (cfg.in) {
                const input = cfg._in;
                const slider = cfg._sl;
                const apiPath = cfg.api;

                if (input && apiPath) {
                    const debouncedUpdate = debounce(async (value) => {
                        const apiValue = cfg.pct ? Math.round(value * 1023 / 100) : value;
                        input.classList.add('sending');
                        try {
                            await fetch('/' + apiPath + '/set?value=' + apiValue, { method: 'POST' });
                        } catch (err) {
                            addLog('Failed to update ' + entityId + ': ' + (err.message || err));
                        } finally {
                            input.classList.remove('sending');
                        }
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
                const switchEl = cfg._sw;
                const apiPath = cfg.api;

                if (switchEl && apiPath) {
                    switchEl.addEventListener('change', e => {
                        const cmd = e.target.checked ? 'turn_on' : 'turn_off';
                        fetch('/' + apiPath + '/' + cmd, { method: 'POST' })
                            .catch(err => addLog('Failed to toggle ' + entityId + ': ' + (err.message || err)));
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
                    .catch(err => addLog('Failed to restart process: ' + (err.message || err)));
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
            const targetId = btn.dataset.stepper;
            const step = parseFloat(btn.dataset.step);
            const input = document.getElementById(targetId);
            const sliderId = targetId + '-slider';
            const slider = document.getElementById(sliderId);

            btn.addEventListener('click', () => {
                if (!input) return;
                btn.classList.remove('sending');
                void btn.offsetWidth;
                btn.classList.add('sending');
                const current = parseFloat(input.value) || 0;
                const min = parseFloat(input.min) || 0;
                const max = parseFloat(input.max) || 100;
                const precision = (String(step).split('.')[1] || '').length;
                const next = Math.min(max, Math.max(min, parseFloat((current + step).toFixed(precision))));
                input.value = next;
                input.dispatchEvent(new Event('change'));
                if (slider) slider.value = next;
            });
        });

        const source = new EventSource('/events');
        let connTimer;

        addLog('Diagnostics initialized. Monitoring...');

        // Collapsible diagnostics card
        const diagBody = document.getElementById('diag-body');
        const diagArrow = document.getElementById('diag-arrow');
        document.getElementById('diag-toggle').addEventListener('click', function () {
            const hidden = diagBody.style.display === 'none';
            diagBody.style.display = hidden ? '' : 'none';
            diagArrow.textContent = hidden ? '\u25BC' : '\u25B6';
        });

        const colTempCard = document.getElementById('col-temp-card');
        const tankTempCard = document.getElementById('tank-temp-card');
        const colTempArc = document.getElementById('col-temp-arc');
        const tankTempArc = document.getElementById('tank-temp-arc');

        function updateTempVisuals(sensorId, tempC) {
            const isCol = sensorId === 'sensor-column_temperature';
            const card = isCol ? colTempCard : tankTempCard;
            const arc = isCol ? colTempArc : tankTempArc;
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
            const connEl = document.getElementById('conn-status');
            const runEl = document.getElementById('val-msg');
            if (!connEl) return;
            if (state) {
                connEl.textContent = 'Connected';
                connEl.classList.remove('disconnected');
                // Modem blink: Connected bright, RUNNING dim
                connEl.style.opacity = '1';
                if (runEl) runEl.style.opacity = '0.4';
                setTimeout(function () {
                    // Alternate: Connected dim, RUNNING bright
                    connEl.style.opacity = '0.4';
                    if (runEl) runEl.style.opacity = '1';
                    setTimeout(function () {
                        connEl.style.opacity = '';
                        if (runEl) runEl.style.opacity = '';
                    }, 150);
                }, 150);
            } else {
                connEl.textContent = 'Disconnected';
                connEl.classList.add('disconnected');
                connEl.style.opacity = '1';
                if (runEl) runEl.style.opacity = '';
            }
            const dc = document.getElementById('val-diag-conn');
            if (dc) dc.innerHTML = state ? 'Connected' : 'Disconnected';
        }

        source.addEventListener('state', e => {
            setConnected(true);
            clearTimeout(connTimer);
            connTimer = setTimeout(function () { setConnected(false); }, 5000);

            const data = JSON.parse(e.data);

            if (!entities[data.id]) {
                addLog('Unknown entity: ' + data.id + ' = ' + data.state);
                return;
            }

            const cfg = entities[data.id];

            // Save to sessionStorage for fast restore on refresh
            try { sessionStorage.setItem('ms_' + data.id, String(data.state)); } catch (e) { console.warn('Error saving to sessionStorage: ' + e.message); }

            if (cfg.el) {
                const el = cfg._el;
                if (el) {
                    const newText = cfg.fmt ? cfg.fmt(data.state) : data.state;
                    el.textContent = newText;

                    if (data.id === 'text_sensor-status_message') {
                        const btn = btnRestart;
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
                const _dt = cfg.fmt ? cfg.fmt(data.state) : data.state;
                if (data.id === 'text_sensor-reset_reason') {
                    const _rl = document.getElementById('val-reset-log');
                    if (_rl) _rl.textContent = String(data.state);
                }
                if (data.id === 'sensor-uptime') {
                    const _du = document.getElementById('val-diag-uptime');
                    if (_du) _du.textContent = _dt;
                }
                if (data.id === 'sensor-wifi_signal') {
                    const _dw = document.getElementById('val-diag-wifi');
                    if (_dw) _dw.textContent = _dt;
                }
                if (data.id === 'sensor-free_heap') {
                    const _dh = document.getElementById('val-diag-heap');
                    if (_dh) _dh.textContent = _dt;
                }
            }

            if (cfg.in) {
                const input = cfg._in;
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
                                const slider = cfg._sl;
                                if (slider && document.activeElement !== slider) {
                                    slider.value = displayVal;
                                }
                            }
                        }
                    }
                }
            }

            if (cfg.sw) {
                const el = cfg._sw;
                if (el) {
                    el.checked = (data.state === 'ON');
                }
            }

            if (cfg.st) {
                const el = cfg._st;
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
            const label = e.target.closest('.ss-label');
            if (!label) return;
            const targetId = label.getAttribute('data-target');
            const value = label.getAttribute('data-value');
            if (!targetId || !value) return;
            const input = document.getElementById(targetId);
            if (!input) return;
            input.value = value;
            input.classList.add('sending');
            const wrap = label.closest('.slider-wrap');
            if (wrap) {
                const slider = wrap.querySelector('input[type="range"]');
                if (slider) slider.value = value;
            }
            input.dispatchEvent(new Event('change'));
            setTimeout(function () { input.classList.remove('sending'); }, 1000);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI);
    else initUI();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { debounce };
    }
})();
