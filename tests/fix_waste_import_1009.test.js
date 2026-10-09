// 2026-10-09 廢料／回收匯入：DATE 表頭空白（合併儲存格）、資料列合併日期、VRT monthly waste report（直式／橫式、多月份分頁）
const assert=require('assert');
const {load}=require('./dom-harness.cjs');
const pass=m=>console.log('PASS '+m);
const same=(a,b,m)=>assert.equal(JSON.stringify(a),JSON.stringify(b),m);
/* 假 SheetJS：多分頁、可帶 !merges */
function fakeBook(w,book){
  w.XLSX={read:()=>({SheetNames:Object.keys(book),Sheets:Object.fromEntries(Object.entries(book).map(([n,b])=>[n,{'!ref':'A1:AK200','!merges':b.merges||[],__aoa:b.rows}])),files:null}),
    utils:{sheet_to_json:ws=>JSON.parse(JSON.stringify(ws.__aoa)),decode_range:()=>({s:{r:0,c:0},e:{r:200,c:40}})}};
}
const file=w=>new w.File([new Uint8Array([1,2,3])],'x.xlsx');
const M=(r1,c1,r2,c2)=>({s:{r:r1,c:c1},e:{r:r2,c:c2}});
(async()=>{
  const x=await load('ac_gascheck_ehs_v2.html'),w=x.w;
  try{
    /* ① DATE 直向合併：標題在上一列，資料列同一天兩趟日期也合併 */
    fakeBook(w,{'Waste Sep':{rows:[
      ['Waste Check September 2026'],
      ['DATE','NAME','SUPPLIERS','TYPE',''],
      ['','','','Solid Waste','Industrial Waste','Kg','Time In','Time Out'],
      [46268,'Na Rin','KSWM','V','',100,0.3541666667,0.375],
      ['','Na Rin','KSWM','','V',40,'10:00','10:30'],
      ['15/09/2026','Nhem','SONY','','V',50,'3:10pm','3:40pm'],
    ],merges:[M(1,0,2,0),M(1,1,2,1),M(1,2,2,2),M(1,3,1,4),M(3,0,4,0)]}});
    let meta=await w.parseEhsSmartImport(file(w));
    let rows=meta.objects.filter(r=>r.sourceType==='waste').map(r=>[r.date,r.supplier,r.weight_kg,r.time_in]);
    same(rows,[['2026-09-03','K.S.W.M',100,'08:30'],['2026-09-03','K.S.W.M',40,'10:00'],['2026-09-15','SONYAPICH',50,'15:10']],'merged DATE header + merged date cells');
    pass('waste: DATE header in a vertical merge and merged same-day date cells are read (3 trips)');

    /* ② DATE 標題完全空白：用 NAME／SUPPLIERS 位置推斷（No 流水號欄不會被當日期） */
    fakeBook(w,{'Waste Oct':{rows:[
      ['VRT waste'],[''],
      ['No','','NAME','SUPPLIERS','Solid Waste','Industrial Waste','Kg'],
      [1,46296,'A','KSWM','V','',10],[2,46297,'B','SONYAPICH','','V',20],[3,'',''],
    ]}});
    meta=await w.parseEhsSmartImport(file(w));
    rows=meta.objects.map(r=>[r.date,r.name,r.weight_kg]);
    same(rows,[['2026-10-01','A',10],['2026-10-02','B',20]],'blank DATE header inferred');
    assert(meta.summary.warnings.some(s=>/column 2|第 2 欄/.test(s)),'tells which column was used');
    pass('waste: blank DATE header → date column inferred left of NAME/SUPPLIERS (not the No column), note shown');

    /* ③ VRT monthly waste report：每月一個分頁（直式，欄位順序不同、千分位、No 欄），9 月＋8 月一次匯入 */
    fakeBook(w,{
      'Sep 2026':{rows:[['VRT monthly waste report'],['Month: September 2026'],['No','Date','Plastic (kg)','Waste fabric (kg)','Fabric core (kg)','Total (kg)'],
        [1,46266,10,20,5,35],[2,'02/09/2026',0,0,0,0],[3,46268,'1,000','',3,''],['Total','',1010,20,8,1038]]},
      '2026-08':{rows:[['VRT monthly waste report'],[''],['Day','Waste fabric','Plastic','Fabric core'],['1st',7,1,2],[31,'',4,''],['Total',7,5,2]]},
    });
    meta=await w.parseEhsSmartImport(file(w));
    rows=meta.objects.map(r=>[r.date,r.plastic_kg,r.fabric_kg,r.core_kg,r.total_kg]);
    same(rows,[['2026-08-01',1,7,2,10],['2026-08-31',4,0,0,4],['2026-09-01',10,20,5,35],['2026-09-03',1000,0,3,1003]],'vertical VRT report, columns by header, months by sheet');
    assert(meta.objects.every(r=>r.sourceType==='recycle'&&r.module==='internal'));
    pass('recycle: VRT monthly waste report (one sheet per month) → Recycle rows by header name, totals computed, Total row ignored');

    /* ④ 橫式：一列 1~31 日，Plastic／Waste fabric／Fabric core 各一列 */
    const days=Array.from({length:31},(_,i)=>i+1),val=n=>days.map(d=>d===n?12:(d===5?3:''));
    fakeBook(w,{'Oct':{rows:[['VRT monthly waste report October 2026'],['Item (kg)',...days,'Total'],['Plastic',...val(1),15],['Waste fabric',...val(2),15],['Fabric core',...days.map(()=>''),0]]}});
    meta=await w.parseEhsSmartImport(file(w));
    rows=meta.objects.map(r=>[r.date,r.plastic_kg,r.fabric_kg,r.core_kg,r.total_kg]);
    same(rows,[['2026-10-01',12,0,0,12],['2026-10-02',0,12,0,12],['2026-10-05',3,3,0,6]],'horizontal VRT report');
    pass('recycle: horizontal VRT monthly report (days across, item rows) → daily Recycle rows');

    /* ⑤ 舊範本（第一欄日、Plastic／Fabric／Core／Total 固定順序）照舊 */
    fakeBook(w,{'Mar':{rows:[['Recycle 2026'],['Day','Plastic','Cutting fabric','Core',''],[1,1,2,3,6],[2,'','','',''],[3,5,0,0,5]]}});
    meta=await w.parseEhsSmartImport(file(w));
    rows=meta.objects.map(r=>[r.date,r.plastic_kg,r.fabric_kg,r.core_kg,r.total_kg]);
    same(rows,[['2026-03-01',1,2,3,6],['2026-03-03',5,0,0,5]],'legacy template unchanged');
    pass('recycle: legacy fixed-column template unchanged');
  }finally{x.dom.window.close();}
  console.log('fix_waste_import_1009: all PASS');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
