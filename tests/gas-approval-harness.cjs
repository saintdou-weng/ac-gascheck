const assert=require('assert'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const copy=v=>JSON.parse(JSON.stringify(v));
function server(){
  class Range{
    constructor(s,r,c,n,m){Object.assign(this,{s,r,c,n,m});}
    getValues(){return Array.from({length:this.n},(_,i)=>Array.from({length:this.m},(_,j)=>(this.s.rows[this.r+i-1]||[])[this.c+j-1]??''));}
    setValues(v){
      if(v.some(row=>row.some(cell=>typeof cell==='string'&&cell.length>50000)))throw new Error('Your input contains more than the maximum of 50000 characters in a single cell');
      v.forEach((row,i)=>row.forEach((cell,j)=>{(this.s.rows[this.r+i-1]||(this.s.rows[this.r+i-1]=[]))[this.c+j-1]=cell;}));return this;
    }
    setBackground(){return this;}setFontColor(){return this;}setFontWeight(){return this;}
  }
  class Sheet{
    constructor(){this.rows=[];}
    getLastRow(){return this.rows.length;}getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length));}
    getRange(r,c,n,m){return new Range(this,r,c,n,m);}getDataRange(){return this.getRange(1,1,this.getLastRow(),this.getLastColumn());}
    clear(){this.rows=[];}setFrozenRows(){}appendRow(r){this.rows.push(r);}deleteRows(r,n){this.rows.splice(r-1,n);}
  }
  const files=new Map(),sheets=new Map(),props={},photos=new Map(),telegram=[],requests=[];
  let photoFailure=false,smartFailure=false,ackFailure=false,editFailure=false,nextMessage=100; const updates=[],triggers=[];
  const g={console,Logger:{log(){}},
    ScriptApp:{getProjectTriggers:()=>triggers,deleteTrigger:t=>triggers.splice(triggers.indexOf(t),1),newTrigger:name=>({timeBased(){return this;},everyMinutes(n){assert.equal(n,1);return this;},create(){triggers.push({getHandlerFunction:()=>name});}})},
    Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(String(s)).digest()),formatDate:()=> '2026-09-19 10:00:00',base64Decode:()=>[],newBlob:()=>({testBlob:true})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];}})},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})},
    DriveApp:{getFileById:id=>{if(![...photos.values()].includes(id))throw new Error('Photo file not found');return {getBlob:()=>({testBlob:true,id})};}},
    UrlFetchApp:{fetch:(url,opt={})=>{
      const payload=typeof opt.payload==='string'?JSON.parse(opt.payload):opt.payload;
      telegram.push({method:url.split('/').pop(),payload});
      if(url.endsWith('/getUpdates'))return {getContentText:()=>JSON.stringify({ok:true,result:updates.filter(u=>u.update_id>=payload.offset).slice(0,payload.limit)})};
      if(url.endsWith('/getWebhookInfo'))return {getContentText:()=>JSON.stringify({ok:true,result:{url:'',pending_update_count:0}})};
      const blocked=(url.endsWith('/answerCallbackQuery')&&ackFailure)||(url.endsWith('/editMessageText')&&editFailure)||url.endsWith('/sendPhoto')&&(photoFailure||typeof payload.photo==='string'&&payload.photo.includes('drive.google.com'));
      return {getContentText:()=>JSON.stringify(blocked?{ok:false,description:'Bad Request: wrong type of the web page content'}:{ok:true,result:{message_id:payload.message_id||++nextMessage}})};
    }}};
  vm.createContext(g);vm.runInContext(fs.readFileSync('ac_gascheck_core_v3_fixed.gs','utf8'),g);
  Object.assign(g,{
    getOrCreateSheet_:name=>{if(!sheets.has(name))sheets.set(name,new Sheet());return sheets.get(name);},
    loadGcSmartFile_:name=>files.get(name)||null,
    saveGcSmartFile_:(name,content)=>{if(smartFailure)throw new Error('Drive temporarily unavailable');files.set(name,content);return name;},
    savePhotoToDrive_:(photo)=>{if(photoFailure)return '';if(!photos.has(photo))photos.set(photo,'photo_'+(photos.size+1));return 'https://drive.google.com/uc?export=view&id='+photos.get(photo);}
  });
  const post=body=>{requests.push(copy(body));const out=JSON.parse(g.doPost({postData:{contents:JSON.stringify(body)}}).text);if(out.ok===false)throw new Error(out.error);return out;};
  const get=p=>{const out=JSON.parse(g.doGet({parameter:p}).text);if(out.ok===false)throw new Error(out.error);return out;};
  const config=vm.runInContext('({chat:CFG.CHAT_ID,approver:CFG.APPROVER_TG_ID,name:CFG.APPROVER_NAME})',g);
  return {g,post,get,telegram,requests,photos,sheets,files,props,updates,triggers,config,setSmartFailure:v=>{smartFailure=v;},setAckFailure:v=>{ackFailure=v;},setEditFailure:v=>{editFailure=v;},setPhotoFailure:v=>{photoFailure=v;}};
}
module.exports={server,copy};
