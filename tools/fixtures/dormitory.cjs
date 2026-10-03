/* 宿舍管理 fixture：vrt_dorm_hub_v2 = {records(申請), inspections(巡查), violations(違規), cfg}。2026-09，基準日 09-15 */
const P='data:image/png;base64,iVBORw0KGgo=';
const D=d=>'2026-09-'+String(d).padStart(2,'0');
const ts=(d,h)=>D(d)+' '+(h||'08:30')+':00';
const items=(chk,bad)=>['sheet','mattress','aircon','fan','pillow'].map((code,i)=>({code,name:'',checked:chk,condition:bad&&i===2?'Damaged':'Good',note:bad&&i===2?'Remote missing':''}));
const app=(id,day,type,name,idNo,room,dept,status,extra)=>Object.assign({id,timestamp:ts(day),updatedAt:ts(day),date:D(day),applyDate:D(day),type,name,idNo,roomNo:room,department:dept,position:'Operator',gender:'Male',phone:'',reason:type==='搬入'?'New hire':'Resigned',status,items:items(true,false),photos:[],applicant:name,reviewer:'Phea',source:'app'},extra||{});
const records=[
  app('d01',1,'搬入','Sok Chea','1234','B-12','Sewing','已核可',{approvedBy:'Paul',approvedAt:ts(1,'15:10')}),
  app('d02',2,'搬入','Chan Dara','1187','B-12','Cutting','已核可',{approvedBy:'Paul',approvedAt:ts(2,'15:00')}),
  app('d03',3,'搬出','Phalla Vann','2045','A-101','QC','已核可',{approvedBy:'Paul',approvedAt:ts(3,'16:00'),items:items(true,true),gender:'Female'}),
  app('d04',5,'搬入','Srey Mom','0312','A-102','Finishing','已退件',{rejectReason:'Room full',gender:'Female'}),
  app('d05',8,'搬入','Ratha Kim','0088','A-201','Warehouse','已核可',{approvedBy:'Paul',approvedAt:ts(8,'14:40')}),
  app('d06',10,'搬出','Vuthy Heng','3301','B-13','Sewing','已退件',{rejectReason:'Items not returned',items:items(false,true)}),
  app('d07',12,'搬入','Nita Sorn','4420','A-203','Sewing','已核可',{approvedBy:'Paul',approvedAt:ts(12,'15:30'),gender:'Female'}),
  app('d08',15,'搬入','Dara Pich','5102','B-14','Cutting','待審核'),
  app('d09',15,'搬出','Sokha Mao','0931','A-201','Warehouse','待審核',{items:items(true,false)}),
  app('d10',18,'搬入','Kunthea Ly','6118','A-202','QC','待審核',{gender:'Female'}),
  app('d11',22,'搬入','Bopha Chan','7001','B-15','Sewing','已核可',{approvedBy:'Paul',approvedAt:ts(22,'15:00'),gender:'Female'})
];
/* 巡查：data = {房號:{gas:'N'|'X'|'-', ..., remarks}}；#301 兩次巡查（第一次異常，第二次正常）→ 只列最新狀態 */
const ok=()=>({gas:'N',fan:'N',ctrl:'N',leak:'N',cap:'N',water:'N',elec:'N',ceil:'N',door:'N',win:'N',spray:'N',flush:'N',heater:'N',sink:'N',shower:'N',other:'-',remarks:''});
const insp=(id,day,loc,data,photos)=>({id,timestamp:ts(day,'10:00'),updatedAt:ts(day,'10:00'),date:D(day),quarter:'Q3',location:loc,inspector:'Nin',data,photos:photos||[],anomalies:Object.values(data).reduce((n,r)=>n+Object.keys(r).filter(k=>r[k]==='X').length,0)});
const inspections=[
  insp('i01',2,'foreignDorm',{'#201':ok(),'#202':ok(),'#203':ok()}),
  insp('i02',4,'foreignDorm',{'#301':Object.assign(ok(),{leak:'X',remarks:'Water dripping from A/C'}),'#302':ok(),'#303':Object.assign(ok(),{heater:'X'})},[P]),
  insp('i03',9,'localDorm',{'#101':ok(),'#102':ok(),'#103':Object.assign(ok(),{door:'X',remarks:'Lock broken'})},[P]),
  insp('i04',11,'foreignDorm',{'#301':ok(),'#302':ok()}),
  insp('i05',15,'factory',{'車間A':ok(),'車間B':ok(),'倉庫':Object.assign(ok(),{elec:'X',remarks:'Socket sparking'})},[P]),
  insp('i06',16,'office',{'會議室':ok(),'前台':ok()}),
  insp('i07',23,'localDorm',{'#201':ok(),'#202':ok()})
];
const viol=(id,day,name,idNo,room,type,level,desc)=>({id,timestamp:ts(day,'20:30'),updatedAt:ts(day,'20:30'),date:D(day),name,idNo,roomNo:room,type,level,desc,recordedBy:'Nin',action:level==='Serious'?'Written warning':'Verbal warning'});
const violations=[
  viol('v01',6,'Chan Dara','1187','B-12','noise','Minor','Loud music after 22:00'),
  viol('v02',13,'Ratha Kim','0088','A-201','visitor','Moderate','Visitor stayed overnight'),
  viol('v03',15,'Vuthy Heng','3301','B-13','damage','Serious','Broke the room door lock'),
  viol('v04',20,'Chan Dara','1187','B-12','noise','Minor','Loud music again')
];
module.exports={seed:{vrt_dorm_hub_v2:{records,inspections,violations,cfg:{}}}};
