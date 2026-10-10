// Guarded PIM v3 enable: plan → apply with exact SHA, only the one setting changes, backup outside the web root,
// idempotent NO_CHANGE, disable, refusal of unknown shapes, rollback when the new file would not load.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const tool=new URL('../dev/pim-v3-enable.php',import.meta.url).pathname;
const run=(...args)=>{const r=spawnSync('php',[tool,...args],{encoding:'utf8'});return {code:r.status,json:JSON.parse(r.stdout)};};
function site(text){const dir=mkdtempSync(join(tmpdir(),'pimv3-')),cfg=join(dir,'config.php'),backups=join(dir,'backups');writeFileSync(cfg,text);return {cfg,backups,opts:['--config='+cfg,'--backup-dir='+backups]};}
const CONFIG=`<?php\n// private production config (comment kept)\n$db = 'shop';\nreturn [\n    'db_name' => $db,\n    'mono_token' => getenv('MONO') ?: 'x',\n    'pim_key' => 'k1'\n];\n`;
test('plan shows SHA, current/proposed value and backup destination; writes nothing',()=>{
 const s=site(CONFIG),r=run('--plan',...s.opts);assert.equal(r.code,0);
 assert.equal(r.json.result,'PLANNED');assert.equal(r.json.current_pim_v3_sync,null);assert.equal(r.json.proposed_pim_v3_sync,true);assert.match(r.json.config_sha256,/^[0-9a-f]{64}$/);
 assert.equal(readFileSync(s.cfg,'utf8'),CONFIG);
});
test('apply requires the exact SHA, changes only pim_v3_sync, keeps comments/logic, backs up the original; repeat = NO_CHANGE; disable works',()=>{
 const s=site(CONFIG),plan=run('--plan',...s.opts).json;
 assert.equal(run('--apply','--expect-sha256='+'0'.repeat(64),...s.opts).json.error,'SHA_MISMATCH: run --plan again');assert.equal(readFileSync(s.cfg,'utf8'),CONFIG);
 const a=run('--apply','--expect-sha256='+plan.config_sha256,...s.opts);assert.equal(a.code,0,JSON.stringify(a.json));assert.equal(a.json.result,'APPLIED');
 const text=readFileSync(s.cfg,'utf8');assert.ok(text.startsWith(CONFIG.slice(0,CONFIG.lastIndexOf("'k1'")+4)),'everything before the new entry is byte-identical');assert.match(text,/'pim_v3_sync'=>true,\n\];\n$/);
 assert.equal(readFileSync(a.json.backup,'utf8'),CONFIG);assert.equal(readdirSync(s.backups).length,1);
 assert.equal(run('--plan',...s.opts).json.result,'NO_CHANGE');assert.equal(run('--apply','--expect-sha256=x',...s.opts).json.result,'NO_CHANGE');
 const d=run('--plan','--disable',...s.opts).json;assert.equal(d.proposed_pim_v3_sync,false);
 const off=run('--apply','--disable','--expect-sha256='+d.config_sha256,...s.opts).json;assert.equal(off.result,'APPLIED');assert.match(readFileSync(s.cfg,'utf8'),/'pim_v3_sync'=>false,/);
});
test('existing key is edited in place; duplicated key, array() configs and non-array configs are refused untouched',()=>{
 const s=site("<?php return ['a'=>1,\"pim_v3_sync\" => false,'b'=>2];\n"),p=run('--plan',...s.opts).json;
 assert.equal(run('--apply','--expect-sha256='+p.config_sha256,...s.opts).json.result,'APPLIED');assert.equal(readFileSync(s.cfg,'utf8'),"<?php return ['a'=>1,\"pim_v3_sync\" => true,'b'=>2];\n");
 for(const bad of ["<?php return ['pim_v3_sync'=>false,'pim_v3_sync'=>false];\n","<?php return array('a'=>1);\n","<?php return 5;\n"]){const t=site(bad),r=run('--plan',...t.opts);assert.equal(r.json.result,'ERROR',bad);assert.equal(readFileSync(t.cfg,'utf8'),bad);}
});
test('a backup directory inside the web root is refused',()=>{
 const s=site(CONFIG),p=run('--plan',...s.opts).json,root=new URL('..',import.meta.url).pathname;
 const r=run('--apply','--expect-sha256='+p.config_sha256,'--config='+s.cfg,'--backup-dir='+join(root,'api'));assert.equal(r.json.error,'BACKUP_INSIDE_WEBROOT');assert.equal(readFileSync(s.cfg,'utf8'),CONFIG);
});
