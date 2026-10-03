/* 鑰匙管理 fixture：vrt_keys（借出／歸還異動）＋ vrt_key_master（鑰匙名單）。2026-09，基準日 09-15 */
const P='data:image/png;base64,iVBORw0KGgo=';
const D=d=>'2026-09-'+String(d).padStart(2,'0');
const master=[
  {id:'m1',key_no:'K-01',key_name:'Warehouse main gate',dept:'warehouse',location:'Warehouse',key_type:'padlock',status:'active',createdAt:'2026-08-01 08:00:00',updatedAt:'2026-08-01 08:00:00'},
  {id:'m2',key_no:'K-02',key_name:'Cutting room',dept:'cutting',location:'Cutting',key_type:'standard',status:'active',createdAt:'2026-08-01 08:00:00',updatedAt:'2026-08-01 08:00:00'},
  {id:'m3',key_no:'K-07',key_name:'Finished goods store',dept:'finished',location:'FG store',key_type:'shutter',status:'active',createdAt:'2026-08-01 08:00:00',updatedAt:'2026-08-01 08:00:00'},
  {id:'m4',key_no:'K-12',key_name:'Expat dorm #301',dept:'dorm_foreign',location:'Dorm',key_type:'dorm_door',status:'active',createdAt:'2026-08-01 08:00:00',updatedAt:'2026-08-01 08:00:00'},
  {id:'m5',key_no:'K-15',key_name:'Meeting room',dept:'office',location:'Office',key_type:'office_door',status:'active',createdAt:'2026-08-01 08:00:00',updatedAt:'2026-08-01 08:00:00'},
  {id:'m6',key_no:'K-20',key_name:'Motorbike (GA)',dept:'admin',location:'Admin',key_type:'motorcycle',status:'active',createdAt:'2026-08-01 08:00:00',updatedAt:'2026-08-01 08:00:00'}
];
const EMP={'Sok Chea':'1234','Chan Dara':'1187','Phalla Vann':'2045','Srey Mom':'0312','Ratha Kim':'0088','Vuthy Heng':'3301'};
const mv=(id,day,no,dept,who,out,back,extra)=>Object.assign({id,masterId:master.find(m=>m.key_no===no).id,key_no:no,key_name:master.find(m=>m.key_no===no).key_name,dept,recipient_name:who,recipient_id:EMP[who]||'',issue_date:D(day),issue_time:out,checker:'Nin',key_type:master.find(m=>m.key_no===no).key_type,key_condition:'good',createdAt:D(day)+' '+out+':00',updatedAt:D(day)+' '+(back||out)+':00'},back?{return_date:D(day),return_time:back,receiver_name:'Nin',return_condition:'good'}:{},extra||{});
const records=[
  mv('k01',1,'K-01','warehouse','Sok Chea','07:30','17:05'),
  mv('k02',1,'K-02','cutting','Chan Dara','07:35','16:50'),
  mv('k03',2,'K-01','warehouse','Sok Chea','07:28','17:10'),
  mv('k04',3,'K-07','finished','Phalla Vann','08:00','17:30'),
  mv('k05',4,'K-15','office','Srey Mom','08:10','12:00'),
  mv('k06',5,'K-02','cutting','Chan Dara','07:32','17:00'),
  mv('k07',8,'K-01','warehouse','Sok Chea','07:31','17:02'),
  mv('k08',9,'K-20','admin','Ratha Kim','09:00','',{remarks:'Market run',photos:[P]}),        /* 未歸還（逾期） */
  mv('k09',10,'K-07','finished','Phalla Vann','08:05','17:20'),
  mv('k10',11,'K-12','dorm_foreign','Vuthy Heng','18:00','',{return_date:D(12),return_time:'07:00',receiver_name:'Nin',return_condition:'damaged',remarks:'Key bent'}),
  mv('k11',12,'K-01','warehouse','Sok Chea','07:30','17:00'),
  mv('k12',12,'K-15','office','Srey Mom','13:00','',{return_date:D(12),return_time:'15:00',receiver_name:'Nin',return_condition:'lost',remarks:'Lost at canteen'}),
  mv('k13',15,'K-01','warehouse','Sok Chea','07:29',''),                                    /* 基準日借出，尚未歸還 */
  mv('k14',15,'K-07','finished','Phalla Vann','08:10',''),                                  /* 基準日借出，尚未歸還 */
  mv('k15',15,'K-02','cutting','Chan Dara','07:33','16:55'),
  mv('k16',16,'K-02','cutting','Chan Dara','07:30','17:00'),
  mv('k17',18,'K-12','dorm_foreign','Vuthy Heng','17:50','',{return_date:D(19),return_time:'06:45',receiver_name:'Nin'}),
  mv('k18',22,'K-01','warehouse','Sok Chea','07:30','17:00')
];
module.exports={seed:{vrt_keys:records,vrt_key_master:master,vrt_key_tombstones:[]}};
