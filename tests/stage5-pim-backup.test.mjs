// Stage 5, 5-4 (automatic PIM backup outside IndexedDB, owner preference: private storage on SITE via pim_key). PIM
// uploads its portable gzip copy to POST /api/pim/backup; SITE keeps the 14 newest copies outside the web root, lists and
// returns them byte for byte, refuses copies that contain a PIM key, a wrong checksum, a non-gzip body or an oversize body,
// and refuses a backup folder inside the public web root. Synthetic copies only.
import {test} from 'node:test';import assert from 'node:assert/strict';import {gzipSync,gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {readdirSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {startSite,PIM_KEY} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const sha=b=>createHash('sha256').update(b).digest('hex');

test('PIM backup on SITE: key only, checksum, gzip, no secrets inside, 14 copies kept, exact download, private folder',{skip,timeout:180000},async()=>{
 const s=await startSite();
 try{
  const dir=s.dir+'/private/pim-backups';mkdirSync(dir,{recursive:true});
  const config=s.site+'/api/config.php',base=readFileSync(config,'utf8');
  writeFileSync(config,base.replace(/\];\s*$/,`,'pim_backup_dir'=>'${dir}','pim_backup_keep'=>14,'pim_backup_max_bytes'=>200000];`));
  const copy=n=>gzipSync(Buffer.from(JSON.stringify({format:'rubizh-pim-backup',version:1,n,rows:[{store:'products',key:'p-'+n,value:{name:'Синтетичний товар '+n}}]})));
  const upload=(body,{key=PIM_KEY,digest=sha(body),label='Після публікації'}={})=>fetch(s.base+'/api/pim/backup',{method:'POST',headers:{...(key?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/gzip','X-Backup-Sha256':digest,'X-Backup-Label':encodeURIComponent(label)},body});
  const first=copy(0);
  assert.equal((await upload(first,{key:null})).status,401,'no key');
  assert.equal((await upload(first,{digest:'0'.repeat(64)})).status,422,'checksum mismatch');
  assert.equal((await upload(Buffer.from('{"plain":"json"}'))).status,422,'not gzip');
  assert.equal((await upload(gzipSync(Buffer.from('{"siteApi":{"key":"'+PIM_KEY+'"}}')))).status,422,'a copy with the PIM key inside is refused');
  assert.equal((await upload(Buffer.concat([first,Buffer.alloc(210000)]))).status,413,'oversize');
  assert.deepEqual(readdirSync(dir).filter(f=>!f.startsWith('.')),[],'nothing stored from refused uploads');
  // 15 copies → the 14 newest stay.
  const ids=[];for(let n=0;n<15;n++){const b=copy(n);const r=await upload(b,{label:'Копія '+n});assert.equal(r.status,200,await r.clone().text());const j=await r.json();assert.equal(j.sha256,sha(b));ids.push(j.id);}
  const list=await (await fetch(s.base+'/api/pim/backups',{headers:{Authorization:'Bearer '+PIM_KEY}})).json();
  assert.equal(list.backups.length,14);assert.ok(!list.backups.some(b=>b.id===ids[0]),'the oldest copy is rotated out');assert.equal(list.backups[0].id,ids[14],'newest first');
  assert.equal(list.backups[0].label,'Копія 14');
  assert.equal((await fetch(s.base+'/api/pim/backups')).status,401,'list needs the key');
  const got=Buffer.from(await (await fetch(s.base+'/api/pim/backups/'+ids[14],{headers:{Authorization:'Bearer '+PIM_KEY}})).arrayBuffer());
  assert.equal(sha(got),sha(copy(14)),'byte-exact download');assert.equal(JSON.parse(gunzipSync(got)).n,14);
  for(const bad of ['..%2F..%2Fapi%2Fconfig.php','pim-x','..%2F'+ids[14]])assert.equal((await fetch(s.base+'/api/pim/backups/'+bad,{headers:{Authorization:'Bearer '+PIM_KEY}})).status,404,bad);
  assert.equal((await fetch(s.base+'/api/pim/backups/'+ids[14])).status,401,'download needs the key');
  // A backup folder inside the public web root is refused (copies would be downloadable without the key).
  writeFileSync(config,base.replace(/\];\s*$/,`,'pim_backup_dir'=>'${s.site}/assets/pim-backups'];`));
  assert.equal((await upload(copy(99))).status,500,'public folder refused');
 }finally{s.stop();}
});

test('PIM backup: the browser PIM may send the backup headers (CORS preflight allows them)',{skip,timeout:120000},async()=>{
 const s=await startSite({extraConfig:",'pim_origins'=>['https://pim.rubizh.shop']"});
 try{
  const r=await fetch(s.base+'/api/pim/backup',{method:'OPTIONS',headers:{Origin:'https://pim.rubizh.shop','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,x-backup-sha256,x-backup-label'}});
  const allowed=(r.headers.get('access-control-allow-headers')||'').toLowerCase();
  for(const h of ['authorization','x-backup-sha256','x-backup-label'])assert.ok(allowed.includes(h),h+' allowed');
  assert.equal(r.headers.get('access-control-allow-origin'),'https://pim.rubizh.shop');
 }finally{s.stop();}
});
