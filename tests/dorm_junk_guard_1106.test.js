/* 2026-11-06 宿舍：員工名冊誤匯成申請 → 開頁自動清掉、智慧匯入拒收；真申請不動 */
const assert=require('assert'),path=require('path');process.chdir(path.join(__dirname,'..'));
const {load}=require('./dom-harness.cjs');
(async()=>{
 const x=await load('ac_gascheck_dormitory_v2.html',{},w=>{Object.defineProperty(w.navigator,'onLine',{configurable:true,get:()=>false});});
 const w=x.w;
 try{
  assert.deepStrictEqual(x.errors,[]);
  const real=[
    {id:'mud1',name:'Chhan Sinath',idNo:'5833',roomNo:'A-106',date:'2026-09-23',type:'搬入',status:'已核可',timestamp:'2026-09-23 12:56'},
    {id:'msv5',name:'Sorn Thea',idNo:5597,roomNo:102,date:'',type:'搬入',status:'已核可',timestamp:'2026-08-16 08:44'},
    {id:'ros1',name:'Res',idNo:'9',roomNo:'',date:'',source:'roster_import',status:'已核可'}];
  const junk=[
    {id:'imp_a',name:'ទឹម  សុគន្ធា',idNo:1012,roomNo:'',date:'1993-06-12'},
    {id:'imp_b',name:'ទឹម',idNo:1012,roomNo:'ទឹម  សុគន្ធា',date:'ទឹម  សុគន្ធា'},
    {id:'imp_c',name:'X',idNo:1019,roomNo:'',date:'',status:'待審核',source:'smart_import',timestamp:'2026-10-16 15:54'}];
  w.state.replaceRecords(real.concat(junk));
  assert.equal(w.dormSweepJunk('test'),3);
  const live=w.dormLive(w.state.db().records).map(r=>r.id).sort();
  assert.deepStrictEqual(live,['msv5','mud1','ros1']);
  assert.equal(w.state.db().records.filter(r=>r._deleted).length,3,'tombstones kept for sync');
  // cloud write that brings them back → swept again
  const cfg=w.__configs.dormitory;cfg.cloudWrite(real.concat(junk.map(r=>Object.assign({},r,{id:r.id+'2'}))));
  assert.equal(w.dormLive(w.state.db().records).length,3,'resurrected junk swept on cloud write');
  // smart import: roster-like file refused, mostly-good file keeps good rows
  const cur=w.dormLive(w.state.db().records);
  const roster=Array.from({length:30},(_,i)=>({name:'N'+i,idNo:String(1000+i),roomNo:'',date:'1990-01-0'+(i%9+1)}));
  assert.equal(cfg.mergeImport(cur,roster).length,cur.length,'roster file refused');
  const good=[{name:'A',idNo:'1',roomNo:'A-201',date:'2026-11-06',type:'in'},{name:'B',idNo:'2',roomNo:'A-202',date:'2026-11-06',type:'in'},{name:'C',idNo:'3',roomNo:'A-203',date:'2026-11-06',type:'in'},{name:'D',idNo:'4',roomNo:'',date:'2026-11-06',type:'in'}];
  assert.equal(cfg.mergeImport(cur,good).length,cur.length+3,'bad row skipped, good rows kept');
  console.log('dorm junk guard ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{x.dom.window.close();}
})();
