import {test} from 'node:test';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {startSite,wire,publish,php} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
test('R1 legacy sync defaults off and rejects every legacy write envelope atomically',{skip,timeout:180000},async()=>{
 const s=await startSite({enableV3:false,legacySync:false});
 try{
 for(const payload of [{products:[]},{hide_ids:['m-jacket']},{settings:{hide_unavailable:false}},{kits:[]}]){
 const r=await s.post('/api/pim/sync',payload,s.auth);assert.equal(r.status,409,JSON.stringify(r));assert.equal(r.data.error_code,'LEGACY_SYNC_DISABLED');
 }
 assert.equal(s.sql('SELECT COUNT(*) n FROM sync_log')[0].n,0);
 for(const fn of ['save_product(db(),[])','hide_products(db(),[])','hide_unavailable(db(),false)','sync_kits(db(),[])']){
 const r=php(`require '${s.site}/api/lib.php';require '${s.site}/api/kits.php';try{${fn};echo 'UNGUARDED';}catch(Throwable $e){echo $e->getMessage();}`);
 assert.match(r.stdout,/LEGACY_SYNC_DISABLED/,fn);
 }
 }finally{s.stop();}
});
test('R1 explicit legacy permission never permits overwriting or hiding contract 3 models',{skip,timeout:180000},async()=>{
 const s=await startSite({extraConfig:",'pim_legacy_sync'=>true"});
 try{
 assert.equal((await publish(s,wire)).status,200);
 for(const fn of ["save_product(db(),['id'=>' m-jacket '])","save_product(db(),['id'=>'m-jacket'])","hide_products(db(),['m-jacket'])","sync_kits(db(),[['id'=>'b1','name'=>'Тест','items'=>['m-jacket','m-belt']]])"]){
 const r=php(`require '${s.site}/api/lib.php';require '${s.site}/api/kits.php';try{${fn};echo 'UNGUARDED';}catch(Throwable $e){echo $e->getMessage();}`);
 assert.match(r.stdout,/CONTRACT_V3_REQUIRED/,fn);
 }
 assert.equal(+s.sql("SELECT visible FROM products WHERE id='m-jacket'")[0].visible,1);
 }finally{s.stop();}
});

test('R1 legacy permission accepts only literal boolean true',{skip,timeout:180000},async()=>{
 const s=await startSite({enableV3:false,legacySync:false});
 try{const file=s.site+'/api/config.php',base=readFileSync(file,'utf8').replace("'pim_legacy_sync'=>false,",'');
 for(const value of [null,'false','1',"'true'",'[]']){
 writeFileSync(file,value===null?base:base.replace("return [","return ['pim_legacy_sync'=>"+value+","));
 const r=await s.post('/api/pim/sync',{products:[]},s.auth);assert.equal(r.status,409,String(value));assert.equal(r.data.error_code,'LEGACY_SYNC_DISABLED');
 }
 writeFileSync(file,base.replace("return [","return ['pim_legacy_sync'=>true,"));
 assert.equal((await s.post('/api/pim/sync',{products:[]},s.auth)).status,200);
 }finally{s.stop();}
});
test('R1 direct failed legacy mutation rolls back its owned catalog transaction',{skip,timeout:180000},async()=>{
 const s=await startSite({enableV3:false});
 try{
 s.sql("CREATE TRIGGER fixture_reject_variant BEFORE INSERT ON variants FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic atomic rollback'");
 const payload={id:'legacy-rollback',name:'Тест атомарності',canonical_category_id:'clothing_jackets',variants:[{sku:'ROLLBACK-1',price:200,availability:'in'}]};
 const r=php(`require '${s.site}/api/lib.php';echo json_encode(save_product(db(),json_decode('${JSON.stringify(payload)}',true)));`);
 assert.equal(JSON.parse(r.stdout).status,'error');
 assert.equal(+s.sql("SELECT COUNT(*) n FROM products WHERE id='legacy-rollback'")[0].n,0,'failed variant insert must not leave catalog model');
 assert.equal(+s.sql("SELECT COUNT(*) n FROM variants WHERE sku='ROLLBACK-1'")[0].n,0);
 }finally{s.stop();}
});
