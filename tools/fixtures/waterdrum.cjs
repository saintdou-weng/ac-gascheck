/* 送水預覽資料：wdr_YYYY_MM = [{day,fTime,fQty,fPrice,fTtl,sTime,sQty,sPrice,sTtl,checkBy,photos,fPhotos,sPhotos,updatedAt}]
   wdr_cfg_YYYY_MM = {facPrice,staPrice,exchangeRate,drumLiters,inspector,morningTime,afternoonTime}
   2026-08：週一～週六送水（週日不送），08-12 與 08-20 漏送；工廠 50 桶 × 2,000 KHR，宿舍每週二／五 10 桶 × 2,000；
   08-15 工廠 120 桶（數量異常）；檢查員 Vin（上半月）、Sopheak（下半月）。 */
const P='data:image/png;base64,iVBORw0KGgo=';
const rows=[];
for(let day=1;day<=31;day++){
  const d=new Date(2026,7,day),dow=d.getDay();
  if(dow===0||day===12||day===20)continue;           // 週日不送；兩天漏送
  const fQty=day===15?120:50,sQty=(dow===2||dow===5)?10:'';
  rows.push({day,fTime:'08:00',fQty,fPrice:2000,fTtl:fQty*2000,sTime:sQty?'15:30':'',sQty,sPrice:sQty?2000:'',sTtl:sQty?sQty*2000:0,
    checkBy:day<=15?'Vin':'Sopheak',photos:day===15?[P]:[],fPhotos:[],sPhotos:[],updatedAt:'2026-08-'+String(day).padStart(2,'0')+' 16:00:00'});
}
module.exports={seed:{
  wdr_2026_08:rows,
  wdr_cfg_2026_08:{facPrice:2000,staPrice:2000,exchangeRate:4100,drumLiters:20,inspector:'Vin',morningTime:'08:00',afternoonTime:'15:30'}
}};
