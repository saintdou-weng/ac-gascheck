const fs=require('fs'),assert=require('assert');
const temp=fs.readFileSync('ac_gascheck_temperature_v2.html','utf8');
const clean=fs.readFileSync('ac_gascheck_cleaning_v2.html','utf8');
const gas=fs.readFileSync('ac_gascheck_core_v3_fixed.gs','utf8');

// Temperature zone CRUD is an authoritative, revisioned configuration.
for(const token of [
  "LSZREV='vrt_th_z_rev_v1'",
  'function compactTempZones(list)',
  'function applyRemoteTempZones(zones,revision)',
  "zonesMode:'replace',zoneConfigUpdatedAt:getZRev()",
  "syncZoneConfig('replace')"
])assert(temp.includes(token),'missing Temperature zone sync token: '+token);
assert(!temp.includes("zonesMode:'merge'"),'Temperature must not union deleted zones back into the list');
assert(gas.includes("GASCHECK_TEMPERATURE_ZONES_UPDATED_AT"));
assert(gas.includes("if(currentRevision&&(!revision||revision<currentRevision))return getTemperatureZones_()"));

// Cleaning locations/staff/slots use the same newer-revision-wins rule.
for(const token of [
  "configUpdatedAt:''",
  'const touchConfig = () =>',
  'const remoteRev=String(meta.configUpdatedAt',
  'state.touchConfig();state.save();areas.render()',
  "configUpdatedAt:d.configUpdatedAt||''"
])assert(clean.includes(token),'missing Cleaning configuration sync token: '+token);
assert(gas.includes("if(tool==='cleaning'&&old&&old.meta)"));

// Cleaning record deletion still reaches the cloud tombstone endpoint.
assert(clean.includes("api.post({action:'delete',tool:'cleaning',id:id})"));
assert(gas.includes("markGcDeletedRecords_(tool,list,'user_delete')"));
console.log('v57 authoritative Temperature zones and Cleaning configuration/delete tests: PASS');
