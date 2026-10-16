// Release archive safety: the SITE production archive (dev/package-release.py, tracked files only) must not carry
// staging configs/tests, private configs, DB dumps, supplier files, keys, tokens or developer/sandbox paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=new URL('..',import.meta.url).pathname;
const DENY_NAMES=/(?:^rubizh\/(?:tests|docs|downloads|preview)\/|\.staging|(?:^|\/)config\.php$|mono-private\.php$|np-private\.php$|site-settings\.json$|\.sql\.gz$|\.gz$|\.pem$|\.key$|\.env$|id_rsa|\.xlsx?$|backup.*\.json$|\.jsonl$)/iu;
const DENY_TEXT=[[/\/tmp\/claude-0/u,'sandbox path'],[/\/home\/user\b|\/Users\/[a-z]/u,'developer path'],[/-----BEGIN [A-Z ]*PRIVATE KEY-----/u,'private key'],[/\bAKIA[0-9A-Z]{16}\b/u,'AWS key'],[/\bgh[pousr]_[A-Za-z0-9]{30,}/u,'GitHub token'],[/\bsk_(?:live|test)_[A-Za-z0-9]{16,}/u,'API key'],[/'staging_allow_loopback'\s*=>\s*true|'mono_mock'\s*=>\s*true/u,'staging setting value']];
test('SITE release archive: no staging/private files, secrets or developer paths; manifest lists exactly the files',()=>{
 const zip=join(mkdtempSync(join(tmpdir(),'site-rel-')),'r.zip');execFileSync('python3',[join(root,'dev/package-release.py'),zip]);
 const files=JSON.parse(execFileSync('python3',['-c',"import sys,zipfile,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({n:z.read(n).decode('utf-8','replace') for n in z.namelist()}))",zip],{maxBuffer:1<<29}));
 const bad=[];for(const [name,text] of Object.entries(files)){if(DENY_NAMES.test(name))bad.push(name+': denied file');if(name.endsWith('.sql')&&/^\s*INSERT\s+INTO/imu.test(text))bad.push(name+': data dump');if(/\.(?:php|js|mjs|sh|html|css|json|md|txt|py|sql)$/.test(name))for(const [re,why] of DENY_TEXT)if(re.test(text))bad.push(name+': '+why);}
 assert.deepEqual(bad,[]);
 const manifest=JSON.parse(files['rubizh/RELEASE-MANIFEST.json']);assert.deepEqual(Object.keys(manifest.files).map(f=>'rubizh/'+f).sort(),Object.keys(files).filter(n=>n!=='rubizh/RELEASE-MANIFEST.json').sort());
 assert.ok(files['rubizh/dev/pim-v3-enable.php'],'the guarded enable command ships with the release');
});
test('the installer pins an archive by SHA256 and never installs staging configs',()=>{
 const sh=readFileSync(join(root,'dev/install-pim-v3.sh'),'utf8');assert.match(sh,/^RUBIZH_SHA=[0-9a-f]{64}$/m);assert.match(sh,/sha256sum -c -/);assert.ok(!/\.staging|config\.staging/.test(sh));
 const deploy=readFileSync(join(root,'dev/deploy-update.sh'),'utf8');assert.ok(!/\.staging/.test(deploy));
});
// Stage 3 (RC1 4.5): the hosting archive carries only what the shop runs, and service files that must ship are not
// readable over HTTP. Apache rules from the root .htaccess are emulated: forbidding RewriteRules and denied FilesMatch.
test('RC1 archive: no dot-files except .htaccess, no Node dev tooling; contracts and the release manifest are not web-readable',()=>{
 const zip=join(mkdtempSync(join(tmpdir(),'site-rel-')),'r.zip');execFileSync('python3',[join(root,'dev/package-release.py'),zip]);
 const names=execFileSync('python3',['-c',"import sys,zipfile;print('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))",zip],{encoding:'utf8'}).trim().split('\n').map(n=>n.replace(/^rubizh\//,''));
 assert.deepEqual(names.filter(n=>/(?:^|\/)\.(?!htaccess$)/.test(n)),[],'dot-files other than .htaccess');
 assert.deepEqual(names.filter(n=>/\.(?:mjs|cjs|ts)$/.test(n)),[],'Node dev tooling does not run on the hosting');
 const htaccess=readFileSync(join(root,'.htaccess'),'utf8');
 const forbidden=[...htaccess.matchAll(/^RewriteRule\s+(\S+)\s+-\s+\[F/gm)].map(m=>new RegExp(m[1]));
 const denied=[...htaccess.matchAll(/<FilesMatch\s+"([^"]+)">\s*\n\s*Require all denied/g)].map(m=>new RegExp(m[1].replace(/^\(\?i\)/,''),m[1].startsWith('(?i)')?'i':''));
 const blocked=p=>forbidden.some(r=>r.test(p))||denied.some(r=>r.test(p.split('/').pop()));
 for(const p of ['RELEASE-MANIFEST.json','contracts/pim-v3/1/manifest.json','contracts/pim-v3/2/wire.exact.json','dev/migrate-crm.php','.htaccess','sql/indexes.sql',
  // cache/.htaccess is never deployed (deploy-update.sh keeps the host cache/), so the root rules must cover it;
  // interrupted atomic installs leave *.deploy-<pid>.tmp copies of source next to the live file.
  'cache/catalog-v1.json','shop/order.php.deploy-1234.tmp','media/x.webp.0a1b2c3d.tmp'])assert.ok(blocked(p),p+' must not be web-readable');
 for(const p of ['index.html','storefront.php','assets/theme.js','robots.txt','sitemap.php'])assert.ok(!blocked(p),p+' stays public');
});
// Stage 4 Quality Gate (ТЗ §12, A5): the production build — the SITE release archive and the CRM bundle — carries no
// cash-on-delivery wording and no demo/test markers. Superseded storefront bundles that nothing references are not shipped.
test('production build: no «Післяплата»/«накладен»/«післяопл», no DEMO- or example.invalid in the SITE archive and the CRM dist',()=>{
 const zip=join(mkdtempSync(join(tmpdir(),'site-rel-')),'r.zip');execFileSync('python3',[join(root,'dev/package-release.py'),zip]);
 const files=JSON.parse(execFileSync('python3',['-c',"import sys,zipfile,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({n:z.read(n).decode('utf-8','replace') for n in z.namelist() if n.endswith(('.php','.js','.css','.html','.json','.txt','.htaccess','.xml','.svg'))}))",zip],{maxBuffer:1<<29}));
 const crm=(process.env.RUBIZH_CRM_DIR||'/workspace/crm.rubizh')+'/dist';
 const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(d,e.name)):[join(d,e.name)]);
 if(existsSync(crm))for(const f of walk(crm))files['crm/'+f.slice(crm.length+1)]=readFileSync(f,'utf8');
 const bad=[];for(const [name,text] of Object.entries(files))for(const re of [/Післяплата/u,/накладен/iu,/післяопл/iu,/DEMO-/u,/example\.invalid/iu])if(re.test(text))bad.push(name+' '+re);
 assert.deepEqual(bad,[]);
 const liveBundle=files['rubizh/index.html'].match(/src="\/(assets\/shop-client\.[^"?]+\.js)/)[1];assert.ok(files['rubizh/'+liveBundle],'the live storefront bundle ships');
 for(const n of Object.keys(files).filter(n=>/^rubizh\/assets\/[^/]+\.(js|css)$/.test(n))){const base=n.split('/').pop();assert.ok(Object.entries(files).some(([k,t])=>k!==n&&t.includes(base)),base+' is referenced by a shipped file');}
});
