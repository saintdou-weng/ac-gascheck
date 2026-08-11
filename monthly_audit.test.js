const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

class Range {
  constructor(sheet, row, col, rows, cols) {
    this.sheet = sheet; this.row = row; this.col = col; this.rows = rows; this.cols = cols;
  }
  getValues() {
    return Array.from({ length: this.rows }, (_, i) =>
      Array.from({ length: this.cols }, (_, j) =>
        (this.sheet.rows[this.row - 1 + i] || [])[this.col - 1 + j] ?? ''));
  }
  setValues(values) {
    values.forEach((line, i) => line.forEach((value, j) => {
      const r = this.row - 1 + i, c = this.col - 1 + j;
      while (this.sheet.rows.length <= r) this.sheet.rows.push([]);
      while (this.sheet.rows[r].length <= c) this.sheet.rows[r].push('');
      this.sheet.rows[r][c] = value;
    }));
    return this;
  }
  setBackground() { return this; }
  setFontColor() { return this; }
  setFontWeight() { return this; }
}

class Sheet {
  constructor(name, rows) { this.name = name; this.rows = rows || []; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.reduce((n, r) => Math.max(n, r.length), 0); }
  getDataRange() { return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  getRange(row, col, rows, cols) { return new Range(this, row, col, rows, cols); }
  appendRow(row) { this.rows.push(row.slice()); return this; }
  setFrozenRows() { return this; }
  deleteRows(start, count) { this.rows.splice(start - 1, count); }
  clear() { this.rows = []; }
}

const sheets = Object.create(null);
const spreadsheet = {
  getSheetByName(name) { return sheets[name] || null; },
  insertSheet(name) { return (sheets[name] = new Sheet(name)); }
};
const props = Object.create(null);
const scriptProperties = {
  getProperty(k) { return props[k] || null; },
  setProperty(k, v) { props[k] = String(v); },
  deleteProperty(k) { delete props[k]; }
};

function pad(n) { return String(n).padStart(2, '0'); }
function formatDate(date, _tz, pattern) {
  const d = new Date(date);
  const values = {
    yyyy: d.getUTCFullYear(), MM: pad(d.getUTCMonth() + 1), M: d.getUTCMonth() + 1,
    dd: pad(d.getUTCDate()), d: d.getUTCDate(), HH: pad(d.getUTCHours()),
    mm: pad(d.getUTCMinutes()), ss: pad(d.getUTCSeconds())
  };
  return pattern.replace(/yyyy|MM|dd|HH|mm|ss|M|d/g, k => values[k]);
}

const context = {
  console, JSON, Math, Date, String, Number, Boolean, Array, Object, RegExp, Error,
  Logger: { log() {} },
  Utilities: { formatDate },
  SpreadsheetApp: { openById() { return spreadsheet; } },
  PropertiesService: { getScriptProperties() { return scriptProperties; } },
  ScriptApp: { getProjectTriggers() { return []; }, newTrigger() { throw new Error('not used'); } },
  ContentService: { createTextOutput() { return { setMimeType() { return this; } }; }, MimeType: { JSON: 'json' } },
  HtmlService: { createHtmlOutput(v) { return v; } },
  UrlFetchApp: { fetch() { throw new Error('network must be mocked'); } },
  DriveApp: {}, MimeType: {}, Blob: function () {},
  setTimeout, clearTimeout
};
vm.createContext(context);
const source = fs.readFileSync(path.join(__dirname, '..', 'ac_gascheck_core_v3_fixed.gs'), 'utf8');
vm.runInContext(source, context, { filename: 'ac_gascheck_core_v3_fixed.gs' });

const moduleRows = {
  asset:       [['id', 'purchase_date'], ['a1', '2026-07-10']],
  dormitory:   [['id', 'date'], ['d1', '2026-07-11']],
  cleaning:    [['id', 'date']],
  keymovement: [['id', 'issue_date'], ['k1', '2026-07-12']],
  ehs:         [['id', 'date', 'sourceType'], ['e1', '2026-07-13', 'recycle']],
  waterdrum:   [['id', 'date'], ['w1', '2026-07-14']],
  temperature: [['id', 'd'], ['t1', '2026-07-15']]
};
Object.keys(moduleRows).forEach(name => { sheets[name] = new Sheet(name, moduleRows[name]); });

const activityHeaders = ['ts','event','tool','reportMonth','period','mode','scope','slot','language','ref','count','note'];
const activityRows = [activityHeaders];
['asset','dormitory','cleaning','ehs','waterdrum','temperature'].forEach(tool => {
  activityRows.push(['2026-08-01 09:00:00','telegram',tool,'2026-07','month','summary',tool === 'ehs' ? 'recycle' : '','','bi','2026-07-01',1,'test']);
});
activityRows.push(['2026-08-01 09:00:00','telegram','keymovement','2026-07','week','summary','','','bi','2026-07-01',1,'test']);
sheets.ActivityLog = new Sheet('ActivityLog', activityRows);

const audit = context.auditMonthlyCompletion_('2026-07');
assert.deepStrictEqual(Array.from(audit.missing, x => x.tool + (x.scope ? ':' + x.scope : '')), ['cleaning', 'keymovement', 'ehs:waste']);
assert.strictEqual(audit.missing[0].cloud, false, 'Cleaning must remain missing when Telegram was sent without cloud upload');
assert.strictEqual(audit.missing[0].telegram, true);
assert.strictEqual(audit.missing[1].cloud, true);
assert.strictEqual(audit.missing[1].telegram, false, 'Weekly summary must not count as the monthly report');
assert.strictEqual(audit.missing[2].cloud, false, 'EHS Recycle data must not complete the separate Waste report');
assert.strictEqual(audit.missing[2].telegram, false, 'A Recycle-only Telegram report must not complete Waste');

const message = context.buildMonthlyMissingMessage_(audit);
assert(message.includes('Previous-month report reminder'));
assert(message.includes('ការរំលឹករបាយការណ៍ខែមុន'));
assert(message.includes('Cloud upload missing'));

context.recordCloudUploadActivity_({ reportMonth: '2026-06', reportPeriod: 'month' }, 'cleaning', [
  { id: 'c1', date: '2026-07-20' }
]);
const trackedUploads = context.readActivity_().filter(r => r.event === 'cloud_upload' && r.tool === 'cleaning');
assert(trackedUploads.some(r => r.reportMonth === '2026-07'));
assert(!trackedUploads.some(r => r.reportMonth === '2026-06'), 'Selected month alone must not fake a transaction-module upload');

let sendCount = 0;
context.tgSendWithKeyboard_ = function () { sendCount++; return true; };
const first = context.sendMonthlyMissingReport_('2026-07', true);
const second = context.sendMonthlyMissingReport_('2026-07', true);
assert.strictEqual(first.ok, true);
assert.strictEqual(first.sent, true);
assert.strictEqual(second.skipped, true);
assert.strictEqual(sendCount, 1, 'The same report month must only notify once');

console.log('monthly audit tests: PASS');
