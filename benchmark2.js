const { JSDOM } = require("jsdom");
const fs = require("fs");

const dom = new JSDOM(`<!DOCTYPE html>
<html>
  <body>
    <div id="col-temp-card"></div>
    <div id="col-temp-arc"></div>
    <div id="tank-temp-card"></div>
    <div id="tank-temp-arc"></div>
  </body>
</html>`);

const window = dom.window;
const document = window.document;

const MathObj = Math;

function updateTempVisuals_baseline(sensorId, tempC) {
    const card = document.getElementById(sensorId === 'sensor-column_temperature' ? 'col-temp-card' : 'tank-temp-card');
    const arc = document.getElementById(sensorId === 'sensor-column_temperature' ? 'col-temp-arc' : 'tank-temp-arc');
    if (!card || tempC === null) return;
    card.classList.remove('temp-cold', 'temp-warm', 'temp-hot');
    const frac = MathObj.min(1, MathObj.max(0, (tempC - 20) / 80));
    const circ = 88;
    if (arc) arc.setAttribute('stroke-dashoffset', circ - frac * circ);
    const color = tempC < 60 ? 'var(--primary)' : tempC < 80 ? 'var(--warn)' : 'var(--danger)';
    if (arc) arc.setAttribute('stroke', color);
    if (tempC < 60) card.classList.add('temp-cold');
    else if (tempC < 80) card.classList.add('temp-warm');
    else card.classList.add('temp-hot');
}

const colTempCard = document.getElementById('col-temp-card');
const tankTempCard = document.getElementById('tank-temp-card');
const colTempArc = document.getElementById('col-temp-arc');
const tankTempArc = document.getElementById('tank-temp-arc');

function updateTempVisuals_optimized(sensorId, tempC) {
    const isCol = sensorId === 'sensor-column_temperature';
    const card = isCol ? colTempCard : tankTempCard;
    const arc = isCol ? colTempArc : tankTempArc;

    if (!card || tempC === null) return;
    card.classList.remove('temp-cold', 'temp-warm', 'temp-hot');
    const frac = MathObj.min(1, MathObj.max(0, (tempC - 20) / 80));
    const circ = 88;
    if (arc) arc.setAttribute('stroke-dashoffset', circ - frac * circ);
    const color = tempC < 60 ? 'var(--primary)' : tempC < 80 ? 'var(--warn)' : 'var(--danger)';
    if (arc) arc.setAttribute('stroke', color);
    if (tempC < 60) card.classList.add('temp-cold');
    else if (tempC < 80) card.classList.add('temp-warm');
    else card.classList.add('temp-hot');
}

const iterations = 5000000;

for (let i = 0; i < 1000; i++) {
    updateTempVisuals_baseline('sensor-column_temperature', 40);
    updateTempVisuals_baseline('sensor-tank_temperature', 60);
    updateTempVisuals_optimized('sensor-column_temperature', 40);
    updateTempVisuals_optimized('sensor-tank_temperature', 60);
}

const startBase = process.hrtime.bigint();
for (let i = 0; i < iterations; i++) {
    updateTempVisuals_baseline('sensor-column_temperature', (i % 80) + 10);
    updateTempVisuals_baseline('sensor-tank_temperature', (i % 80) + 10);
}
const endBase = process.hrtime.bigint();
const timeBase = Number(endBase - startBase) / 1e6; // ms

const startOpt = process.hrtime.bigint();
for (let i = 0; i < iterations; i++) {
    updateTempVisuals_optimized('sensor-column_temperature', (i % 80) + 10);
    updateTempVisuals_optimized('sensor-tank_temperature', (i % 80) + 10);
}
const endOpt = process.hrtime.bigint();
const timeOpt = Number(endOpt - startOpt) / 1e6; // ms

console.log(`Baseline: ${timeBase.toFixed(2)} ms`);
console.log(`Optimized: ${timeOpt.toFixed(2)} ms`);
console.log(`Improvement: ${((timeBase - timeOpt) / timeBase * 100).toFixed(2)}%`);
