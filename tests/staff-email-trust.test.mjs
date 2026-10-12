import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {startSite,php} from './helpers/site-fixture.mjs';

const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
for(const trusted of [false,true])test(`legacy manager role requires proven email ownership (Google trusted=${trusted})`,{skip,timeout:180000},async()=>{
 const site=await startSite({enableV3:false,extraConfig:",'environment'=>'staging','np_manager_emails'=>['manager@third-party.test']"});
 try{
  const result=php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';$_SESSION['identity_pending']=['kind'=>'google','sub'=>'synthetic-google-account','email'=>'manager@third-party.test','email_trusted'=>${trusted?'true':'false'},'actor'=>null,'flow'=>'synthetic-flow','expires'=>time()+900];$r=identityFinishPhone('+380671234567');echo json_encode(['id'=>$r['id'],'role'=>shopStaffRole($r['id'])]);`);
  assert.equal(result.status,0,result.stderr);
  const identity=JSON.parse(result.stdout);
  assert.equal(identity.role,trusted?'MANAGER':'','Google contact email alone is not a proof of mailbox ownership');
  const sid='fixturestaffemailtrust';
  writeFileSync(path.join(site.dir,'sess_'+sid),`csrf|s:64:"${'c'.repeat(64)}";customer_id|s:32:"${identity.id}";login_time|i:${Math.floor(Date.now()/1000)};login_method|s:6:"google";`);
  assert.equal((await site.get('/shop/np-manager.php',{Cookie:'rubizh_customer='+sid})).status,trusted?200:403);
  if(!trusted){
   const proven=php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';identityFinishEmail('${identity.id}','manager@third-party.test');echo shopStaffRole('${identity.id}');`);
   assert.equal(proven.status,0,proven.stderr);assert.equal(proven.stdout,'MANAGER','a subsequently verified email remains eligible');
  }
 }finally{site.stop();}
});
