// Shared fixture for the release-hardening QA tools (qa-matrix, qa-audit): isolated PHP+MariaDB SITE copy on the
// legacy catalog path with canonical categories, production .htaccess routes and four synthetic products.
// Synthetic data only (https://img.test/* images are fulfilled locally by the tools); never production data.
import {startSite,php} from '/Users/l/Projects/rubizh/tests/helpers/site-fixture.mjs';
import {writeFileSync,readFileSync} from 'node:fs';
export const img=n=>'https://img.test/'+n+'.png';
export const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
const v=(sku,color,size,photos,extra={})=>({sku,color,size,size_display:size,price:1250,availability:'in',stock:50,photos,...extra});
const g=['olive-1','olive-2','black-1','black-2'].map(img);
export const products=[
 {id:'qa-jacket',canonical_category_id:'clothing_jackets',slug:'qa-jacket',name:'Куртка QA Softshell',brand:'QA',category:'Одяг та форма / Куртки',category_path:['Одяг та форма','Куртки'],description:'Тестова куртка для перевірки вітрини.',photos:g,variants:[v('J-O-M','Олива','M',g.slice(0,2)),v('J-O-L','Олива','L',g.slice(0,2)),v('J-B-M','Чорний','M',g.slice(2)),v('J-B-XL','Чорний','XL',g.slice(2))]},
 {id:'qa-pouch',canonical_category_id:'pouches_magazines',slug:'qa-pouch',name:'Підсумок QA під замовлення',brand:'QA',category:'Підсумки / Підсумки для магазинів',category_path:['Підсумки','Підсумки для магазинів'],description:'Під замовлення.',photos:[img('pouch')],variants:[v('P-1','Олива','Один розмір',[img('pouch')],{availability:'order',stock:null,lead_time:'7 днів'})]},
 {id:'qa-boots',canonical_category_id:'footwear_boots',slug:'qa-boots',name:'Берці QA',brand:'QA',category:'Взуття / Берці',category_path:['Взуття','Берці'],description:'Берці.',photos:[img('boots')],variants:[v('B-42','Койот','42',[img('boots')]),v('B-43','Койот','43',[img('boots')],{availability:'out',stock:0})]},
 {id:'qa-cap',canonical_category_id:'clothing_headwear',slug:'qa-cap',name:'Кепка QA',brand:'QA',category:'Одяг та форма / Головні убори',category_path:['Одяг та форма','Головні убори'],description:'Кепка.',photos:[img('cap')],variants:[v('C-1','Мультикам','Один розмір',[img('cap')])]}];

export async function startQaSite(){
 const site=await startSite({enableV3:false,extraConfig:",'mono_mock'=>true,'environment'=>'staging','staging_allow_loopback'=>true"});
 try{
  // QA copy only: WebKit drops Secure cookies over plain-http 127.0.0.1 (production is HTTPS), so the temporary site
  // copy relaxes just that flag; the repository code is untouched.
  for(const f of ['auth/bootstrap.php','shop/theme-bootstrap.php','shop/customer-ui.php']){const fp=site.site+'/'+f;writeFileSync(fp,readFileSync(fp,'utf8').replaceAll("'secure'=>true","'secure'=>false"));}
  const boot=`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/api/lib.php';`;
  for(const p of products)php(boot+`save_product(db(),json_decode(${JSON.stringify(JSON.stringify(p))},true));`);
  php(boot+'recount_categories(db());');
  writeFileSync(site.site+'/router.php',`<?php // Mirrors the production .htaccess routes (tests/.staging/serve.sh).
$p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}if($p==='/sitemap.xml'){require __DIR__.'/sitemap.php';return;}
if($p==='/'||preg_match('~^/(?:product|catalog|kit|categories|porady)(?:/.*)?$|^/(?:offer|privacy)/?$~',$p)){require __DIR__.'/storefront.php';return;}return false;`);
  const cat=JSON.parse(php(boot+`require_once '${site.site}/shop/catalog-lib.php';echo json_encode(array_values(array_filter(shopCategories(db()),fn($c)=>$c['product_count']>0)));`).stdout);
  if(!cat.length)throw new Error('QA fixture has no categories');
  const leaf=cat.find(c=>c.url_path.includes('/'))?.url_path||cat[0].url_path;
  const pages=[['home','/'],['catalog','/catalog'],['category','/catalog/'+leaf.split('/')[0]],['subcategory','/catalog/'+leaf],['categories','/categories'],['search','/catalog?q='+encodeURIComponent('Куртка')],['search-empty','/catalog?q='+encodeURIComponent('zzzнемаєтакого')],['product','/product/qa-jacket'],['product-preorder','/product/qa-pouch'],['product-404','/product/qa-missing'],['offer','/offer'],['privacy','/privacy'],['guides','/porady'],['kit','/kit'],['login','/auth/']];
  return {site,pages};
 }catch(e){site.stop();throw e;}
}
