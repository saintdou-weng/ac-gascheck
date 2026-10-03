/* 資產管理 fixture：vrt_a7（資產＋history）、vrt_p7（申請）、vrt_photos。2026-09，基準日 09-15 */
const P='data:image/png;base64,iVBORw0KGgo=';
const ts=(d,h)=>'2026-'+d+' '+(h||'09:00')+':00';
const A=(code,zone,name,cat,status,date,extra)=>Object.assign({id:code,code,zone,name,category:cat,status,brand:'',model:'',qty:1,unit:'pcs',unitPrice:0,location:zone==='factory'?'Admin office':'Dorm '+code.slice(-3),user:'',purchaseDate:date,remark:'',recordedBy:'Phea',lastEditedBy:'Phea',createdAt:date+' 09:00:00',updatedAt:date+' 09:00:00',history:[{type:'created',date:date+' 09:00:00',actor:'Phea'}]},extra||{});
const req=(id,type,date,by,data,reason,decision)=>{const h=[{type:'pending',date:ts(date,'10:00'),actor:by,telegram:'sent',approval:'telegram',request:Object.assign({id,type,reason},data)}];if(decision)h.push({type:decision,date:ts(date,'15:30'),actor:'Paul',request:{id}});return h;};
const assets=[
  A('AOA001','factory','Office desk','office_furniture','active','2024-03-12',{unitPrice:85,user:'Paul'}),
  A('AOA002','factory','Office chair','office_furniture','active','2024-03-12',{unitPrice:40,user:'Phary'}),
  A('AOA003','factory','Filing cabinet','metal_cabinet','active','2024-05-02',{unitPrice:120}),
  A('AOA004','factory','Printer HP M428','office_appliance','repair','2025-01-20',{unitPrice:450,remark:'Paper jam, waiting for parts',history:[{type:'created',date:ts('01-20'),actor:'Phea'},{type:'edit',date:ts('09-11','14:00'),actor:'Nin',statusTo:'repair'}]}),
  A('AOA005','factory','Water dispenser','office_appliance','active','2025-02-10',{unitPrice:95}),
  A('AOA006','factory','Pickup truck','vehicle','lent','2023-08-01',{unitPrice:12000,user:'Driver Sao'}),
  A('AOA007','factory','Air conditioner 1.5HP','office_appliance','active','2026-09-03',{unitPrice:380,history:[{type:'created',date:ts('09-03'),actor:'Nin'}]}),
  A('AOA008','factory','Whiteboard','office_furniture','standby','2026-09-10',{unitPrice:30,history:[{type:'created',date:ts('09-10'),actor:'Nin'}]}),
  A('AOA009','factory','Old fax machine','office_appliance','active','2022-04-15',{unitPrice:60,history:[{type:'created',date:ts('04-15'),actor:'Phea'}].concat(req('areq_f9x','disposal','09-12','Nin',{disposalType:'end_of_life'},'No longer used'))}),
  A('AOA010','factory','Steel shelf','metal_cabinet','active','2024-06-30',{unitPrice:70,history:[{type:'created',date:ts('06-30'),actor:'Phea'}].concat(req('areq_t10','transfer','09-14','Phea',{newLocation:'Warehouse B',newUser:'Sok Chea'},'Warehouse reorganisation'))}),
  A('AHA001','expat','Bed frame','dorm_furniture','active','2024-01-15',{unitPrice:150,location:'Room #201'}),
  A('AHA002','expat','Mattress','dorm_furniture','active','2024-01-15',{unitPrice:90,location:'Room #201'}),
  A('AHA003','expat','Air conditioner','dorm_appliance','repair','2024-01-15',{unitPrice:350,location:'Room #302',remark:'Not cooling',history:[{type:'created',date:ts('01-15'),actor:'Phea'},{type:'edit',date:ts('09-15','08:30'),actor:'Nin',statusTo:'repair'}]}),
  A('AHA004','expat','Refrigerator','dorm_appliance','disposed','2021-06-01',{unitPrice:280,location:'Room #303',history:[{type:'created',date:ts('06-01'),actor:'Phea'}].concat(req('areq_d4a','disposal','09-05','Phea',{disposalType:'unrepairable'},'Compressor dead','approved'))}),
  A('AHA005','expat','Washing machine','dorm_appliance','active','2025-03-20',{unitPrice:260,location:'Laundry',history:[{type:'created',date:ts('03-20'),actor:'Phea'}].concat(req('areq_t5b','transfer','09-08','Nin',{newLocation:'Local dorm laundry',newUser:''},'Local dorm has none','rejected'))}),
  A('AHA006','expat','Wardrobe','dorm_furniture','active','2026-09-15',{unitPrice:110,location:'Room #401',history:[{type:'created',date:ts('09-15'),actor:'Nin'}]}),
  A('AHA007','expat','Electric kettle','dorm_appliance','active','2024-01-15',{unitPrice:18,location:'Room #202',history:[{type:'created',date:ts('01-15'),actor:'Phea'}].concat(req('areq_d7c','disposal','09-15','Nin',{disposalType:'lost'},'Missing after move-out'))})
];
const pending=[
  {id:'areq_d7c',type:'disposal',assetCode:'AHA007',assetName:'Electric kettle',data:{disposalType:'lost',date:'2026-09-15'},reason:'Missing after move-out',by:'Nin',date:'2026-09-15',createdAt:ts('09-15','10:00'),telegram:'sent',approval:'telegram'},
  {id:'areq_t10',type:'transfer',assetCode:'AOA010',assetName:'Steel shelf',data:{newLocation:'Warehouse B',newUser:'Sok Chea',date:'2026-09-14'},reason:'Warehouse reorganisation',by:'Phea',date:'2026-09-14',createdAt:ts('09-14','10:00'),telegram:'sent',approval:'telegram'},
  {id:'areq_f9x',type:'disposal',assetCode:'AOA009',assetName:'Old fax machine',data:{disposalType:'end_of_life',date:'2026-09-12'},reason:'No longer used',by:'Nin',date:'2026-09-12',createdAt:ts('09-12','10:00'),telegram:'sent',approval:'telegram'}
];
module.exports={seed:{vrt_a7:assets,vrt_p7:pending,vrt_photos:{AOA004:P,AHA003:P},vrt_c7:{AOA:11,AHA:8},gc_actor_name:'Phea'}};
