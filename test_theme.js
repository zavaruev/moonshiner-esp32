const fs = require('fs');
const { JSDOM } = require('jsdom');
const assert = require('assert');

let jsCode = fs.readFileSync('./moonshiner_ui_v24.js', 'utf8');

// Expose theme functions for testing
jsCode = jsCode.replace('function getPreferredTheme() {', 'window.getPreferredTheme = getPreferredTheme;\n        function getPreferredTheme() {');
jsCode = jsCode.replace('function applyTheme(theme) {', 'window.applyTheme = applyTheme;\n        function applyTheme(theme) {');

let passed = 0;
let failed = 0;

function check(condition, message) {
    if (condition) {
        console.log(`✅ PASS: ${message}`);
        passed++;
    } else {
        console.error(`❌ FAIL: ${message}`);
        failed++;
    }
}

async function runTests() {
    console.log('\nRunning Theme Preferences tests...');

    // Helper to setup DOM with specific localStorage and matchMedia
    function setup(storedTheme, prefersDark) {
        // Mock localStorage globally before JSDOM creation since the IIFE runs immediately
        let mockStorage = {};
        if (storedTheme) mockStorage['theme'] = storedTheme;

        const html = `
        <!DOCTYPE html>
        <html>
        <head></head>
        <body>
            <button class="theme-toggle" id="btn-theme" aria-label="Toggle theme">
                <span class="icon">☾</span>
            </button>
        </body>
        </html>
        `;

        const dom = new JSDOM(html, {
            runScripts: 'dangerously',
            url: 'http://localhost/',
            beforeParse(window) {
                window.matchMedia = query => ({
                    matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false
                });

                // Overwrite localStorage in the jsdom window
                Object.defineProperty(window, 'localStorage', {
                    value: {
                        getItem: key => mockStorage[key] || null,
                        setItem: (key, value) => { mockStorage[key] = String(value); },
                        removeItem: key => { delete mockStorage[key]; },
                        clear: () => { mockStorage = {}; }
                    },
                    writable: true
                });

                window.EventSource = class {
                    addEventListener() {}
                    onerror() {}
                };
            }
        });

        const window = dom.window;
        const document = window.document;

        // Attach code
        const scriptEl = document.createElement('script');
        scriptEl.textContent = jsCode;
        document.body.appendChild(scriptEl);

        return new Promise(resolve => {
            setTimeout(() => {
                resolve({ window, document, getStorage: () => mockStorage });
            }, 100);
        });
    }

    try {
        // Test 1: No localStorage, system prefers light
        let env = await setup(null, false);
        check(env.window.getPreferredTheme() === 'light', 'Default theme should be light when no preference and system is light');
        check(env.document.documentElement.getAttribute('data-theme') === 'light', 'Data-theme should be initialized to light');

        // Test 2: No localStorage, system prefers dark
        env = await setup(null, true);
        check(env.window.getPreferredTheme() === 'dark', 'Default theme should be dark when no preference and system is dark');
        check(env.document.documentElement.getAttribute('data-theme') === 'dark', 'Data-theme should be initialized to dark');

        // Test 3: localStorage has 'dark', system prefers light
        env = await setup('dark', false);
        check(env.window.getPreferredTheme() === 'dark', 'Should respect stored dark theme despite system light theme');
        check(env.document.documentElement.getAttribute('data-theme') === 'dark', 'Data-theme should be initialized to dark based on storage');

        // Test 4: localStorage has 'light', system prefers dark
        env = await setup('light', true);
        check(env.window.getPreferredTheme() === 'light', 'Should respect stored light theme despite system dark theme');

        // Test 5: applyTheme updates DOM, localStorage, and Favicon
        env = await setup(null, false);
        env.window.applyTheme('dark');
        check(env.document.documentElement.getAttribute('data-theme') === 'dark', 'applyTheme should set data-theme attribute');
        check(env.getStorage()['theme'] === 'dark', 'applyTheme should save preference to localStorage');
        let link = env.document.querySelector('link[rel="icon"]');
        check(link && link.href.includes('%232997ff'), 'Favicon should be updated with dark theme color (#2997ff)');

        env.window.applyTheme('light');
        check(env.document.documentElement.getAttribute('data-theme') === 'light', 'applyTheme should set data-theme to light');
        check(env.getStorage()['theme'] === 'light', 'applyTheme should save light theme to localStorage');
        link = env.document.querySelector('link[rel="icon"]');
        check(link && link.href.includes('%230066cc'), 'Favicon should be updated with light theme color (#0066cc)');

        // Test 6: Theme Toggle Button
        env = await setup('light', false);
        const themeBtn = env.document.getElementById('btn-theme');
        check(themeBtn !== null, 'Theme toggle button should exist');

        const currentTheme = env.document.documentElement.getAttribute('data-theme');
        themeBtn.click();
        const newTheme = env.document.documentElement.getAttribute('data-theme');

        check(newTheme !== currentTheme, 'Theme toggle button should change the theme (light to dark)');
        check(newTheme === 'dark', 'New theme should be dark');
        check(env.getStorage()['theme'] === 'dark', 'Theme toggle button should save new theme to localStorage');

        console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
        if (failed > 0) process.exit(1);
    } catch (err) {
        console.error('❌ Theme Test failed:', err);
        process.exit(1);
    }
}

runTests();
