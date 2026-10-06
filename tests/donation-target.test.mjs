import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
const root=path.resolve(import.meta.dirname,'..'),retained='/workspace/php-runtime/root/usr';
const php=process.env.PHP_PATH||(existsSync(retained+'/bin/php8.4')?retained+'/bin/php8.4':'php');
function run(source){
 const options=existsSync(retained+'/lib/php/20240924/mbstring.so')?['-n',...['pdo','mbstring'].flatMap(name=>['-d','extension='+retained+'/lib/php/20240924/'+name+'.so'])]:[];
 const r=spawnSync(php,[...options,'-d','error_reporting=24575','-r',source],{encoding:'utf8',env:{...process.env,LD_LIBRARY_PATH:retained+'/lib/x86_64-linux-gnu'},timeout:5000});assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout;
}
test('Custom brigade is validated; old and empty orders retain the previous destination',()=>{
 const result=JSON.parse(run(`require '${root}/shop/donation-target.php';$out=[shopDonationTarget('  3   ОШБр  '),shopDonationBrigade([]),shopDonationTarget('')];foreach([[],str_repeat('я',161),"bad\\0name"] as $bad){try{shopDonationTarget($bad);$out[]=false;}catch(RuntimeException $e){$out[]=true;}}echo json_encode($out);`));
 assert.deepEqual(result,['3 ОШБр','47 ОМБр «Магура»','47 ОМБр «Магура»',true,true,true]);
});
test('Receipt and email use the saved brigade and HTML escapes its name',()=>{
 const result=JSON.parse(run(`define('RUBIZH_AUTH',true);require '${root}/shop/order-lifecycle.php';require '${root}/auth/email-templates.php';
 class FixtureStatement extends PDOStatement {private string $query;public function __construct(string $q){$this->query=$q;}public function execute(?array $params=null):bool{return true;}public function fetch(int $mode=PDO::FETCH_DEFAULT,int $orientation=PDO::FETCH_ORI_NEXT,int $offset=0):mixed{return str_contains($this->query,'rubizh_order_timing')?['payment_due'=>'2026-10-08 10:00:00','paid_at'=>null]:false;}}
 class FixtureDB extends PDO {public function __construct(){}public function prepare(string $query,array $options=[]):PDOStatement|false{return new FixtureStatement($query);}}
 function npOrder(PDO $db,int $id):array{return ['id'=>$id,'order_number'=>'DEMO','status'=>'new','payment_status'=>'pending','created_at'=>'2026-10-06 10:00:00','total'=>1000,'items'=>[['name'=>'Demo product','qty'=>1,'price'=>1000]],'delivery_label'=>'Demo delivery','contact'=>['payment'=>'invoice','brigade'=>'3 ОШБр & друзі']];}
 $order=npOrder(new FixtureDB,1);$receipt=shopOrderReceipt(new FixtureDB,1);$order['items_json']=json_encode($order['items']);$email=rubizhOrderEmail($order);echo json_encode(['brigade'=>$receipt['brigade'],'text'=>$receipt['donation_text'],'email'=>$email]);`));
 assert.equal(result.brigade,'3 ОШБр & друзі');assert.match(result.text,/3 ОШБр & друзі/);assert.match(result.email.plain,/3 ОШБр & друзі/);assert.match(result.email.html,/3 ОШБр &amp; друзі/);assert.doesNotMatch(result.text+result.email.plain,/Магура/);
});
test('Donation batching rejects mixed brigades before writing a transfer',()=>{
 const result=JSON.parse(run(`require '${root}/shop/donations-lib.php';
 class FixtureStatement extends PDOStatement {private string $query;private FixtureDB $db;public function __construct(string $q,FixtureDB $db){$this->query=$q;$this->db=$db;}public function execute(?array $params=null):bool{if(str_starts_with($this->query,'INSERT'))$this->db->writes++;return true;}public function fetchColumn(int $column=0):mixed{return str_contains($this->query,'GET_LOCK')?1:false;}public function fetchAll(int $mode=PDO::FETCH_DEFAULT,mixed ...$args):array{return [['order_id'=>1,'amount'=>30,'paid_at'=>'2026-10-05 10:00:00','contact_json'=>'{"brigade":"3 ОШБр"}'],['order_id'=>2,'amount'=>30,'paid_at'=>'2026-10-05 10:00:00','contact_json'=>'{"brigade":"47 ОМБр"}']];}}
 class FixtureDB extends PDO {public int $writes=0;public bool $active=false;public function __construct(){}public function prepare(string $query,array $options=[]):PDOStatement|false{return new FixtureStatement($query,$this);}public function beginTransaction():bool{$this->active=true;return true;}public function inTransaction():bool{return $this->active;}public function rollBack():bool{$this->active=false;return true;}}
 $db=new FixtureDB;$error='';try{shopDonationBatch($db,'demo',['operation_key'=>str_repeat('a',32),'reference'=>'Demo reference','transfer_confirmed'=>'yes','orders'=>[1,2],'amount'=>60],[]);}catch(RuntimeException $e){$error=$e->getMessage();}echo json_encode(['error'=>$error,'writes'=>$db->writes,'active'=>$db->active,'legacy'=>shopDonationBatchBrigade([['contact_json'=>'{}'],['contact_json'=>'{"brigade":"47 ОМБр «Магура»"}']])]);`));
 assert.match(result.error,/лише на одну бригаду/);assert.equal(result.writes,0);assert.equal(result.active,false);assert.equal(result.legacy,'47 ОМБр «Магура»');
});
test('Brigade is the first field in the donation block, updates the summary, and reaches the order payload',async()=>{
 const server=await startPreview(0),base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{for(const [theme,width] of [['light',1440],['dark',390],['light',320]]){
  const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();page.setDefaultTimeout(8000);let payload;
  await page.addInitScript(theme=>localStorage.setItem('rubizh.theme',theme),theme);
  await page.route('**/product/demo-uniform',async route=>{const r=await route.fetch();return route.fulfill({response:r,body:(await r.text()).replace('\"enabled\":false,\"percent\":0','\"enabled\":true,\"percent\":3')});});
  await page.route('**/shop/analytics.php',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,settings:{donation:{enabled:true,percent:3}}})}));
  await page.route('**/shop/order.php',route=>{payload=route.request().postDataJSON();return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({ok:false,error:'Тест: замовлення не створюється'})});});
  await page.goto(base+'/product/demo-uniform');await page.getByRole('button',{name:'L',exact:true}).click();await page.getByRole('button',{name:/До кошика/}).first().click();await page.getByRole('button',{name:'Продовжити',exact:true}).click();await page.locator('header [aria-label="Кошик"]').click();
  const block=page.locator('[data-donation-block]'),field=page.getByLabel('Яку бригаду підтримати?',{exact:false});await field.waitFor();assert.equal(await block.locator('input').first().getAttribute('name'),'brigade');
  await field.fill('3 ОШБр');await block.getByText(/після оплати підуть на 3 ОШБр/).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('input[name="name"]').fill('Демо Покупець');await page.locator('input[name="phone"]').fill('+380671234567');await page.locator('input[name="city"]').fill('Київ');await page.locator('input[name="address"]').fill('Відділення 1');
  await page.getByRole('button',{name:/Підтвердити замовлення|Оформити замовлення/}).last().click();await page.getByText('Тест: замовлення не створюється',{exact:true}).waitFor();assert.equal(payload.contact.brigade,'3 ОШБр');assert.equal(await field.inputValue(),'3 ОШБр');
  await field.fill('');await block.getByText(/після оплати підуть на 47 ОМБр/).waitFor();await context.close();
 }}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
