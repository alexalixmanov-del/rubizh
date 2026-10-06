import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync,existsSync,utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const retained='/workspace/php-runtime/root/usr';
const php=process.env.PHP_PATH||(existsSync(retained+'/bin/php8.4')?retained+'/bin/php8.4':'php');
const env={...process.env,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH||retained+'/lib/x86_64-linux-gnu'};
function run(source){const options=existsSync(retained+'/lib/php/20240924/mbstring.so')?['-n','-d','extension='+retained+'/lib/php/20240924/mbstring.so']:[];const r=spawnSync(php,[...options,'-r',source],{env,encoding:'utf8',timeout:5000});assert.equal(r.status,0,r.stderr);return r.stdout;}
const requireNormalization=`require '${root}/shop/units.php';require '${root}/shop/normalization.php';`;
test('Description attributes use labelled source values and preserve confirmed fields',()=>{
 const result=JSON.parse(run(requireNormalization+`echo json_encode(shopDescriptionAttributes('<p>Материал: Ripstop (65% бавовна, 35% поліестер)</p><ul><li>Кольори: Мультикам, COYOTE</li><li>Розміри: L, M, S, XL</li></ul><p>Міцна тканина та захист у польових умовах.</p>',['Матеріал'=>'Нейлон']));`));
 assert.equal(result['Матеріал'],'Нейлон');assert.equal(result['Кольори'],'Мультикам, COYOTE');assert.equal(result['Розміри'],'L, M, S, XL');assert.equal(result['Клас захисту'],undefined);
 assert.equal(run(requireNormalization+`echo json_encode(shopDescriptionAttributes('Тактична куртка: міцна тканина і теплий захист.'));`),'[]');
});
test('Misclassified clothing moves out of camouflage while genuine camouflage remains',()=>{
 const result=JSON.parse(run(requireNormalization+`echo json_encode(array_map(fn($name)=>shopCorrectCategory($name,'Маскування / Мультикам'),['Тактичні штани, джогери мультикам','Куртка мультикам','Маскувальний костюм Кікімора','Пончо маскувальне','Маскувальна сітка']));`));
 assert.match(result[0],/Тактичні штани/);assert.match(result[1],/Тактичні куртки/);for(const value of result.slice(2))assert.equal(value,'Маскування / Мультикам');
});
test('PHP size facets retain native sizes, heights, footwear halves and canonical order',()=>{
 const rows=[{name:'Куртка',category_path:'Одяг та форма',size:'L',size_native:'48/3'},{name:'Куртка',category_path:'Одяг та форма',size:': XXL',size_native:'XXL (5-6 зріст)'},{name:'Берці',category_path:'Взуття',size:'42,5',size_native:'42,5'},{name:'Шапка',category_path:'Одяг та форма',size:'L',size_native:'L'}];
 const result=JSON.parse(run(requireNormalization+`echo json_encode(shopSizeFacets(json_decode('${JSON.stringify(rows)}',true)));`));
 assert.deepEqual(result.sizes,['M','XXL','42.5']);assert.deepEqual(result.size_groups.find(g=>g.kind==='height').values,['3','5-6']);
});
test('Stale public cache returns promptly, queues refresh, then worker replaces it; GC retains fallback',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-cache-'));
 const source=(version,body)=>`function cfg($key){return $key==='cache_dir'?'${dir}':false;}function db(){return new class{function query($sql){return new class{function fetchColumn(){return '${version}';}};}};}require '${root}/api/perf.php';${body}`;
 try{
  assert.equal(run(source('old',`echo json_encode(shopCached('catalog-fixture',fn()=>['version'=>'old'],'',['operation'=>'catalog','input'=>[]]));`)),'{"version":"old"}');
  // Snapshot was last built yesterday; grace starts at invalidation, not last write.
  const old=JSON.parse(run(source('old',`echo json_encode(shopCacheLastFile('catalog-fixture'));`)));utimesSync(old,new Date(0),new Date(0));
  assert.equal(run(source('new',`echo json_encode(shopCached('catalog-fixture',function(){throw new RuntimeException('visitor must not build');},'',['operation'=>'catalog','input'=>[]]));`)),'{"version":"old"}');
  const job=JSON.parse(run(source('new',`echo json_encode(glob(shopCacheDir().'/refresh-*.json'));`)))[0];assert.equal(JSON.parse(readFileSync(job,'utf8')).operation,'catalog');
  assert.equal(run(source('new',`$GLOBALS['rubizh_cache_worker']=true;echo json_encode(shopCached('catalog-fixture',fn()=>['version'=>'new'],'',['operation'=>'catalog','input'=>[]]));`)),'{"version":"new"}');
  assert.equal(run(source('new',`echo json_encode(shopCached('catalog-fixture',function(){throw new RuntimeException('fresh cache should hit');},'',['operation'=>'catalog','input'=>[]]));`)),'{"version":"new"}');
  assert.ok(existsSync(old));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('A stalled refresh stops serving stale data after the five-minute grace period',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-cache-'));
 try{
  const base=`function cfg($key){return $key==='cache_dir'?'${dir}':false;}function db(){return new class{function query($sql){return new class{function fetchColumn(){return 'new';}};}};}require '${root}/api/perf.php';`;
  const stale=JSON.parse(run(base+`echo json_encode(shopCacheLastFile('fixture'));`));writeFileSync(stale,JSON.stringify({saved_at:1,data:{version:'old'}}));
  const job=JSON.parse(run(base+`echo json_encode(shopCacheQueue('fixture|',['operation'=>'catalog','input'=>[]]));`));utimesSync(job,new Date(Date.now()-301000),new Date(Date.now()-301000));
  assert.equal(run(base+`echo json_encode(shopCached('fixture',fn()=>['version'=>'fresh'],'',['operation'=>'catalog','input'=>[]]));`),'{"version":"fresh"}');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
