// Release archive safety: the SITE production archive (dev/package-release.py, tracked files only) must not carry
// staging configs/tests, private configs, DB dumps, supplier files, keys, tokens or developer/sandbox paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
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
