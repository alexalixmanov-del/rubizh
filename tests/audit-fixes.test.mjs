import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
import {products} from '../dev/fixtures.mjs';
const root=path.resolve(import.meta.dirname,'..'),runtime='/workspace/php-runtime/root/usr',ext=runtime+'/lib/php/20240924/';
function php(source){const r=spawnSync(runtime+'/bin/php8.4',['-n','-d','error_reporting=24575',...['pdo','mysqlnd','pdo_mysql','mbstring'].flatMap(x=>['-d','extension='+ext+x+'.so']),'-r',source],{env:{...process.env,LD_LIBRARY_PATH:runtime+'/lib/x86_64-linux-gnu'},encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);return r.stdout;}
let server,browser,base;
before(async()=>{server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
test('Empty checkout hides recipient, delivery and submit; comparison survives reload and can be cleared',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}});try{
  await page.goto(base+'/#cart');await page.getByRole('heading',{name:'Кошик порожній'}).waitFor();
  assert.equal(await page.locator('input[name=name]').count(),0);assert.equal(await page.getByRole('button',{name:'Підтвердити замовлення',exact:true}).count(),0);
  await page.goto(base+'/product/demo-uniform');await page.getByRole('button',{name:/Порівняти/}).first().click();await page.getByRole('button',{name:'Порівняння · 1 →'}).waitFor();
  await page.reload();await page.getByRole('button',{name:'Порівняння · 1 →'}).waitFor();await page.getByRole('button',{name:'Порівняння · 1 →'}).click();
  await page.getByRole('heading',{name:/^Порівняння/}).waitFor();assert.match(await page.locator('body').innerText(),/Тактичний костюм/i);
  await page.getByRole('button',{name:/Очистити/}).click();await page.reload();assert.equal(await page.locator('[data-cmp-pill]').count(),0);
 }finally{await page.close();}
});
test('Real unknown stock has no false scarcity; confirmed sizes sort logically even with native fallback',async()=>{
 const page=await browser.newPage();try{
  const product=structuredClone(products[1]);product.variants=['3XL','L','S','2XL','M','XL'].map((size,i)=>({...product.variants[0],sku:'fixture-'+i,size_display:i===1?' ':size,size_native:size,stock:null}));
  await page.route('**/shop/catalog.php*',route=>{const action=new URL(route.request().url()).searchParams.get('action');if(action==='product')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,product})});if(action==='storefront')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,products:[product],kits:[]})});return route.continue();});
  await page.goto(base+'/product/demo-uniform');await page.locator('[data-size-grid]').waitFor();
  assert.deepEqual(await page.locator('[data-size-grid] [role=button]>span:first-child').allTextContents(),['S','M','L','XL','2XL','3XL']);
  assert.doesNotMatch(await page.locator('body').innerText(),/Мало залишилось/);assert.match(await page.locator('body').innerText(),/За даними постачальника/i);
 }finally{await page.close();}
});
test('Canonical size matching combines heights, variants and footwear without guessing missing sizes',()=>{
 const result=JSON.parse(php(`require '${root}/shop/units.php';require '${root}/shop/normalization.php';$rows=[['name'=>'Куртка','category_path'=>'Одяг та форма','size'=>'L','data'=>'{"size_native":"48/3"}'],['name'=>'Берці','category_path'=>'Взуття','size'=>'42,5','data'=>'{}'],['name'=>'Куртка','category_path'=>'Одяг та форма','size'=>'2XL','data'=>'{}']];echo json_encode([shopMatchesSizes($rows[0],['clothing:M','height:3']),shopMatchesSizes($rows[0],['clothing:L']),shopMatchesSizes($rows[1],['footwear:42.5']),shopMatchesSizes($rows[1],['clothing:M']),shopMatchesSizes($rows[2],['clothing:XXL'])]);`));
 assert.deepEqual(result,[true,false,true,false,true]);
});
test('New-order email waits for confirmation; confirmed card email has a payment link and no premature bank details',()=>{
 const result=JSON.parse(php(`define('RUBIZH_AUTH',true);require '${root}/auth/email-templates.php';$o=['id'=>9,'order_number'=>'FIXTURE-9','total'=>1000,'payment_status'=>'pending','status'=>'new','payment_method'=>'card','payment_due'=>'2026-10-09 12:00:00','items_json'=>'[{"name":"Куртка","qty":1,"price":1000}]'];echo json_encode([rubizhOrderEmail($o),rubizhOrderEmail(array_replace($o,['status'=>'confirmed','mail_event'=>'confirmed']))]);`));
 assert.match(result[0].subject,/очікуйте підтвердження/);assert.doesNotMatch(result[0].html,/Резерв до|Реквізити|IBAN|Перейти до оплати/);
 assert.match(result[1].subject,/можна оплатити/);assert.match(result[1].html,/payment-return.php\?order=9/);assert.doesNotMatch(result[1].html,/IBAN:/);
});
test('Database availability matches buy buttons; missing local originals and duplicate copies are repaired',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET},()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-audit-sql-'));
 try{
  for(const folder of ['api','shop']){mkdirSync(path.join(dir,folder));for(const name of readdirSync(path.join(root,folder)))if(name.endsWith('.php')&&!['config.php','np-private.php','mono-private.php'].includes(name))copyFileSync(path.join(root,folder,name),path.join(dir,folder,name));}
  mkdirSync(path.join(dir,'media/p/aa'),{recursive:true});const file='p/aa/'+'a'.repeat(40)+'.webp',thumb=file.replace('.webp','-t.webp');writeFileSync(path.join(dir,'media',file),'fixture-image');writeFileSync(path.join(dir,'media',thumb),'fixture-thumb');
  writeFileSync(path.join(dir,'api/config.php'),`<?php return ['media_dir'=>'${dir}/media','media_url'=>'/media'];`);
  php(`require '${dir}/shop/catalog-lib.php';function curl_init($url){throw new RuntimeException('Fixture forbids network downloads');}$db=new PDO('mysql:unix_socket='.getenv('RUBIZH_TEST_MYSQL_SOCKET').';charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);$schema='fixture_audit_'.bin2hex(random_bytes(5));$db->exec('CREATE DATABASE '.$schema.' CHARACTER SET utf8mb4');$db->exec('USE '.$schema);function check($x,$m){if(!$x)throw new Exception($m);}try{
   migrate($db);$p=$db->prepare('INSERT INTO products(id,slug,name,category_path,data,created_at,updated_at,synced_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())');foreach([['pants','Штани'],['bag','Підсумок'],['native','Куртка'],['empty','Берці']] as [$id,$name])$p->execute([$id,$id,$name,'Одяг та форма','{}']);
   foreach([['head-bad','Комплект обвісу для шолому FAST'],['head-camera','Екшн камера на шолом RunCam'],['head-good','Шолом балістичний FAST'],['armor-bad','Комплект камербандів для плитоноски'],['armor-good','Плитоноска з бронеплитами'],['med-bad','Тренировочный турнікет'],['med-good','Кровоспинний турнікет СІЧ']] as [$id,$name])$p->execute([$id,$id,$name,'Спорядження','{}']);
   foreach(['head'=>['head-good'],'armor'=>['armor-good'],'med'=>['med-good']] as $slot=>$expected){$q=$db->query('SELECT p.id FROM products p WHERE '.shopKitPrimarySql($slot).' ORDER BY p.id');check($q->fetchAll(PDO::FETCH_COLUMN)===$expected,'Wrong primary equipment in '.$slot);}
   $v=$db->prepare("INSERT INTO variants(sku,product_id,size,price,availability,data) VALUES(?,?,?,100,'in',?)");$v->execute(['p','pants','Один розмір','{}']);$v->execute(['b','bag','','{}']);$v->execute(['n','native','','{"size_display":"OS","size_native":"L"}']);$v->execute(['e','empty','','{}']);
   $ids=$db->query('SELECT p.id FROM products p WHERE EXISTS(SELECT 1 FROM variants av WHERE av.product_id=p.id AND '.shopBuyableSql('av').') ORDER BY p.id')->fetchAll(PDO::FETCH_COLUMN);check($ids===['bag','native'],'SQL/PHP availability differs');
   $q=$db->prepare("INSERT INTO photos(product_id,pos,src_url,src_hash,file,thumb,status,updated_at) VALUES(?,0,'https://example.invalid/a',?,?,?,?,UTC_TIMESTAMP())");$q->execute(['bag',str_repeat('a',40),'${file}','${thumb}','ok']);$q->execute(['pants',str_repeat('b',40),'p/bb/'.str_repeat('b',40).'.webp','p/bb/'.str_repeat('b',40).'-t.webp','ok']);$q->execute(['native',str_repeat('b',40),'','','pending']);
   $photos=product_photos($db,['bag','pants']);check($photos['bag'][0]['local']===true&&$photos['pants'][0]['local']===false,'Missing file served as local');
   $r=repair_photo_files($db,1,true);check($r['missing_requeued']===1,'Missing original not repaired');$r=process_photos($db,10,1);check($r['processed']===0&&$r['errors']===2,'Missing duplicate reused as ready');check($db->query("SELECT status FROM photos WHERE product_id='bag'")->fetchColumn()==='ok','Valid media changed');
  }finally{$db->exec('DROP DATABASE '.$schema);}echo 'passed';`);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
