/* Temperature fixture: 4 zones × AM/PM over 2026-09-21 → 2026-10-02 (8 readings/day),
   two out-of-range readings: 09-30 PM Building B Warehouse 36°C (hot, with photo) and 10-02 AM Finishing WH 92% (very humid). */
const P='data:image/png;base64,iVBORw0KGgo=';
const zones=[
  {id:'za',zh:'A廠車間',en:'Building A Workshop',km:'អគារ A (រោងចក្រ)',col:'#4f6ef7',on:true},
  {id:'zb',zh:'B廠車間',en:'Building B Workshop',km:'អគារ B (រោងចក្រ)',col:'#8b5cf6',on:true},
  {id:'zc',zh:'B廠倉庫',en:'Building B Warehouse',km:'អគារ B (ឃ្លាំង)',col:'#f97316',on:true},
  {id:'z_buildingafinishingwh',zh:'A廠後整倉',en:'Building A Finishing WH',km:'ឃ្លាំងបញ្ចប់អគារ A',col:'#0ea5e9',on:true}
];
const days=['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02'];
const records=[];
days.forEach(function(d,di){
  ['morning','afternoon'].forEach(function(p,si){
    zones.forEach(function(z,zi){
      const t=(si?29:26)+zi+(di%3),h=(si?60:70)+zi*2+(di%2)*3;
      const r={id:'t_'+di+'_'+si+'_'+zi,d:d,p:p,z:z.id,t:t,h:h,wx:si?'sunny':'cloudy',checker:'Sreynin',note:'',ts:d+(si?' 15:45:00':' 08:20:00'),updatedAt:d+(si?' 15:45:00':' 08:20:00'),photos:[]};
      if(d==='2026-09-30'&&p==='afternoon'&&z.id==='zc'){r.t=36;r.h=58;r.note='Roof fan off';r.photos=[P];}
      if(d==='2026-10-02'&&p==='morning'&&z.id==='z_buildingafinishingwh'){r.t=27;r.h=92;}
      if(d==='2026-10-02'&&p==='morning'){r.weatherObservation={source:'MET Norway',observedAt:'2026-10-02T08:00',fetchedAt:'2026-10-02T08:05:00',temperature:27.4,humidity:84,precipitation:0.2,suggested:'cloudy'};}
      records.push(r);
    });
  });
});
module.exports={seed:{vrt_th_z:zones,vrt_th_r:records}};
