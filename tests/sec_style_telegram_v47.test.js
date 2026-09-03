const fs = require('fs');
const assert = require('assert');
const temp = fs.readFileSync('ac_gascheck_temperature_v2.html','utf8');
const ehs = fs.readFileSync('ac_gascheck_ehs_v2.html','utf8');

// Temperature uses SEC-like monospace tables and still collects photos.
assert(temp.includes("tempTgTable(['Item','Qty']"));
assert(temp.includes("tempTgTable(['Date','Slot','Temp','RH','Status']"));
assert(temp.includes("tempTgTable(['Date','Slot','Weather']"));
assert(temp.includes("tempTgTable(['Date','Slot','Inspector']"));
assert(temp.includes("'🏭 <b>'+tempTgEsc(zoneFullName(id))"));
assert(temp.includes("return '<blockquote><b>'+tempTgEsc(line(headers))"));
assert(!temp.includes("return '<pre>'+tempTgEsc"));
assert(temp.includes("photos.length<5"));
assert(temp.includes("summarySentAt"));
assert(temp.includes("approvalSentAt"));

// EHS uses aligned tables, preserves duplicate protection and photo dispatch.
assert(ehs.includes("ehsTgTable(['Item','Qty']"));
assert(ehs.includes("ehsTgTable(['Date','Co','Type','Kg','In','Out']"));
assert(ehs.includes("return '<blockquote><b>'+ehsTgEsc(line(headers))"));
assert(!ehs.includes("return '<pre>'+ehsTgEsc"));
assert(ehs.includes("ehsTgTable(['Date','Co','Dur','Inspector','Vehicle']"));
assert(ehs.includes("ehsUniqueWasteRows(rows)"));
assert(ehs.includes("ehsWasteDuplicateKey"));
assert(ehs.includes("photos.length<5"));
assert(ehs.includes("summarySentAt"));
assert(ehs.includes("approvalSentAt"));
console.log('v50 Telegram tables without copy-code buttons passed');
