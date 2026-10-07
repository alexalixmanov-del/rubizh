import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readdirSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {products} from '../dev/fixtures.mjs';
const root=path.resolve(import.meta.dirname,'..'),runtime='/workspace/php-runtime/root/usr';
test('All picker slots, pagination, combined filters, stock and source sizes work against MySQL', {skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET},()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-kit-db-')),schema='fixture_picker_'+Math.random().toString(16).slice(2);
 try{
  for(const folder of ['api','shop']){mkdirSync(path.join(dir,folder));for(const f of readdirSync(path.join(root,folder)))if(f.endsWith('.php')&&!['config.php','mono-private.php','np-private.php'].includes(f))copyFileSync(path.join(root,folder,f),path.join(dir,folder,f));}
  const items=structuredClone(products.filter(p=>p.id!=='demo-camo'));
  for(let i=0;i<30;i++){const p=structuredClone(products[0]);p.id='body-'+i;p.slug=p.id;p.name='Куртка тактична '+i;p.variants=p.variants.map(v=>({...v,sku:p.id+'-'+v.size_display}));items.push(p);}
  for(const [id,name,cat,size] of [['head','Шолом FAST','Шоломи','Один розмір'],['small','Тактичні рукавиці','Одяг та форма / Аксесуари одягу','M'],['bad-head','Комплект обвісу для шолому FAST','Шоломи','Один розмір'],['bad-med','Тренувальний турнікет','Тактична медицина','Один розмір'],['bad-size','Штани без підтвердженого розміру','Одяг та форма','Один розмір'],['bad-stock','Куртка без залишку','Одяг та форма','L']]){const p=structuredClone(products[0]);Object.assign(p,{id,slug:id,name,category:cat});p.variants=[{...p.variants[0],sku:id+'-sku',size_display:size,size_native:size,stock:id==='bad-stock'?0:5}];items.push(p);}
  writeFileSync(path.join(dir,'api/config.php'),`<?php return ['db_host'=>'localhost;unix_socket=${process.env.RUBIZH_TEST_MYSQL_SOCKET}','db_name'=>'${schema}','db_user'=>'root','db_pass'=>'','cache_dir'=>'${dir}/cache','media_dir'=>'${dir}/media'];`);
  const source=`require '${dir}/shop/kit-catalog.php';$db=new PDO('mysql:unix_socket='.getenv('RUBIZH_TEST_MYSQL_SOCKET').';charset=utf8mb4', 'root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);$db->exec('CREATE DATABASE ${schema} CHARACTER SET utf8mb4');$db->exec('USE ${schema}');function check($ok,$msg){if(!$ok)throw new RuntimeException($msg);}try{migrate($db);
   $items=json_decode(base64_decode('${Buffer.from(JSON.stringify(items)).toString('base64')}'),true);
   $p=$db->prepare('INSERT INTO products(id,slug,name,category_path,price_min,availability,description,attributes,data,created_at,updated_at,synced_at) VALUES(?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())');
   $v=$db->prepare('INSERT INTO variants(sku,product_id,size,color,price,kit_price,availability,lead_time,sort,data) VALUES(?,?,?,?,?,?,?,?,?,?)');$ph=$db->prepare("INSERT INTO photos(product_id,pos,src_url,src_hash,status,updated_at) VALUES(?,0,?,?,'pending',UTC_TIMESTAMP())");
   foreach($items as $item){$p->execute([$item['id'],$item['slug'],$item['name'],$item['category'],$item['price_min'],$item['availability'],$item['description'],json_encode($item['attributes']),json_encode($item)]);foreach($item['variants'] as $i=>$variant)$v->execute([$variant['sku'],$item['id'],$variant['size_display'],$variant['color'],$variant['price'],$variant['kit_price'],$variant['availability'],$variant['lead_time'],$i,json_encode($variant)]);$ph->execute([$item['id'],$item['photos'][0]['url'],sha1($item['photos'][0]['url'])]);}
   recount_categories($db);
   foreach(['head','body','legs','boots','armor','gear','med','small'] as $slot){$r=shopCatalog($db,['slot'=>$slot]);check($r['total']>0,'Empty slot '.$slot);foreach($r['items'] as $item){check(shopSlot($item)===$slot,'Wrong slot');check(!str_starts_with($item['id'],'bad-'),'Invalid equipment shown');foreach($item['variants'] as $variant)check(shopVariantCanBuy($variant),'Unbuyable variant');}}
   $first=shopCatalog($db,['slot'=>'body']);$second=shopCatalog($db,['slot'=>'body','page'=>'2']);check($first['total']===31&&count($first['items'])===24&&count($second['items'])===7,'Wrong pagination');check(!array_intersect(array_column($first['items'],'id'),array_column($second['items'],'id')),'Duplicate page');
   $match=shopCatalog($db,['slot'=>'body','q'=>'body-29-L','sizes'=>'L','camo'=>'Піксель','availability'=>'in']);check($match['total']===1&&$match['items'][0]['id']==='body-29','Combined variant filters');check(shopCatalog($db,['slot'=>'body','q'=>'нічого такого'])['total']===0,'Wrong empty result');
   $sql=shopSizeRequiredProductSql($db);$a=$db->query('SELECT v.sku FROM products p JOIN variants v ON v.product_id=p.id WHERE '.shopBuyableSql('v').' ORDER BY v.sku')->fetchAll(PDO::FETCH_COLUMN);$b=$db->query('SELECT v.sku FROM products p JOIN variants v ON v.product_id=p.id WHERE '.shopBuyableSql('v',$sql).' ORDER BY v.sku')->fetchAll(PDO::FETCH_COLUMN);check($a===$b,'Optimized availability differs');
  }finally{$db->exec('DROP DATABASE ${schema}');}echo 'passed';`;
  const args=['-n','-d','error_reporting=24575',...['pdo','mysqlnd','pdo_mysql','mbstring'].flatMap(e=>['-d',`extension=${runtime}/lib/php/20240924/${e}.so`]),'-r',source];
  const result=spawnSync(runtime+'/bin/php8.4',args,{encoding:'utf8',timeout:20000,env:{...process.env,LD_LIBRARY_PATH:runtime+'/lib/x86_64-linux-gnu'}});
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);assert.equal(result.stdout,'passed');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
