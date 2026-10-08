import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
import {products} from '../dev/fixtures.mjs';
const spec=JSON.parse(readFileSync(new URL('../shop/canonical-taxonomy.json',import.meta.url))),banners=JSON.parse(readFileSync(new URL('../docs/category-banners.json',import.meta.url)));
test('Canonical categories navigate with stable IDs and their own banners on phone and desktop in both themes',async()=>{
 const server=await startPreview(0),base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const definitions=structuredClone(spec.categories).filter(c=>['clothing','clothing_costumes','clothing_pants','footwear','footwear_boots','armor','armor_carriers'].includes(c.category_id));
  const costumes=definitions.find(c=>c.category_id==='clothing_costumes');costumes.display_name_uk='Костюми та комплекти';costumes.path='Одяг та форма / Костюми та комплекти';
  const items=structuredClone(products.filter(p=>['body','legs','boots','armor'].includes(p.slot)));
  for(const p of items){const id={body:'clothing_costumes',legs:'clothing_pants',boots:'footwear_boots',armor:'armor_carriers'}[p.slot];p.category=definitions.find(c=>c.category_id===id).path;p.canonical_category_id=id;}
  const categories=definitions.map(c=>({name:c.display_name_uk,path:c.path,url_path:c.url_path,id:c.category_id,category_id:c.category_id,parent_id:c.parent_id,product_count:items.filter(p=>p.category===c.path||p.category.startsWith(c.path+' / ')).length}));
  for(const width of [390,1440])for(const theme of ['light','dark']){
   const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/shop/catalog.php*',route=>{const q=new URL(route.request().url()).searchParams;let result;
    if(q.get('action')==='categories')result={ok:true,categories};else if(q.get('action')==='storefront')result={ok:true,products:items,kits:[]};else{const category=categories.find(c=>c.url_path===q.get('category'));const selected=category?items.filter(p=>p.category===category.path||p.category.startsWith(category.path+' / ')):items;result={ok:true,items:selected,total:selected.length,page:1,pages:1,facets:{brands:[],sizes:[],camo:[],leaves:[],attrs:{}}};}return route.fulfill({json:result});});
   await page.route(base+'/catalog/**',async route=>{const response=await route.fetch();let html=await response.text();html=html.replace(/window\.RUBIZH_BOOT=\{.*?\};<\/script>/,`window.RUBIZH_BOOT=${JSON.stringify({categories,taxonomyVersion:spec.version})};</script>`);return route.fulfill({response,body:html});});
   await page.goto(base+'/catalog/odiah-ta-forma');await page.evaluate(t=>window.rubizhTheme.save(t),theme);
   
   // Selector classes may differ; use the real anchor destination as the interaction contract.
   const link=page.locator('a[href="/catalog/odiah-ta-forma/taktychni-kostiumy"]').filter({hasText:'Костюми та комплекти'}).first();await link.waitFor();
   const image=link.locator('img').first();assert.ok((await image.getAttribute('src')).includes('category-uniforms.'));
   await link.click();await page.waitForURL(url=>url.pathname==='/catalog/odiah-ta-forma/taktychni-kostiumy');await page.getByText(items.find(p=>p.slot==='body').name,{exact:true}).first().waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await page.close();
  }
  assert.equal(new Set(banners.map(b=>b.category_id)).size,117);assert.equal(spec.categories.filter(c=>c.status==='active'&&c.parent_id===null).length,18);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
