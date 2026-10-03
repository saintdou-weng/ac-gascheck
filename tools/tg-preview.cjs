/* GASCheck Telegram 預覽：node tools/tg-preview.cjs <page.html> <tool> <fixture.cjs> [period=month] [mode=summary] [ref] [scope=all] [slot=all] [langs=zh,bi,en,km]
   fixture.cjs exports { seed:{localStorageKey:value,...}, configure?(w), after?(w) }  — same seed shape as tests/dom-harness.cjs */
const path=require('path');const {load}=require(path.join(__dirname,'..','tests','dom-harness.cjs'));
(async()=>{
 const [page,tool,fx,period='month',mode='summary',ref='',scope='all',slot='all',langs='zh,bi,en,km']=process.argv.slice(2);
 const f=require(path.resolve(fx));
 const {w,errors,dom}=await load(page,f.seed||{},f.configure);if(errors.length)console.log('ERRORS',errors);
 if(f.after)await f.after(w);
 const cfg=w.__configs[tool];if(!cfg){console.log('no config for tool '+tool,Object.keys(w.__configs));process.exit(1);}
 for(const lang of langs.split(',')){
  const built=typeof cfg.telegramBuilder==='function'?await cfg.telegramBuilder({period,mode,ref:ref||undefined,scope,slot,lang,cfg}):w.GC.telegram.buildText(cfg,period,mode,ref||undefined,scope,slot,lang);
  const packet=typeof built==='string'?{text:built}:(built||{});
  const pages=packet.pages||[packet.text];
  const txt=pages.join('\n\n').replace(/<blockquote[^>]*>/g,'┃ ').replace(/<\/blockquote>/g,'').replace(/<[^>]+>/g,'').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&');
  console.log('\n===== '+lang+' / '+period+' '+mode+(ref?' '+ref:'')+' scope='+scope+' slot='+slot+' ('+txt.length+' chars, '+pages.length+' page(s), photos '+((packet.photos||[]).length)+') =====\n'+txt);
 }
 dom.window.close();
})().catch(e=>{console.error(e);process.exit(1);});
