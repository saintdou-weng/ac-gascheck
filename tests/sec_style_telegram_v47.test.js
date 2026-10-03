const fs = require('fs');
const assert = require('assert');
const temp = fs.readFileSync('ac_gascheck_temperature_v2.html','utf8');
const ehs = fs.readFileSync('ac_gascheck_ehs_v2.html','utf8');

// Temperature (2026-10-03 compact card): day report = one AM → PM line per zone, longer periods =
// one range line per zone; only out-of-range readings are listed; photos only follow those readings.
assert(!temp.includes("tempTgTable("), 'no space-padded tables');
assert(!/padEnd\(/.test(temp.slice(temp.indexOf('function buildTGPeriodMsg'))));
assert(temp.includes("GC.TG"));
assert(temp.includes("⏱ AM 08:00–09:00 → PM 15:30–16:30"));
assert(temp.includes("reportZones.forEach(function(z){"));
assert(temp.includes("' · AM '+tempTgReading(am)+' → PM '+tempTgReading(pm)"));
assert(temp.includes("lb('超標','Out of range','ហួសកំណត់')"));
assert(temp.includes("abnormal.forEach(r=>{"), 'photos collected from out-of-range readings only');
assert(temp.includes("photos.length<5"));
assert(temp.includes("summarySentAt"));
assert(temp.includes("approvalSentAt"));

// EHS (1003 TG format) uses the GC.TG card: verdict, trip bar vs SUP_TARGET, one line per supplier,
// exceptions only; no padded tables. Duplicate protection and photo dispatch are preserved.
assert(!ehs.includes("ehsTgTable("));
assert(!ehs.includes("padEnd("));
assert(ehs.includes("G.bar(wasteRows.length,total)"));
assert(ehs.includes("list.length+'/'+supTarget+' '+lb('趟','trips','ជើង')"));
assert(ehs.includes("G.sec('⚠️',lb('需注意','To check','ត្រូវពិនិត្យ'))"));
assert(ehs.includes("ehsUniqueWasteRows(rows)"));
assert(ehs.includes("ehsWasteDuplicateKey"));
assert(ehs.includes("photos.length<5"));
assert(ehs.includes("summarySentAt"));
assert(ehs.includes("approvalSentAt"));
console.log('v50 Telegram tables without copy-code buttons passed');
