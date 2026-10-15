"""Deterministic SITE release archive (rubizh/ prefix) for dev/deploy-update.sh. Tracked source only;
private configs, tests, docs, previews, earlier archives, Git/CI dot-files and Node tooling are excluded."""
import hashlib,json,subprocess,sys,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
out=Path(sys.argv[1]) if len(sys.argv)>1 else root/'downloads/Rubizh-pim-v3-20261009.zip'
skip=('tests/','docs/','downloads/','preview/','.github/','.gitignore','package.json','package-lock.json')
private={'api/config.php','auth/config.php','api/mono-private.php','api/np-private.php','api/site-settings.json'}
files=[f for f in subprocess.run(['git','ls-files'],cwd=root,capture_output=True,text=True,check=True).stdout.split('\n') if f and not f.startswith(skip) and f not in private and not f.endswith(('.md','.mjs')) and f!='PIM-V3-GAP-MATRIX.json']
# Dot-files are repository tooling (CI, scanners, editors); the hosting needs only .htaccess files (S4-07).
files=[f for f in files if not any(part.startswith('.') and part!='.htaccess' for part in f.split('/'))]
# The design-preview renderer (fictitious display data) is developer tooling, not part of the shop.
files=[f for f in files if f!='dev/render-account.php']
# Superseded storefront bundles stay in Git but are not shipped: an asset goes into the archive only when a shipped
# page, script, stylesheet or rule references it, directly or through another shipped asset (ТЗ этапа 4 §12, A5).
assets={f for f in files if f.startswith('assets/') and f.endswith(('.js','.css'))}
def mentions(text):return {a for a in assets if a.rsplit('/',1)[1] in text}
reached=set();todo=set()
for f in files:
    if f not in assets and f.endswith(('.html','.php','.js','.css','.htaccess','.json','.xml','.txt')):todo|=mentions((root/f).read_text('utf-8','ignore'))
while todo:
    a=todo.pop()
    if a not in reached:reached.add(a);todo|=mentions((root/a).read_text('utf-8','ignore'))-reached
files=[f for f in files if f not in assets or f in reached]
manifest={'release':'pim-v3-site-20261009','commit':subprocess.run(['git','rev-parse','HEAD'],cwd=root,capture_output=True,text=True,check=True).stdout.strip(),'files':{}}
out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for f in sorted(files):
        data=(root/f).read_bytes();manifest['files'][f]=hashlib.sha256(data).hexdigest()
        info=zipfile.ZipInfo('rubizh/'+f,(2026,10,9,0,0,0));info.external_attr=0o644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
    info=zipfile.ZipInfo('rubizh/RELEASE-MANIFEST.json',(2026,10,9,0,0,0));info.external_attr=0o644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,json.dumps(manifest,indent=1,sort_keys=True)+'\n')
print(json.dumps({'path':str(out),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'files':len(files)}))
