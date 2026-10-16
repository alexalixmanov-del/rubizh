// Stage 5, 5-4 (pim_key rotation without downtime): during a transition SITE accepts two keys — pim_key (current) and
// pim_key_next — and reports which slot matched; a weak, placeholder or duplicate next key is never honoured (the current
// key keeps working, nothing is revealed to anonymous callers; review of stage 5). After the
// promotion (pim_key = new, pim_key_next removed) the old key is refused. No production rotation — fixture config only.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';
import {startSite,PIM_KEY} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const NEXT='pim-next-fixture-key-at-least-24-characters-long';

test('pim_key rotation: current + next accepted, slot reported, a weak next key is ignored, old key refused after promotion, wrong keys throttled',{skip,timeout:180000},async()=>{
 const s=await startSite();
 try{
  const config=s.site+'/api/config.php',base=readFileSync(config,'utf8');
  const setConfig=extra=>writeFileSync(config,base.replace(/\];\s*$/,extra+'];'));
  const status=key=>s.get('/api/pim/status',key===null?{}:{Authorization:'Bearer '+key});
  // Only the current key.
  let r=await status(PIM_KEY);assert.equal(r.status,200);assert.equal(r.data.key_slot,'current');assert.equal(r.data.key_rotation,false);
  assert.equal((await status(NEXT)).status,401);assert.equal((await status(null)).status,401);
  // Transition: both keys.
  setConfig(`,'pim_key_next'=>'${NEXT}'`);
  r=await status(PIM_KEY);assert.equal(r.status,200);assert.equal(r.data.key_slot,'current');assert.equal(r.data.key_rotation,true);
  r=await status(NEXT);assert.equal(r.status,200);assert.equal(r.data.key_slot,'next');
  const viaNext=await s.post('/api/pim/costs',{},{'Content-Type':'application/json',Authorization:'Bearer '+NEXT});assert.equal(viaNext.status,422,'the next key reaches PIM endpoints');assert.equal(viaNext.data.error_code,'INVALID_ENVELOPE');
  assert.equal((await status('pim-other-key-at-least-24-characters-long')).status,401);
  assert.doesNotMatch(JSON.stringify(r.data),new RegExp(NEXT+'|'+PIM_KEY),'status never echoes a key');
  // A bad next key is ignored: the current key works, the bad one is refused, the status says no rotation.
  for(const bad of ['short-next-key-xx',`ЗАМЕНИТЕ_НА_ДЛИННЫЙ_СЛУЧАЙНЫЙ_КЛЮЧ_1234`,PIM_KEY]){setConfig(`,'pim_key_next'=>'${bad}'`);const ok=await status(PIM_KEY);assert.equal(ok.status,200,'bad next key: '+bad.slice(0,8));assert.equal(ok.data.key_rotation,false);if(/^[\x20-\x7e]+$/.test(bad)&&bad!==PIM_KEY)assert.equal((await status(bad)).status,401);}
  // Promotion: the next key becomes the only key; the old one is refused.
  writeFileSync(config,base.replace(PIM_KEY,NEXT));
  assert.equal((await status(NEXT)).status,200);assert.equal((await status(PIM_KEY)).status,401);
  // Wrong keys are throttled per network.
  let last=0;for(let i=0;i<35;i++)last=(await status('pim-wrong-key-at-least-24-characters-'+i)).status;assert.equal(last,429,'guessing is throttled');
 }finally{s.stop();}
});
