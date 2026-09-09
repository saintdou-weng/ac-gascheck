const fs=require('fs'),path=require('path'),cp=require('child_process');
let failed=0,total=0;
for(const file of fs.readdirSync(__dirname).filter(f=>f.endsWith('.test.js')).sort()){
 total++;
 const result=cp.spawnSync(process.execPath,[path.join(__dirname,file)],{encoding:'utf8',timeout:60000});
 if(result.status===0)console.log('PASS '+file);
 else{failed++;console.error('FAIL '+file+'\n'+(result.stderr||result.stdout||String(result.error)));}
}
console.log(`${total-failed}/${total} test files passed`);process.exitCode=failed?1:0;
