const assert=require('assert');
const {load}=require('./dom-harness.cjs');
const photo='data:image/jpeg;base64,b2xk';
const snapshot=v=>JSON.parse(JSON.stringify(v));
(async()=>{
  let x=await load('ac_gascheck_keymovement_v2.html',{
    vrt_key_master:[{id:'m1',key_no:'K-01',key_name:'Office',key_type:'Office door key',photos:[photo],status:'active',updatedAt:'2026-08-01'},{id:'m2',key_no:'K-02',key_name:'Store',key_type:'一般鑰匙',status:'active'}],
    vrt_keys:[{id:'loan1',masterId:'m1',key_no:'K-01',issue_date:'2026-08-02',issue_time:'08:30',recipient_name:'Phea',checker:'Jenny',photos:[photo],return_date:'2026-08-03',history:[{type:'created'}],updatedAt:'2026-08-03'}]
  });
  let {w}=x;assert.deepStrictEqual(x.errors,[]);
  assert(w.document.querySelector('.km-entry-card .km-entry-row'));
  w.editRecord('loan1');assert.equal(w.document.getElementById('km-batch-date').value,'2026-08-02');assert.equal(w.document.getElementById('km-batch-time').value,'08:30');
  assert.equal(w.document.querySelectorAll('.km-entry-photos .gc-photo-thumb').length,1);
  assert(w.document.querySelector('.km-entry-photos input[capture="environment"]'));
  w.keyBatchSaveAll();let record=snapshot(w.records.find(r=>r.id==='loan1'));assert.deepStrictEqual(record.photos,[photo]);assert.equal(record.history.length,2);assert.equal(record.return_date,'2026-08-03');
  w.keyMasterOpen();w.document.getElementById('km-m-no').value=' ｋ-０１ ';w.document.getElementById('km-m-name').value='Duplicate';w.keyMasterSave();assert.equal(w.KEY_V31.activeMaster().length,2);
  w.closeModal('km-master-modal');w.keyBatchClear();
  let rowId=w.document.querySelector('[id^="km-batch-photos-"]').id.replace('km-batch-photos-','');w.keyBatchSet(rowId,'masterId','m2');w.keyBatchSet(rowId,'recipient_name','Guard 2');
  const input=w.document.querySelector('.km-entry-photos input[capture]');w.GC.photo.compress=async()=>photo;Object.defineProperty(input,'files',{configurable:true,value:[{type:'image/jpeg'}]});await input.onchange();w.keyBatchSaveAll();
  assert.equal(w.records.length,2);assert.deepStrictEqual(snapshot(w.records.find(r=>r.masterId==='m2').photos),[photo]);
  w.keyBatchClear();rowId=w.document.querySelector('[id^="km-batch-photos-"]').id.replace('km-batch-photos-','');w.keyBatchSet(rowId,'masterId','m2');w.keyBatchSet(rowId,'recipient_name','Other Guard');w.keyBatchSaveAll();assert.equal(w.records.length,2,'outstanding key cannot be issued twice');
  w.keyMasterDelete('m1');assert(!w.KEY_V31.activeMaster().some(r=>r.id==='m1'));assert(w.records.some(r=>r.id==='loan1'),'master deletion retains loan history');
  const merged=w.KEY_V31.reconcileMasters([{id:'a',key_no:' k-9 ',key_type:'Access card',photos:['a'],updatedAt:'2026-08-01'},{id:'b',key_no:'Ｋ-９',photos:['b'],updatedAt:'2026-08-02'}]);assert.equal(merged.filter(r=>!r._deleted).length,1);assert.equal(merged.find(r=>!r._deleted).photos.length,2);assert(merged.find(r=>r._deleted)._mergedInto);
  assert.deepStrictEqual(x.errors,[]);x.dom.window.close();

  x=await load('ac_gascheck_waterdrum_v2.html',{wdr_2026_08:[{day:2,fQty:3,fPrice:3000,fTtl:1,fTime:'08:00',sQty:2,sPrice:4000,sTime:'15:30',photos:[photo,'https://example.test/2.jpg','https://example.test/3.jpg'],updatedAt:'2026-08-02'}],wdr_cfg_2026_08:{facPrice:3000,staPrice:4000,exchangeRate:4000,drumLiters:20}});
  w=x.w;assert.deepStrictEqual(x.errors,[]);w.document.getElementById('sel-year').value='2026';w.document.getElementById('sel-month').value='8';w.loadMonthData();
  assert.equal(w.document.querySelectorAll('#table-body tr').length,32,'month shows 31 editable days plus total');
  w.setWaterLocation('factory');assert.equal(w.document.getElementById('main-table').dataset.location,'factory');assert.equal(w.document.querySelector('[data-wdr-location=factory]').getAttribute('aria-pressed'),'true');
  w.updateRow(1,'fQty','4');assert.equal(w.document.getElementById('fttl-1').textContent,'12,000');
  w.updateRow(1,'fPrice','0');assert.equal(w.document.getElementById('fttl-1').textContent,'0');w.updateRow(1,'fQty','5');assert.equal(JSON.parse(w.localStorage.getItem('wdr_2026_08'))[1].fPrice,'0','free delivery keeps zero price');
  w.updateRow(1,'fPrice','3000');w.updateRow(1,'fQty','4');w.updateRow(1,'fQty','-3');assert.equal(JSON.parse(w.localStorage.getItem('wdr_2026_08'))[1].fQty,'4','invalid quantity rejected');
  w.openWaterPhotos(1);assert(w.document.querySelector('#wdr-edit-fPhotos input[capture]'));assert(!w.document.querySelector('#wdr-edit-sPhotos'));assert.equal(w.document.querySelectorAll('#wdr-edit-photos img').length,3,'old photos are not truncated');
  const camera=w.document.querySelector('#wdr-edit-fPhotos input[capture]');w.GC.photo.compress=async()=>photo;Object.defineProperty(camera,'files',{configurable:true,value:[{type:'image/jpeg'}]});await camera.onchange();w.closeWaterPhotos();
  let rows=JSON.parse(w.localStorage.getItem('wdr_2026_08'));assert.equal(rows[1].fPhotos.length,1);assert.equal(rows[1].photos.length,3);assert.equal(rows[1].sQty,2);
  w.setWaterLocation('staff');w.openWaterPhotos(1);assert(w.document.querySelector('#wdr-edit-sPhotos input[capture]'));w.closeWaterPhotos();
  const cfg=w.__configs.waterdrum;const incoming=cfg.read();cfg.write(incoming.concat(incoming));assert.equal(cfg.read().filter(r=>r.date==='2026-08-02').length,1);assert.equal(cfg.read().find(r=>r.date==='2026-08-02').updatedAt,incoming.find(r=>r.date==='2026-08-02').updatedAt);
  const packet=w.buildWaterTelegram({cfg,period:'month',ref:'2026-08-01',scope:'all',slot:'all',mode:'summary',lang:'en'});assert.equal(packet.pages.length,3);assert(packet.text.includes('F 4 × 3000 = 12000'));assert(packet.text.includes('S 2 × 4000 = 8000'));assert(packet.text.includes('20,000 KHR / $5.00'));
  assert.equal((packet.text.match(/2026-08-\d{2} │/g)||[]).length,31);assert(!packet.buttons);
  const approval=w.buildWaterTelegram({cfg,period:'month',ref:'2026-08-01',scope:'all',slot:'all',mode:'approval',lang:'en'});assert(approval.buttons[0][0].data.startsWith('wdr_ok_2026-08_all_all_'));
  const factory=w.buildWaterTelegram({cfg,period:'month',ref:'2026-08-01',scope:'factory',slot:'all',mode:'summary',lang:'en'});assert(factory.text.includes('12,000 KHR / $3.00'));assert(!factory.text.includes('S 2 ×'));
  w.document.querySelector('[data-gc-open-tg]').onclick();await new Promise(r=>setTimeout(r,30));assert(w.document.querySelector('.gc-common-modal[data-gc-tool=waterdrum] [data-gc-mode=review]').hidden);const select=w.document.querySelector('[data-gc-scope]');select.value='factory';select.onchange();await new Promise(r=>setTimeout(r,30));assert.equal(w.document.querySelector('[data-gc-send]').disabled,false,'factory scope retains the daily records');
  assert.deepStrictEqual(x.errors,[]);x.dom.window.close();
  console.log('v56 DOM operations: key photo/edit/history/duplicate safeguards and water location/photo/cloud/monthly reports PASS');
})().catch(e=>{console.error(e);process.exit(1)});
