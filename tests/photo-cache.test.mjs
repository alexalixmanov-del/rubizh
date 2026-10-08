import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
const root=path.resolve(import.meta.dirname,'..'),runtime='/workspace/php-runtime/root/usr';
function php(code){const args=['-n','-d','error_reporting=24575',...['pdo','mysqlnd','pdo_mysql','mbstring','gd'].flatMap(e=>['-d','extension='+runtime+'/lib/php/20240924/'+e+'.so']),'-r',code];const r=spawnSync(runtime+'/bin/php8.4',args,{env:{...process.env,LD_LIBRARY_PATH:runtime+'/lib/x86_64-linux-gnu'},encoding:'utf8'});assert.equal(r.status,0,r.stderr+r.stdout);return JSON.parse(r.stdout);}
test('Public WebP and thumbnails are readable under private cron umask; permission repair never touches private files or symlinks',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-photo-perms-'));
 try{
  const out=php(`function cfg($k){return ['media_dir'=>'${dir}/media','photo_max'=>1600,'thumb_max'=>480,'webp_quality'=>82][$k]??null;}require '${root}/api/photo-storage.php';umask(0077);$im=imagecreatetruecolor(1600,1200);$white=imagecolorallocate($im,240,240,240);imagefill($im,0,0,$white);imagefilledrectangle($im,500,150,1100,1000,imagecolorallocate($im,60,70,35));ob_start();imagepng($im);$png=ob_get_clean();$files=save_photo_webp($png,str_repeat('a',40),photo_storage_directory());$private='${dir}/private.json';file_put_contents($private,'private');$link=cfg('media_dir').'/p/aa/'.str_repeat('b',40).'.webp';symlink($private,$link);file_put_contents(cfg('media_dir').'/private.json','private');chmod(cfg('media_dir').'/'.$files[0],0600);$report=repair_photo_permissions();clearstatcache();echo json_encode(['files'=>$files,'original_bytes'=>strlen($png),'thumb_bytes'=>filesize(cfg('media_dir').'/'.$files[1]),'thumb_size'=>array_slice(getimagesize(cfg('media_dir').'/'.$files[1]),0,2),'file_mode'=>fileperms(cfg('media_dir').'/'.$files[0])&0777,'thumb_mode'=>fileperms(cfg('media_dir').'/'.$files[1])&0777,'dir_mode'=>fileperms(cfg('media_dir').'/p/aa')&0777,'private_mode'=>fileperms($private)&0777,'media_private_mode'=>fileperms(cfg('media_dir').'/private.json')&0777,'link'=>is_link($link),'report'=>$report]);`);
  assert.deepEqual(out.thumb_size,[480,360]);assert.equal(out.files[2],1600);assert.equal(out.files[3],1200);
  assert.equal(out.file_mode,0o644);assert.equal(out.thumb_mode,0o644);assert.equal(out.dir_mode,0o755);assert.equal(out.private_mode,0o600);assert.equal(out.media_private_mode,0o600);assert.equal(out.link,true);assert.equal(out.report.public_photo_files,2);assert.equal(out.report.skipped,1);assert.ok(out.thumb_bytes<out.original_bytes);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Overlapping photo processors skip without changing queue state or waiting for a download',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET},()=>{
 const out=php(`require '${root}/api/lib.php';$a=new PDO('mysql:unix_socket=${process.env.RUBIZH_TEST_MYSQL_SOCKET}','root','');$b=new PDO('mysql:unix_socket=${process.env.RUBIZH_TEST_MYSQL_SOCKET}','root','');$a->query("SELECT GET_LOCK('rubizh_photo_worker',0)");$t=microtime(true);try{$result=process_photos($b,8,12);}finally{$a->query("SELECT RELEASE_LOCK('rubizh_photo_worker')");}echo json_encode(['result'=>$result,'seconds'=>microtime(true)-$t]);`);
 assert.equal(out.result.skipped,'worker_busy');assert.equal(out.result.processed,0);assert.ok(out.seconds<.5);
});
let browser,server,base;
before(async()=>{server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox']});});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
test('First catalogue images have priority while later cards stay lazy on mobile and desktop',async()=>{
 for(const width of [390,1440]){const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));try{
  await page.goto(base+'/catalog');await page.locator('[data-card-name]').first().waitFor();
  const imgs=page.locator('[data-cat-grid] [data-tile] img');assert.ok(await imgs.count()>4);
  for(let i=0;i<4;i++){assert.equal(await imgs.nth(i).getAttribute('loading'),'eager');assert.equal(await imgs.nth(i).getAttribute('fetchpriority'),i<2?'high':'auto');}
  assert.equal(await imgs.nth(4).getAttribute('loading'),'lazy');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 }finally{await page.close();}}
});
