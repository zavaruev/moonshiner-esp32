const fs = require('fs');
const { JSDOM } = require('jsdom');
const assert = require('assert');

let jsCode = fs.readFileSync('./moonshiner_ui_v24.js', 'utf8');

// Expose injectAssets for testing
jsCode = jsCode.replace('function injectAssets() {', 'window.injectAssets = injectAssets;\n    function injectAssets() {');

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

async function setup(storedTheme, prefersDark, initialHTML = '') {
    let mockStorage = {};
    if (storedTheme) mockStorage['theme'] = storedTheme;

    const html = `
    <!DOCTYPE html>
    <html>
    <head>${initialHTML}</head>
    <body></body>
    </html>
    `;

    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        url: 'http://localhost/',
        beforeParse(window) {
            window.matchMedia = query => ({
                matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false
            });

            // Overwrite localStorage
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

    const scriptEl = document.createElement('script');
    scriptEl.textContent = jsCode;
    document.body.appendChild(scriptEl);

    return new Promise(resolve => {
        setTimeout(() => {
            resolve({ window, document });
        }, 100);
    });
}

async function runTests() {
    console.log('\nRunning injectAssets() tests...');

    try {
        // Test 1: Injects meta viewport if missing
        let env = await setup(null, false);
        env.window.injectAssets();
        let meta = env.document.querySelector('meta[name="viewport"]');
        check(meta !== null, 'meta viewport should be injected');
        check(meta.content === 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no', 'meta viewport should have correct content');

        // Test 2: Does not inject duplicate meta viewport if existing
        env = await setup(null, false, '<meta name="viewport" content="existing-content">');
        env.window.injectAssets();
        let metas = env.document.querySelectorAll('meta[name="viewport"]');
        check(metas.length === 1, 'Should not duplicate existing meta viewport');
        check(metas[0].content === 'existing-content', 'Should keep existing meta viewport content');

        // Test 3: Favicon generation (Light theme)
        // Light theme -> no stored preference, light system
        env = await setup(null, false);
        env.window.injectAssets();
        let link = env.document.querySelector('link[rel="icon"]');
        check(link !== null, 'Favicon link should be injected');
        check(link.href.includes('%230066cc'), 'Favicon should use light theme color (#0066cc) when default is light');

        // Test 4: Favicon generation (Dark theme)
        // Dark theme -> no stored preference, dark system
        env = await setup(null, true);
        env.window.injectAssets();
        link = env.document.querySelector('link[rel="icon"]');
        check(link !== null, 'Favicon link should be injected');
        check(link.href.includes('%232997ff'), 'Favicon should use dark theme color (#2997ff) when default is dark');

        // Test 5: Favicon generation (Stored preference override)
        // Stored dark, system light
        env = await setup('dark', false);
        env.window.injectAssets();
        link = env.document.querySelector('link[rel="icon"]');
        check(link.href.includes('%232997ff'), 'Favicon should use dark theme color (#2997ff) when storage says dark despite system light');

        // Test 6: Updates existing favicon instead of duplicating
        env = await setup(null, false, '<link rel="icon" href="existing-icon.png">');
        env.window.injectAssets();
        let links = env.document.querySelectorAll('link[rel="icon"]');
        check(links.length === 1, 'Should not duplicate existing favicon link');
        check(links[0].href.includes('data:image/svg+xml'), 'Should update existing favicon href');
        check(links[0].href.includes('%230066cc'), 'Updated existing favicon should use correct light color');

        console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
        if (failed > 0) process.exit(1);
    } catch (err) {
        console.error('❌ injectAssets Test failed:', err);
        process.exit(1);
    }
}

runTests();
