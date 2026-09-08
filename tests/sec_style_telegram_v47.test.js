const fs = require('fs');
const assert = require('assert');
const temp = fs.readFileSync('ac_gascheck_temperature_v2.html','utf8');
const ehs = fs.readFileSync('ac_gascheck_ehs_v2.html','utf8');

// Temperature keeps day detail, while longer periods use compact zone/slot
// summaries and expand only abnormal records. Photos remain supported.
assert(temp.includes("tempTgTable(['Item','Qty']"));
assert(temp.includes("['morning','afternoon'].forEach(function(p)"));
assert(temp.includes("AM | Morning 08:00–09:00"));
assert(temp.includes("PM | Afternoon 15:30–16:30"));
assert(temp.includes("'🏭 <b>'+tempTgEsc(tempTgShort(zoneFullName(r.z),48))"));
assert(temp.includes("if(period!=='day')"));
assert(temp.includes("tempTelegramText('區域摘要','Zone Summary'"));
assert(temp.includes("tempTelegramText('時段摘要','Slot Summary'"));
assert(temp.includes("tempTelegramText('檢查人','Inspector'"));
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
