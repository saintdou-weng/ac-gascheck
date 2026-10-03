/* EHS 預覽資料：vrt_waste_v3 = {gate:[廢料], internal:[回收], monthly, tombstones}
   2026-09：K.S.W.M 5 趟、SONYAPICH 5 趟（各目標 4）；一筆沒填出廠時間、一筆停留 3 小時以上；回收 4 筆。 */
const P='data:image/png;base64,iVBORw0KGgo=';
const gate=[];const sup=['K.S.W.M','SONYAPICH'];
[1,3,5,8,10,12,15,17,19,22].forEach((d,i)=>gate.push({id:'W'+i,sourceType:'waste',module:'gate',date:'2026-09-'+String(d).padStart(2,'0'),supplier:sup[i%2],name:'Phan Lyda',weight_kg:200+i*10,solid_waste:i%3?'V':'',industrial_waste:i%3?'':'V',time_in:'09:27',time_out:i===4?'':(i===7?'13:00':'09:35'),car_number:'3A-1234',checked_by:'Phan Lyda',photos:i===3?[P]:[],updatedAt:'2026-09-'+String(d).padStart(2,'0')+'T10:00:00Z'}));
const internal=[];[2,9,16,23].forEach((d,i)=>internal.push({id:'R'+i,sourceType:'recycle',module:'internal',date:'2026-09-'+String(d).padStart(2,'0'),plastic_kg:30+i,fabric_kg:120,core_kg:10,total_kg:160+i,checked_by:'Phan Lyda',photos:[],updatedAt:'2026-09-'+String(d).padStart(2,'0')+'T10:00:00Z'}));
module.exports={seed:{vrt_waste_v3:{gate,internal,monthly:[],tombstones:[]}}};
