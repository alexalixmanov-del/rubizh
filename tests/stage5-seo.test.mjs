// Stage 5, 5-5 (indexing, owner 2026-10-16): D-62 group pages /rozdil/<slug>; SEO-5.2 robots.txt for Googlebot, Bingbot,
// GPTBot and «*», with and without the block the hosting (adm.tools) prepends; SEO-5.3 product card without JS; SEO-5.4
// image sitemap; SEO-5.5 Organization and WebSite JSON-LD on the home page; SEO-5.6 one description, canonical, robots and
// breadcrumbs on direct visits and after SPA navigation; individual category descriptions.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import path from 'node:path';
import {chromium} from 'playwright';
import {startSite,publish,wire,root} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;

// ---------- RFC 9309 robots.txt evaluation (groups merged per agent, longest match, Allow wins a tie) ----------
function parseRobots(text){
 const groups=[];let cur=null,lastWasAgent=false;
 for(const raw of text.split(/\r?\n/)){const line=raw.replace(/#.*/,'').trim();if(!line)continue;const m=/^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);if(!m)continue;const key=m[1].toLowerCase(),value=m[2].trim();
  if(key==='user-agent'){if(!cur||!lastWasAgent){cur={agents:[],rules:[]};groups.push(cur);}cur.agents.push(value.toLowerCase());lastWasAgent=true;continue;}
  lastWasAgent=false;if(cur&&(key==='allow'||key==='disallow'))cur.rules.push({allow:key==='allow',path:value});}
 return groups;
}
function allowed(text,agent,url){
 const groups=parseRobots(text),token=agent.toLowerCase();
 let rules=groups.filter(g=>g.agents.includes(token)).flatMap(g=>g.rules);
 if(!groups.some(g=>g.agents.includes(token)))rules=groups.filter(g=>g.agents.includes('*')).flatMap(g=>g.rules);
 let best=null;
 for(const r of rules){if(r.path==='')continue;const end=r.path.endsWith('$'),body=end?r.path.slice(0,-1):r.path;
  const re=new RegExp('^'+body.replace(/[.+?^{}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+(end?'$':''));
  if(re.test(url)&&(!best||r.path.length>best.path.length||r.path.length===best.path.length&&r.allow))best=r;}
 return best?best.allow:true;
}
const HOSTING_BLOCK=`# BEGIN adm.tools Managed content
User-agent: *
Allow: /

User-agent: SemrushBot
User-agent: AhrefsBot
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: PerplexityBot
Disallow: /
# END adm.tools Managed content
`;

test('SEO-5.2 robots.txt: Googlebot, Bingbot, GPTBot and «*» get the same access with and without the hosting block',()=>{
 const ours=readFileSync(path.join(root,'robots.txt'),'utf8');
 const open=['/','/catalog','/catalog/odiah-ta-forma','/product/kurtka-test','/categories','/rozdil/bronezakhyst','/porady','/porady/rozmir','/sitemap.xml','/kit/','/shop/catalog.php','/shop/analytics.php','/offer','/privacy'];
 const closed=['/auth/','/auth/?tab=orders','/shop/order.php','/shop/settings.php','/api/catalog','/api/staff/orders','/staff/','/crm/','/crm/orders/1','/kit/0123456789abcdef0123456789abcdef'];
 const table=[];
 for(const [label,text] of [['ours',ours],['hosting+ours',HOSTING_BLOCK+ours]])for(const agent of ['Googlebot','Bingbot','GPTBot','*'])
  for(const url of [...open,...closed])table.push({label,agent,url,expected:open.includes(url),got:allowed(text,agent==='*'?'SomeOtherBot':agent,url)});
 assert.deepEqual(table.filter(r=>r.expected!==r.got),[],'robots mismatches');
 // The hosting block keeps its own bans for bots we do not name.
 assert.equal(allowed(HOSTING_BLOCK+ours,'SemrushBot','/catalog'),false);
 // A crawler with its own group ignores «*»: the Googlebot and Bingbot groups carry the full rule set themselves.
 const groups=parseRobots(ours),rulesOf=a=>JSON.stringify(groups.find(g=>g.agents.includes(a)).rules);
 assert.equal(rulesOf('googlebot'),rulesOf('*'));assert.equal(rulesOf('bingbot'),rulesOf('*'));assert.equal(rulesOf('gptbot'),rulesOf('*'));
 assert.match(ours,/^Sitemap: https:\/\/rubizh\.shop\/sitemap\.xml$/m);
});

const schemas=html=>[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)].map(m=>JSON.parse(m[1]));
const metas=html=>({descriptions:[...html.matchAll(/<meta\b[^>]*name="description"[^>]*content="([^"]*)"/g)].map(m=>m[1]),canonicals:[...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*href="([^"]*)"/g)].map(m=>m[1]),robots:[...html.matchAll(/<meta\b[^>]*name="robots"[^>]*content="([^"]*)"/g)].map(m=>m[1])});
// The fixture router serves only / and /product/ through storefront.php; route every storefront path like .htaccess does.
const storefrontRouter=s=>writeFileSync(s.site+'/router.php',"<?php $p=(string)strtok($_SERVER['REQUEST_URI'],'?');if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}if($p==='/sitemap.xml'){require __DIR__.'/sitemap.php';return;}if($p==='/'||preg_match('~^/(?:product|catalog|kit|categories|porady|rozdil)(?:/.*)?$~',$p)){require __DIR__.'/storefront.php';return;}return false;");
const unescape=t=>t.replace(/&#039;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,'&');

test('D-62 group pages, 301s, sitemap with images, home JSON-LD, product without JS, individual category descriptions',{skip,timeout:300000},async()=>{
 const s=await startSite();
 try{
  storefrontRouter(s);assert.equal((await publish(s,wire)).status,200);
  // Group page: clean address, H1, short text, subcategories, goods, canonical, breadcrumbs, one description.
  const g=await s.get('/rozdil/sporiadzhennia');assert.equal(g.status,200);
  const m=metas(g.text);assert.equal(m.descriptions.length,1);assert.deepEqual(m.canonicals,['https://rubizh.shop/rozdil/sporiadzhennia']);assert.deepEqual(m.robots,[]);
  assert.match(g.text,/<title>Спорядження — купити в РУБІЖ<\/title>/);assert.match(m.descriptions[0],/^Спорядження в РУБІЖ/);
  const noscript=g.text.slice(g.text.indexOf('<noscript>'),g.text.indexOf('</noscript>'));
  assert.match(noscript,/<h1>Спорядження<\/h1>/);assert.match(noscript,/Рюкзаки, сумки та баули, підсумки/);assert.match(noscript,/<h2>Категорії<\/h2><ul><li><a href="\/catalog\//);
  const pouch=wire.products.find(p=>p.id==='m-pouch');assert.ok(noscript.includes('/product/'+pouch.slug),'goods of the group');
  const crumbs=schemas(g.text).find(x=>x['@type']==='BreadcrumbList');assert.deepEqual(crumbs.itemListElement.map(i=>i.name),['РУБІЖ','Каталог','Спорядження']);
  assert.equal((await s.get('/rozdil/bronezakhyst')).status,200);assert.equal((await s.get('/rozdil/nemaie')).status,404);
  const slash=await fetch(s.base+'/rozdil/bronezakhyst/',{redirect:'manual'});assert.equal(slash.status,301);assert.equal(slash.headers.get('location'),'/rozdil/bronezakhyst');
  // Old multi-root addresses answer 301 to the group page.
  for(const [roots,to] of [[['Бронезахист','Шоломи та захист голови'],'/rozdil/bronezakhyst'],[['Рюкзаки, сумки та баули','Підсумки','РПС та розвантаження'],'/rozdil/sporiadzhennia']]){
   const r=await fetch(s.base+'/catalog?roots='+encodeURIComponent(JSON.stringify(roots)),{redirect:'manual'});assert.equal(r.status,301);assert.equal(r.headers.get('location'),to);}
  // Sitemap: group pages and product images.
  const map=await s.get('/sitemap.php');assert.match(map.text,/xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
  for(const slug of ['bronezakhyst','sporiadzhennia'])assert.ok(map.text.includes('<loc>https://rubizh.shop/rozdil/'+slug+'</loc>'));
  assert.match(map.text,/<url><loc>https:\/\/rubizh\.shop\/product\/[^<]+<\/loc><lastmod>[^<]+<\/lastmod><image:image><image:loc>https:\/\/[^<]+<\/image:loc><\/image:image>/);
  // Home: Organization and WebSite.
  const home=await s.get('/');const ld=schemas(home.text);
  const org=ld.find(x=>x['@type']==='Organization'),site=ld.find(x=>x['@type']==='WebSite');
  assert.ok(org&&site,'Organization and WebSite JSON-LD');assert.equal(org.url,'https://rubizh.shop/');assert.match(org.logo,/^https:\/\/rubizh\.shop\//);assert.equal(site.publisher['@id'],org['@id']);
  assert.equal(site.potentialAction['@type'],'SearchAction');assert.match(site.potentialAction.target,/\{search_term_string\}/);
  // Product without JS: main photo, colours, sizes, availability, price in the server HTML.
  const jacket=wire.products.find(p=>p.id==='m-jacket');const pr=await s.get('/product/'+jacket.slug);
  const card=pr.text.slice(pr.text.indexOf('<noscript>'),pr.text.indexOf('</noscript>'));
  assert.match(card,/<img src="[^"]+" alt="[^"]+"/);assert.match(card,/Колір: [^<]*Чорний/);assert.match(card,/Розміри: [^<]+/);assert.match(card,/Наявність: (в наявності|під замовлення|немає в наявності)/);assert.match(card,/Ціна: [0-9 ]+ ₴/);
  // Individual category descriptions (own count, price, brands) instead of one generic sentence.
  const cats=(await s.get('/api/categories')).data.categories.filter(c=>c.product_count>0);assert.ok(cats.length>=2);
  const descs=[];for(const c of cats.slice(0,4)){const r=await s.get('/catalog/'+c.url_path);const d=metas(r.text).descriptions;assert.equal(d.length,1,c.url_path);descs.push(d[0]);
   assert.ok(unescape(d[0]).startsWith(c.name+' у РУБІЖ: '+c.product_count+' '),c.url_path+': '+d[0]);assert.ok(unescape(d[0]).length<=160);assert.equal(c.seo_description,unescape(d[0]));}
  assert.equal(new Set(descs).size,descs.length,'every category has its own description');
 }finally{s.stop();}
});

test('SEO-5.6: one description, canonical, robots and breadcrumbs on direct visits and after SPA navigation; old #ac- anchors land on the group page',{skip,timeout:300000},async()=>{
 const s=await startSite();const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
  storefrontRouter(s);assert.equal((await publish(s,wire)).status,200);
  const ctx=await browser.newContext({viewport:{width:1280,height:900}});await ctx.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const head=()=>page.evaluate(()=>({descriptions:[...document.head.querySelectorAll('meta[name="description"]')].map(m=>m.content),canonicals:[...document.head.querySelectorAll('link[rel="canonical"]')].map(l=>l.href),robots:[...document.head.querySelectorAll('meta[name="robots"]')].map(m=>m.content),
   crumbs:[...document.head.querySelectorAll('script[type="application/ld+json"]')].map(n=>{try{return JSON.parse(n.textContent);}catch{return null;}}).filter(x=>x?.['@type']==='BreadcrumbList').map(x=>x.itemListElement.map(i=>i.name)),title:document.title,path:location.pathname,url:location.pathname+location.search}));
  const settle=()=>page.waitForTimeout(700);
  const category=(await s.get('/api/categories')).data.categories.find(c=>c.product_count>0&&!c.path.includes(' / '));
  const direct={};
  for(const route of ['/rozdil/sporiadzhennia','/catalog/'+category.url_path,'/product/'+wire.products.find(p=>p.id==='m-jacket').slug]){
   await page.goto(s.base+route,{waitUntil:'networkidle'});await page.locator('#dc-root h1').first().waitFor();await settle();const h=await head();
   assert.equal(h.descriptions.length,1,route+' one description');assert.equal(h.canonicals.length,1,route+' one canonical');assert.ok(h.robots.length<=1,route);assert.equal(h.crumbs.length,1,route+' one breadcrumb list');
   direct[route]=h;
  }
  assert.equal(direct['/catalog/'+category.url_path].descriptions[0],category.seo_description,'the client keeps the server description');
  // SPA: home → «Спорядження» card → the same head as the direct visit.
  await page.goto(s.base+'/',{waitUntil:'networkidle'});await page.locator('a.rz-category[aria-label="Спорядження"]').click();await page.waitForURL(u=>new URL(u).pathname==='/rozdil/sporiadzhennia');await settle();
  const spa=await head();const want=direct['/rozdil/sporiadzhennia'];
  assert.deepEqual({d:spa.descriptions,c:spa.canonicals,r:spa.robots,b:spa.crumbs,t:spa.title},{d:want.descriptions,c:want.canonicals,r:want.robots,b:want.crumbs,t:want.title},'SPA head = direct head');
  assert.equal((await page.locator('#dc-root h1').first().innerText()).trim().toUpperCase(),'СПОРЯДЖЕННЯ');
  // SPA to the category and back keeps one set of tags equal to the direct visit.
  await page.goto(s.base+'/',{waitUntil:'networkidle'});await page.locator('a.rz-category[aria-label="Одяг та форма"]').click();
  await page.waitForURL(u=>new URL(u).pathname.startsWith('/catalog/'));await settle();const viaSpa=await head();
  await page.goto(s.base+viaSpa.url,{waitUntil:'networkidle'});await page.locator('#dc-root h1').first().waitFor();await settle();const viaDirect=await head();
  assert.deepEqual({d:viaSpa.descriptions,c:viaSpa.canonicals,r:viaSpa.robots,b:viaSpa.crumbs,t:viaSpa.title},{d:viaDirect.descriptions,c:viaDirect.canonicals,r:viaDirect.robots,b:viaDirect.crumbs,t:viaDirect.title},'category: SPA head = direct head');
  // Old group sections on /categories open the group page.
  await page.goto(s.base+'/categories#ac-riukzaky-sumky-ta-bauly');await page.waitForURL(u=>new URL(u).pathname==='/rozdil/sporiadzhennia');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();s.stop();}
});
