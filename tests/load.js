'use strict';
// Loads Apps Script .gs files into one shared vm context (like Apps Script global scope).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const GS_DIR = path.join(__dirname, '..', 'apps-script');

function pad(n, w = 2) { return String(n).padStart(w, '0'); }

function formatDate(d, tz, fmt) {
  const map = { yyyy: pad(d.getFullYear(), 4), MM: pad(d.getMonth() + 1), dd: pad(d.getDate()),
    HH: pad(d.getHours()), mm: pad(d.getMinutes()), ss: pad(d.getSeconds()) };
  return fmt.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, lit) => (lit !== undefined ? lit : map[m]));
}

/** @param {string[]} files basenames inside hr-os/apps-script, e.g. ['00_Config.gs'] */
function loadGs(files, extraGlobals = {}) {
  const sandbox = {
    Logger: { log() {} },
    Utilities: { formatDate, getUuid: () => 'test-uuid', sleep() {} },
    console,
    ...extraGlobals,
  };
  const ctx = vm.createContext(sandbox);
  for (const f of files) {
    const file = path.join(GS_DIR, f);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  return ctx;
}

/** Cross-realm safe deep-equal helper: JSON round trip. */
const plain = (x) => JSON.parse(JSON.stringify(x));

module.exports = { loadGs, plain, GS_DIR };
