import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
import {products} from '../dev/fixtures.mjs';
let browser,server,base;
before(async()=>{server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
async function pageTest(run){const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));try{await run(page);assert.deepEqual(errors,[]);}finally{await context.close();}}
async function hero(page,layout,theme){await page.waitForFunction(({layout,theme})=>{const image=document.querySelector('.rz-hero-image');return image?.complete&&image.naturalWidth>0&&image.currentSrc.includes(`hero-${layout}-${theme}.`);},{layout,theme});}
test('Homepage switches exact supplied artwork on both screen sizes, persists theme, and survives SPA navigation',()=>pageTest(async page=>{
  await page.goto(base);await hero(page,'desktop','dark');
  for(const width of [1440,768,390,320]){
    await page.setViewportSize({width,height:1000});
    const layout=width>860?'desktop':'mobile';
    for(const theme of ['light','dark']){
      await page.evaluate(theme=>window.rubizhTheme.save(theme),theme);await hero(page,layout,theme);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.locator('.rz-hero-logo').isVisible(),width>860);
      if(theme==='light')assert.equal(await page.locator('.rz-hero').evaluate(e=>getComputedStyle(e).color),'rgb(27, 33, 24)');
    }
  }
  await page.evaluate(()=>window.rubizhTheme.save('light'));await page.reload();await hero(page,'mobile','light');
  await page.locator('.rz-hero .rz-btn-primary').click();await page.locator('[data-card-name]').first().waitFor();
  await page.locator('header [data-header-brand]').click();await hero(page,'mobile','light');
  await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>window.rubizhTheme.apply('system'));await hero(page,'mobile','dark');
  await page.emulateMedia({colorScheme:'light'});await hero(page,'mobile','light');
}));
async function productPage(page,variants){
  const product={...structuredClone(products[1]),variants};
  await page.route('**/shop/catalog.php*',async route=>{
    const action=new URL(route.request().url()).searchParams.get('action');
    if(action==='product')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,product})});
    if(action==='storefront')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,products:[product],kits:[]})});
    return route.continue();
  });
  await page.goto(base+'/product/'+product.slug);await page.getByRole('heading',{name:product.name,exact:true}).waitFor();
}
const variant=(size,sku)=>({...structuredClone(products[1].variants[0]),sku,variant_id:sku,size_display:size,size_native:size});
test('Two blank clothing variants never become one-size SKU buttons or buyable products',()=>pageTest(async page=>{
  await productPage(page,[variant('','RUB-08442'),variant('','RUB-08443')]);
  await page.getByText('Розміри не підтверджені постачальником. Уточніть у менеджера.',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-size-grid]').count(),0);
  assert.equal(await page.getByRole('button',{name:/Один розмір|До кошика/}).count(),0);
  assert.doesNotMatch(await page.locator('[data-prod-section]').innerText(),/Один розмір\s*·\s*RUB-/);
}));
test('Confirmed letter sizes and native fallback stay available; unconfirmed sibling is hidden',()=>pageTest(async page=>{
  const native={...variant('L','FIXTURE-L'),size_display:'   '};
  await productPage(page,[variant('S','FIXTURE-S'),variant('M','FIXTURE-M'),native,variant('XL','FIXTURE-XL'),variant('','FIXTURE-UNKNOWN')]);
  assert.deepEqual(await page.locator('[data-size-grid] [role="button"] > span:first-child').allTextContents(),['S','M','L','XL']);
  await page.getByRole('button',{name:'L',exact:true}).click();await page.getByRole('button',{name:/До кошика/}).first().click();
  await page.getByRole('button',{name:'Продовжити',exact:true}).waitFor();
}));
test('Only confirmed sibling is displayed as its actual size',()=>pageTest(async page=>{
  await productPage(page,[{...variant('','FIXTURE-UNKNOWN'),color:'Олива'},variant('L','FIXTURE-L')]);
  await page.getByText(/Розмір(?: одягу)?: L/i,{exact:true}).waitFor();
  assert.equal(await page.locator('[data-size-grid]').count(),0);
}));
test('Backend rejects blank clothing and footwear sizes but preserves native sizes and one-size accessories',()=>{
  const php=process.env.PHP_PATH||(existsSync('/workspace/php-runtime/root/usr/bin/php8.4')?'/workspace/php-runtime/root/usr/bin/php8.4':'php');
  const source=`require '${process.cwd()}/shop/units.php';
  $v=['price'=>100,'availability'=>'in','size'=>'','data'=>'{}'];
  foreach(['Тактичні штани, джогери мультикам','Куртка','Берці'] as $name){if(shopVariantCanBuy($v+['name'=>$name]))throw new RuntimeException('Missing size accepted');}
  foreach(['Підсумок','Шапка','Пончо'] as $name){if(!shopVariantCanBuy($v+['name'=>$name]))throw new RuntimeException('One size accessory blocked');}
  if(!shopVariantCanBuy(array_replace($v,['name'=>'Штани','data'=>json_encode(['size_native'=>'L'])])))throw new RuntimeException('Native size lost');
  if(!shopVariantCanBuy(array_replace($v,['name'=>'Штани','size'=>'M'])))throw new RuntimeException('Database size lost');
  if(shopVariantCanBuy(array_replace($v,['name'=>'Штани','size'=>'M','data'=>json_encode(['size_unconfirmed'=>true])])))throw new RuntimeException('Unconfirmed size accepted');
  echo 'passed';`;
  const result=spawnSync(php,['-n','-r',source],{encoding:'utf8',env:{...process.env,LD_LIBRARY_PATH:'/workspace/php-runtime/root/usr/lib/x86_64-linux-gnu'}});
  assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'passed');
});
test('Catalog API recovers native/database size labels and marks blank clothing variants unavailable',()=>{
  const php='/workspace/php-runtime/root/usr/bin/php8.4',extensions='/workspace/php-runtime/root/usr/lib/php/20240924/';
  const source=`require '${process.cwd()}/shop/catalog-lib.php';class FixturePDO extends PDO{public function __construct(){}}
  $row=['id'=>'fixture','slug'=>'fixture','name'=>'Тактичні штани','brand'=>'','category_path'=>'Одяг та форма / Штани','data'=>'{}','description'=>'','attributes'=>'{}','price_min'=>100,'has_docs'=>0];
  $v=['sku'=>'fixture','size'=>'','color'=>'','price'=>100,'kit_price'=>null,'availability'=>'in','lead_time'=>'','data'=>'{}'];
  $variants=[array_replace($v,['sku'=>'native','data'=>json_encode(['size_display'=>'   ','size_native'=>': L'])]),array_replace($v,['sku'=>'stored','size'=>'M','data'=>json_encode(['size_display'=>'','size_native'=>''])]),array_replace($v,['sku'=>'missing'])];
  echo json_encode(shopProduct(new FixturePDO,$row,[],$variants)['variants']);`;
  const result=spawnSync(php,['-n','-d','error_reporting=24575','-d','extension='+extensions+'pdo.so','-d','extension='+extensions+'mbstring.so','-r',source],{encoding:'utf8',env:{...process.env,LD_LIBRARY_PATH:'/workspace/php-runtime/root/usr/lib/x86_64-linux-gnu'}});
  assert.equal(result.status,0,result.stderr);const [native,stored,missing]=JSON.parse(result.stdout);
  assert.equal(native.size_display,'L');assert.equal(native.size_native,'L');assert.equal(native.availability,'in');
  assert.equal(stored.size_display,'M');assert.equal(stored.availability,'in');
  assert.equal(missing.size_unconfirmed,true);assert.equal(missing.availability,'out');
});
