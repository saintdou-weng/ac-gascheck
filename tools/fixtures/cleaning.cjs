/* Cleaning fixture: 4 areas, slots 07:30…13:30, Khmer cleaner names, inspector Long moniroth,
   2026-09-20 → 2026-10-02; two failed checks (Toilet A 10-02 13:30 💡🚪 with photo, Canteen 09-30 12:30 🧹). */
const P='data:image/png;base64,iVBORw0KGgo=';
const locations=[
  {id:'loc_toilet_a',name:'Toilet A',type:'toilet',resp:'ដែត ច្រឹប'},
  {id:'loc_toilet_b',name:'Toilet B',type:'toilet',resp:'សុខ ស្រីពៅ'},
  {id:'loc_canteen',name:'Canteen',type:'canteen',resp:'ចាន់ ដារ៉ា'},
  {id:'loc_office',name:'Office',type:'office',resp:'សុខ ស្រីពៅ'}
];
const plan={loc_toilet_a:['07:30','08:30','09:30','12:30','13:30'],loc_toilet_b:['07:30','09:30','12:30','13:30'],loc_canteen:['08:30','12:30'],loc_office:['09:30']};
const ok={smell:true,light:true,floor:true,door:true,corner:true,ceiling:true};
const records=[];
const days=['2026-09-20','2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27','2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02'];
days.forEach(function(date,di){
  locations.forEach(function(loc,li){
    plan[loc.id].forEach(function(slot,si){
      const id='c_'+di+'_'+li+'_'+si,ts=date+' '+slot+':00';
      const r={id:id,batchId:id,timestamp:ts,updatedAt:ts,date:date,locId:loc.id,shift:'Day',cleaner:loc.resp,checker:'Long moniroth',slots:[slot],checks:Object.assign({},ok),note:'',photos:[],photoCount:0};
      if(date==='2026-10-02'&&loc.id==='loc_toilet_a'&&slot==='13:30'){r.checks.light=false;r.checks.door=false;r.note='អំពូលខូច ទ្វារបិទមិនជិត';r.photos=[P];r.photoCount=1;}
      if(date==='2026-09-30'&&loc.id==='loc_canteen'&&slot==='12:30'){r.checks.floor=false;r.note='Floor wet';}
      records.push(r);
    });
  });
});
module.exports={seed:{
  ac_gc_sender_cleaning_v1:'Paul',
  vrt_clean_hub_v2:{records:records,sixsRecords:[{id:'s6_1',timestamp:'2026-10-01 10:00:00',updatedAt:'2026-10-01 10:00:00',date:'2026-10-01',locId:'loc_office',observer:'Long moniroth',score:82,data:{}}],
    locations:locations,cleaners:['ដែត ច្រឹប','សុខ ស្រីពៅ','ចាន់ ដារ៉ា'],checkers:['Long moniroth'],slots:['07:30','08:30','09:30','10:30','12:30','13:30','14:30','15:30','16:30'],cfg:{}}
}};
