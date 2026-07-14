const fs = require('fs');
const { JSDOM } = require('jsdom');
// Modify the script string to expose addLog to window so we can call it
let jsCode = fs.readFileSync('./moonshiner_ui_v24.js', 'utf8');
jsCode = jsCode.replace('function addLog(msg) {', 'window.addLog = function(msg) {');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: 'dangerously',
  url: "http://localhost/"
});
const window = dom.window;
const document = window.document;

// Mock globals needed by moonshiner_ui_v24.js
window.matchMedia = () => ({ matches: false });
window.EventSource = class {
  addEventListener() {}
  onerror() {}
};

// Run the script
const scriptEl = document.createElement('script');
scriptEl.textContent = jsCode;
document.body.appendChild(scriptEl);

setTimeout(() => {
    // Open the diag toggle to create the log area
    document.getElementById('diag-toggle').click();

    // Call addLog with an XSS payload
    window.addLog('<img src="x" onerror="alert(1)">');

    // Check if the DOM has an img element
    const logArea = document.getElementById('log-area');
    const imgs = logArea.querySelectorAll('img');

    if (imgs.length > 0) {
      console.log('VULNERABLE: img tag created');
      process.exit(1);
    } else {
      console.log('SECURE: img tag NOT created');
      console.log('Log content:', logArea.innerHTML);
      process.exit(0);
    }
}, 500);
