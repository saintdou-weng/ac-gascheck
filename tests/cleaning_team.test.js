const assert=require('node:assert/strict');
const T=require('../gc-cleaning-team.js');
const date='2026-11-28';
const db={cleaners:['Existing Cleaner'],checkers:['Existing Inspector'],records:[{id:'saved',checker:'Existing Inspector',photos:['unchanged']}],locations:[{id:'canteen',name:'Canteen',type:'canteen',resp:'Existing Cleaner'}]};
const before=JSON.stringify([db.cleaners,db.checkers,db.records]);
assert.equal(T.migrate(db),true);
assert.equal(T.migrate(db),false);
assert.equal(db.locations.filter(l=>l.type==='kitchen').length,1);
assert.equal(db.locations.find(l=>l.type==='canteen').resp,'Existing Cleaner');
assert.equal(JSON.stringify([db.cleaners,db.checkers,db.records]),before,'kitchen migration must preserve names, inspectors, records and photos');
const existing={locations:[{id:'old-kitchen',name:'廚房',type:'other'}]};
T.migrate(existing);assert.equal(existing.locations.length,1);assert.equal(existing.locations[0].type,'kitchen');
const removed={locations:[],personnel:{kitchenRemoved:true}};assert.equal(T.migrate(removed),false);
const people=T.roster({emp:[{emp_no:'001',name:'Full Cleaner',status:'在職'},{emp_no:'002',name:'Twin Name'},{emp_no:'003',name:'Twin Name'},{emp_no:'004',name:'Kitchen Person'}],empdet:[{emp_no:'001',position:'Cleaner',group:'GA'},{emp_no:'004',position:'Cook',group:'Kitchen'},{emp_no:'005',name:'Former Cook',position:'Cook',leave_date:'2026-11-01'}],edits:{empdet:{'004':{f:{name_en:'Updated Kitchen Name'}}}}});
assert.equal(people.length,5);
assert.equal(T.match('full cleaner',people,{}).id,'001');
assert.equal(T.match('Cleaner',people,{}),null,'a partial name must not link to the wrong person');
assert.equal(T.match('Twin Name',people,{}),null,'ambiguous full names require an explicit ID');
assert.equal(T.match('Twin Name',people,{twinname:'003'}).id,'003');
assert.equal(T.match('Twin Name',people,{twinname:'missing'}),null,'missing saved IDs must not silently relink');
const kitchen=db.locations.find(l=>l.type==='kitchen');
assert.deepEqual(T.assigned(db,kitchen,people,date),['hr:004']);
const historical={cleaners:['Recorded Cleaner'],locations:[],records:[{locId:'office',date:'2026-11-27',cleaner:'Recorded Cleaner'},{locId:'office',date:'2026-12-01',cleaner:'Future Cleaner'},{locId:'office',date:'2026-11-28',cleaner:'Deleted Cleaner',_deleted:true}]};
assert.deepEqual(T.assigned(historical,{id:'office',resp:'Old Default'},people,date),['Recorded Cleaner'],'actual latest cleaners replace obsolete display defaults; future/deleted records are excluded');
assert.deepEqual(T.assigned(historical,{id:'office',resp:'Recorded Cleaner'},people,date),['Recorded Cleaner'],'a configured cleaner keeps their assignment');
assert.equal(people.find(p=>p.id==='004').en,'Updated Kitchen Name');
db.personnel.assignments[kitchen.id]=[];assert.deepEqual(T.assigned(db,kitchen,people,date),[],'an explicit empty assignment is retained');
db.personnel.assignments[kitchen.id]=['hr:004','hr:004'];assert.deepEqual(T.metadata(db.personnel).assignments[kitchen.id],['hr:004']);
assert.deepEqual(Object.keys(T.metadata({...db.personnel,token:'never-sync',employees:people})).sort(),['assignments','kitchenRemoved','links'],'sync metadata contains references, not HR records or credentials');
const cols=['emp_no','date','time_in','time_out','hrs_actual'];
const attendance=T.attendance([
 {key:'new',at:'2026-11-28 17:00',cols:JSON.stringify(cols),rows:[['001',date,'08:00','17:00',8],['002',date,'','',0],['003',date,'00:00','00:00',0]]},
 {key:'old',at:'2026-11-28 08:00',cols,rows:[['001',date,'08:00','12:00',4],['001','2026-11-27','08:00','17:00',8]]}
],date);
assert.equal(attendance.size,3);assert.equal(attendance.get('001').hrs,8,'overlapping imports use one latest daily row');
assert.equal(attendance.get('001').status,'present');assert.equal(attendance.get('002').status,'no-punch');assert.equal(attendance.get('003').status,'no-punch');assert.equal(attendance.get('004'),undefined,'missing daily data does not imply absence');
const bins=T.binRows([{id:'a',label:'A',bins:{1:'3',3:4}},{id:'b',label:'B',bins:{1:2,5:1,99:20}}]);
assert.equal(bins.reduce((n,r)=>n+r.qty,0),10,'numeric bin counts must not concatenate or include unknown types');
console.log('Cleaning people, kitchen migration, exact HR links, daily attendance and shared bin totals: PASS');
