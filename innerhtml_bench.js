const { JSDOM } = require("jsdom");

const htmlString = `<div>` + `<span>Hello World</span>`.repeat(100) + `</div>`.repeat(100);

function baseline() {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
    const document = dom.window.document;

    const app = document.createElement('div');
    app.id = 'custom-app';
    document.body.appendChild(app);
    app.innerHTML = htmlString;
}

function optimized() {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
    const document = dom.window.document;

    const app = document.createElement('div');
    app.id = 'custom-app';
    app.innerHTML = htmlString;
    document.body.appendChild(app);
}

const iterations = 50; // reduced iterations

const startBase = process.hrtime.bigint();
for (let i = 0; i < iterations; i++) {
    baseline();
}
const endBase = process.hrtime.bigint();
const timeBase = Number(endBase - startBase) / 1e6;

const startOpt = process.hrtime.bigint();
for (let i = 0; i < iterations; i++) {
    optimized();
}
const endOpt = process.hrtime.bigint();
const timeOpt = Number(endOpt - startOpt) / 1e6;

console.log(`Baseline: ${timeBase.toFixed(2)} ms`);
console.log(`Optimized: ${timeOpt.toFixed(2)} ms`);
console.log(`Improvement: ${((timeBase - timeOpt) / timeBase * 100).toFixed(2)}%`);
