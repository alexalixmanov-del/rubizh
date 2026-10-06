import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, existsSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const retained='/workspace/php-runtime/root/usr';
const php=process.env.PHP_PATH||(existsSync(retained+'/bin/php8.4')?retained+'/bin/php8.4':'php');
const env={...process.env,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH||retained+'/lib/x86_64-linux-gnu'};
for(const key of Object.keys(env))if(key.startsWith('RUBIZH_'))delete env[key];
const options=existsSync(retained+'/lib/php/20240924/mbstring.so')?['-n',...['pdo','mbstring'].flatMap(name=>['-d','extension='+retained+'/lib/php/20240924/'+name+'.so'])]:[];
function fixture(mode='normal'){
 const parent=mkdtempSync(path.join(tmpdir(),'rubizh-np-setup-'));const site=path.join(parent,'www');
 for(const dir of ['dev','api','shop'])mkdirSync(path.join(site,dir),{recursive:true});
 copyFileSync(path.join(root,'dev/configure-np.php'),path.join(site,'dev/configure-np.php'));
 copyFileSync(path.join(root,'shop/np-lib.php'),path.join(site,'shop/np-lib.php'));
 writeFileSync(path.join(site,'api/lib.php'),`<?php function cfg($key=null){$c=require __DIR__.'/config.php';return $key===null?$c:($c[$key]??null);}`);
 const config=path.join(site,'api/config.php');writeFileSync(config,`<?php return ['db_pass'=>'private-db-fixture','mono_token'=>'private-mono-fixture','nova_poshta_api_key'=>'private-np-fixture','supplier_contacts'=>['m_vin'=>['enabled'=>false]],'np_cod_contract_confirmed'=>true,'np_cod_service'=>'afterpayment'];`);
 const transport=path.join(parent,'transport.php');
 writeFileSync(transport,`<?php
 define('RUBIZH_NP_TESTS',true);
 $GLOBALS['np_setup_test_pause']=function($seconds){};
 function fixtureRef($n){return sprintf('00000000-0000-0000-0000-%012d',$n);}
 $GLOBALS['np_test_transport']=function($model,$method,$properties){
  if($model==='Counterparty'&&$method==='getCounterparties')return [['Ref'=>fixtureRef(1),'Description'=>'Fixture sender']];
  if($model==='Counterparty'&&$method==='getCounterpartyContactPersons')return [['Ref'=>fixtureRef(2),'Description'=>'Fixture contact','Phones'=>'0671234567']${mode==='contacts' ? ",['Ref'=>fixtureRef(3),'Description'=>'Other contact','Phones'=>'0671234568']" : ''}];
  $known=['Ксаверівка'=>[10,'Вінницька',['1']],'Хмельницький'=>[20,'Хмельницька',['8']],'Чернівці'=>[30,'Чернівецька',['32']],'Березань'=>[40,'Київська',['2']],'Вінниця'=>[50,'Вінницька',['9','36']]];
  if($model==='Address'&&$method==='getCities'){$city=$properties['FindByString'];[$id,$area]=$known[$city];return [['Ref'=>fixtureRef($id),'Description'=>$city==='Ксаверівка'?$city.' (Вінницька обл.)':$city,'AreaDescription'=>$area]];}
  if($model==='Address'&&$method==='getWarehouses'){
   $city=null;foreach($known as $name=>$info)if(fixtureRef($info[0])===$properties['CityRef'])$city=$name;[$id,$area,$branches]=$known[$city];$rows=[];
   foreach($branches as $branch)$rows[]=['Number'=>$branch,'Description'=>'Відділення №'.$branch,'CityDescription'=>$city==='Ксаверівка'?$city.' (Вінницька обл.)':$city,'SettlementAreaDescription'=>$area,'CityRef'=>fixtureRef($id),'Ref'=>fixtureRef($id*100+(int)$branch)];
   ${mode==='ambiguous' ? "if($city==='Березань'){$other=$rows[0];$other['Ref']=fixtureRef(9999);$rows[]=$other;}" : ''}
   ${mode==='missing_cargo' ? "if($city==='Вінниця')$rows=array_values(array_filter($rows,fn($r)=>$r['Number']!=='36'));" : ''}
   return $rows;
  }
  throw new RuntimeException('Unexpected API operation; writes are forbidden');
 };
 `);
 const run=args=>spawnSync(php,[...options,'-d','auto_prepend_file='+transport,path.join(site,'dev/configure-np.php'),...args],{env,encoding:'utf8',timeout:8000});
 const saved=()=>JSON.parse(spawnSync(php,[...options,'-r',`echo json_encode(require '${config}');`],{env,encoding:'utf8'}).stdout);
 return {parent,site,config,run,saved,close:()=>rmSync(parent,{recursive:true,force:true})};
}
test('NP setup dry run resolves directories and sender without changing private configuration',()=>{
 const f=fixture();try{const original=readFileSync(f.config,'utf8');const r=f.run([]);assert.equal(r.status,0,r.stderr);assert.equal(readFileSync(f.config,'utf8'),original);assert.match(r.stdout,/"waybills_created":0/);assert.match(r.stdout,/"cargo_origins_ready":\["kiborg"\]/);assert.equal(r.stdout.includes('private-np-fixture'),false);}finally{f.close();}
});
test('NP setup preserves credentials, backs up configuration, adds manager and both Kiborg origins, and disables COD',()=>{
 const f=fixture();try{
  const r=f.run(['--apply','--manager-email=owner@example.com']);assert.equal(r.status,0,r.stderr);const c=f.saved();
  assert.equal(c.db_pass,'private-db-fixture');assert.equal(c.mono_token,'private-mono-fixture');assert.equal(c.nova_poshta_api_key,'private-np-fixture');assert.deepEqual(c.supplier_contacts,{m_vin:{enabled:false}});
  assert.equal(c.np_sender.phone,'380671234567');assert.equal(c.np_sender.confirmed,true);assert.equal(c.np_ttn_enabled,true);assert.equal(c.np_cod_contract_confirmed,false);assert.equal(c.np_cod_service,'');assert.deepEqual(c.np_manager_emails,['owner@example.com']);
  assert.equal(c.np_origin_refs.kiborg.warehouse_ref.endsWith('005009'),true);assert.equal(c.np_origin_refs.kiborg.cargo_warehouse_ref.endsWith('005036'),true);assert.equal(c.np_origin_refs.kiborg.cargo_confirmed,true);assert.equal(statSync(f.config).mode&0o777,0o600);assert.ok(existsSync(path.join(f.parent,'rubizh-private-backups')));
  const senderCheck=spawnSync(php,[...options,'-r',`require '${path.join(f.parent,'transport.php')}';require '${f.site}/api/lib.php';require '${f.site}/shop/np-lib.php';class DummyPDO extends PDO{public function __construct(){}}echo json_encode(npVerifiedSender(new DummyPDO));`],{env,encoding:'utf8'});
  assert.equal(senderCheck.status,0,senderCheck.stderr||senderCheck.stdout);assert.equal(JSON.parse(senderCheck.stdout).phone,'380671234567');
  const repeated=f.run(['--apply']);assert.equal(repeated.status,0,repeated.stderr);assert.deepEqual(f.saved(),c);
 }finally{f.close();}
});
test('Ambiguous contacts and invalid manager identity leave hosting configuration unchanged',()=>{
 for(const mode of ['contacts','normal']){const f=fixture(mode);try{const before=readFileSync(f.config,'utf8');const r=f.run(['--apply','--manager-email='+ (mode==='normal'?'invalid':'owner@example.com')]);assert.notEqual(r.status,0);assert.equal(readFileSync(f.config,'utf8'),before);assert.match(r.stderr,mode==='contacts'?/interactive/:/email/);}finally{f.close();}}
});
test('Ambiguous depots and missing cargo branches remain unavailable rather than guessing',()=>{
 for(const mode of ['ambiguous','missing_cargo']){const f=fixture(mode);try{const r=f.run(['--apply','--manager-email=owner@example.com']);assert.equal(r.status,0,r.stderr);const c=f.saved();if(mode==='ambiguous')assert.equal(c.np_origin_refs.tactical_belt.confirmed,false);else assert.equal(c.np_origin_refs.kiborg.cargo_confirmed,false);}finally{f.close();}}
});
test('Kiborg shipment payload uses branch 9 through 30 kg and branch 36 above 30 kg, with no COD',()=>{
 const source=`
 define('RUBIZH_NP_TESTS',true);function fixtureRef($n){return sprintf('00000000-0000-0000-0000-%012d',$n);}
 $GLOBALS['fixture_config']=['np_origin_refs'=>['kiborg'=>['city_ref'=>fixtureRef(50),'warehouse_ref'=>fixtureRef(5009),'cargo_warehouse_ref'=>fixtureRef(5036),'expected_area'=>'Вінницька','confirmed'=>true,'cargo_confirmed'=>true]]];
 function cfg($key){return $GLOBALS['fixture_config'][$key]??null;}
 $GLOBALS['np_test_transport']=function($model,$method,$p){$ref=$p['Ref'];return [['Ref'=>$ref,'CityRef'=>fixtureRef(50),'Description'=>'Відділення','CityDescription'=>'Вінниця','Number'=>$ref===fixtureRef(5036)?'36':'9','SettlementAreaDescription'=>'Вінницька','WarehouseStatus'=>'Working']];};
 class FixtureStatement extends PDOStatement{public function execute(?array $p=null):bool{return true;}public function fetchColumn(int $n=0):mixed{return false;}}
 class FixturePDO extends PDO{public function __construct(){}public function prepare(string $q,array $o=[]):PDOStatement|false{return new FixtureStatement;}public function exec(string $q):int|false{return 0;}}
 require '${root}/shop/np-fulfillment.php';$db=new FixturePDO;$results=[];
 foreach([29.999,30,30.001] as $weight){$package=['places'=>[['weight'=>$weight,'length'=>20,'width'=>20,'height'=>20]]];$origin=npVerifiedOrigin($db,'kiborg',npPackage($package)['weight']);$props=npSaveProperties(['package_json'=>json_encode($package),'declared_value'=>100,'operation_key'=>'fixture'],$origin,['ref'=>fixtureRef(1),'contact_ref'=>fixtureRef(2),'phone'=>'380671234567'],['type'=>'branch','city_ref'=>fixtureRef(60)],['payment'=>'card','phone'=>'380671234568'],fixtureRef(3),fixtureRef(4),fixtureRef(5));$results[]=['branch'=>$origin['branch'],'sender_address'=>$props['SenderAddress'],'type'=>$props['CargoType'],'cod'=>isset($props['AfterpaymentOnGoodsCost'])];}
 $GLOBALS['fixture_config']['np_origin_refs']['kiborg']['cargo_confirmed']=false;$blocked=false;try{npVerifiedOrigin($db,'kiborg',31);}catch(RuntimeException $e){$blocked=true;}
 echo json_encode(['shipments'=>$results,'missing_cargo_blocked'=>$blocked,'supplier'=>npSupplierCode('sku','product','Кіборг')]);`;
 const r=spawnSync(php,[...options,'-r',source],{env,encoding:'utf8',timeout:8000});assert.equal(r.status,0,r.stderr||r.stdout);const result=JSON.parse(r.stdout);
 assert.deepEqual(result.shipments.map(s=>s.branch),['9','9','36']);assert.deepEqual(result.shipments.map(s=>s.type),['Parcel','Parcel','Cargo']);assert.equal(result.shipments[2].sender_address.endsWith('005036'),true);assert.ok(result.shipments.every(s=>!s.cod));assert.equal(result.missing_cargo_blocked,true);assert.equal(result.supplier,'kiborg');
});
test('NP setup retries bounded rate-limited reads, caches duplicate lookups, and never retries document writes or other rejections',()=>{
 const source=`
 define('RUBIZH_NP_TESTS',true);define('RUBIZH_NP_SETUP_READS',true);require '${root}/shop/np-lib.php';
 $calls=[];$pauses=[];$GLOBALS['np_setup_test_pause']=function($s)use(&$pauses){$pauses[]=$s;};
 $GLOBALS['np_test_transport']=function($model,$method,$p)use(&$calls){$key=$model.'.'.$method;$calls[$key]=($calls[$key]??0)+1;
  if($key==='Address.getCities'){if($calls[$key]<3)throw new NpRateLimited('Too many requests');return [['Ref'=>'city-fixture']];}
  if($key==='Address.getWarehouses'||$key==='InternetDocument.save')throw new NpRateLimited('Too many requests');
  throw new NpRejected('Invalid sender');
 };
 $first=npApiCall('Address','getCities',['FindByString'=>'fixture']);$cached=npApiCall('Address','getCities',['FindByString'=>'fixture']);
 foreach([['Address','getWarehouses'],['InternetDocument','save'],['Counterparty','getCounterparties']] as [$model,$method]){try{npApiCall($model,$method);}catch(NpRejected $e){}}
 echo json_encode(['calls'=>$calls,'cached'=>$first===$cached,'backoff'=>array_values(array_filter($pauses,fn($s)=>$s>=10))]);`;
 const r=spawnSync(php,[...options,'-r',source],{env,encoding:'utf8',timeout:8000});assert.equal(r.status,0,r.stderr||r.stdout);const result=JSON.parse(r.stdout.trim().split('\n').at(-1));
 assert.equal(result.calls['Address.getCities'],3);assert.equal(result.cached,true);assert.equal(result.calls['Address.getWarehouses'],4);assert.equal(result.calls['InternetDocument.save'],1);assert.equal(result.calls['Counterparty.getCounterparties'],1);assert.deepEqual(result.backoff,[10,20,10,20,40]);
});
