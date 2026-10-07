const assert=require('assert'),path=require('path');process.chdir(path.join(__dirname,'..'));const {load}=require('./dom-harness.cjs');
const date='2026-10-06',photo='https://example.test/normal.jpg',many=Array.from({length:8},(_,i)=>photo+'?n='+i),copy=v=>JSON.parse(JSON.stringify(v));
const fixtures={
 temperature:{vrt_th_z:[{id:'za',en:'Building A Workshop',on:true}],vrt_th_r:[{id:'t1',d:date,z:'za',p:'morning',t:27,h:70,checker:'Inspector',photos:many}]},
 cleaning:{ac_gc_sender_cleaning_v1:'Inspector',vrt_clean_hub_v2:{records:[{id:'c1',date,locId:'loc_canteen',cleaner:'Cleaner',checker:'Inspector',slots:['07:30'],checks:{smell:true,light:true,floor:true,door:true,corner:true,ceiling:true},photos:many}]}},
 keymovement:{vrt_keys:[{id:'k1',key_no:'K1',issue_date:date,issue_time:'08:00',return_date:date,return_time:'09:00',return_condition:'good',dept:'Factory',recipient_name:'Phea',checker:'Inspector',photos:many}]},
 ehs:{vrt_waste_v3:{gate:[],internal:[{id:'r1',date,plastic_kg:100,fabric_kg:20,total_kg:120,photos:many}]}},
 asset:{vrt_a7:[{id:'AHA001',code:'AHA001',name:'Desk',purchaseDate:date,zone:'expat',qty:1,unitPrice:50,recordedBy:'Inspector',status:'active'}],vrt_photos:{AHA001:photo}},
 waterdrum:{wdr_2026_10:[{day:6,fQty:4,fPrice:2000,fTime:'08:00',checkBy:'Inspector',fPhotos:many}]}
};
function setup(w){const D=w.Date;w.Date=class extends D{constructor(...a){super(...(a.length?a:[date+'T11:00:00']));}static now(){return new D(date+'T11:00:00').getTime();}};Object.defineProperty(w.navigator,'onLine',{get:()=>false});}
(async()=>{for(const [tool,seed]of Object.entries(fixtures)){const x=await load('ac_gascheck_'+tool+'_v2.html',seed,setup);try{assert.deepStrictEqual(x.errors,[],tool+' boot');const cfg=x.w.__configs[tool],packet=await cfg.telegramBuilder({cfg,period:'day',ref:date,scope:tool==='ehs'?'recycle':'all',slot:'all',lang:'en',sender:'Inspector'});assert.deepStrictEqual(copy(packet.photos).sort(),(tool==='asset'?[photo]:many).slice().sort(),tool+' preserves selected normal record photos beyond five');}finally{x.dom.window.close();}}console.log('PASS normal photos preserved in Temperature, Cleaning, returned Keys, Recycle, Asset photo map and Water');})().catch(e=>{console.error(e);process.exit(1)});
