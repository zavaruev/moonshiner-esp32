const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="log-area"></div></body></html>');
global.document = dom.window.document;

function runBenchmark(optimize) {
    const logBuffer = Array.from({length: 20}, (_, i) => "Log message " + i);
    const MAX_LOG = 20;

    let el = document.getElementById('log-area');
    el.innerHTML = ''; // reset

    const start = process.hrtime.bigint();

    // Simulate what happens in addLog
    for(let k = 0; k < 1000; k++) {
        el.innerHTML = ''; // reset for multiple iterations
        if (optimize) {
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < logBuffer.length; i++) {
                const bDiv = document.createElement('div');
                bDiv.textContent = logBuffer[i];
                fragment.appendChild(bDiv);
            }
            el.appendChild(fragment);
        } else {
            for (let i = 0; i < logBuffer.length; i++) {
                const bDiv = document.createElement('div');
                bDiv.textContent = logBuffer[i];
                el.appendChild(bDiv);
            }
        }
    }

    const end = process.hrtime.bigint();
    return Number(end - start) / 1_000_000; // ms
}

const timeUnoptimized = runBenchmark(false);
const timeOptimized = runBenchmark(true);

console.log(`Unoptimized: ${timeUnoptimized.toFixed(2)} ms`);
console.log(`Optimized:   ${timeOptimized.toFixed(2)} ms`);
console.log(`Improvement: ${((timeUnoptimized - timeOptimized) / timeUnoptimized * 100).toFixed(2)}%`);
