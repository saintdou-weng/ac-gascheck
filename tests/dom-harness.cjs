const fs=require('fs');
const vm=require('vm');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=require('path').join(__dirname,'..');
async function load(name,seed={}){
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/Not implemented: (HTMLCanvasElement|navigation)/.test(e.message))errors.push(e.stack)});
  const dom=new JSDOM(fs.readFileSync(root+'/'+name,'utf8'),{url:'https://local.test/'+name,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
  w.confirm=()=>true;w.alert=()=>{};w.fetch=async()=>({ok:true,json:async()=>({ok:false,error:'Offline test',records:[]}),text:async()=>''});
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({measureText:()=>({width:20}),canvas:{width:800,height:300}},{get:(o,k)=>k in o?o[k]:()=>{}});
  w.Chart=class{constructor(){this.data={};this.options={}}destroy(){}update(){}resize(){}};w.Chart.register=()=>{};
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
  Object.entries(seed).forEach(([k,v])=>w.localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v)));
  w.addEventListener('error',e=>errors.push(e.error&&e.error.stack||e.message));
  for(const script of w.document.querySelectorAll('script')){
    if(script.src){if(script.src.includes('gascheck-core.js')){w.eval(fs.readFileSync(root+'/gascheck-core.js','utf8'));const attach=w.GC.attach;w.__configs={};w.GC.attach=cfg=>{w.__configs[cfg.tool]=cfg;return attach(cfg);};}}
    else try{vm.runInContext(script.textContent,dom.getInternalVMContext());}catch(e){errors.push(e.stack);}
  }
  await new Promise(r=>setTimeout(r,160));
  return {dom,w,errors};
}
module.exports={load};
