// Stage 5.5 (owner D-72): real speed metrics (LCP, CLS, INP) through shop/analytics.php. Anonymous only: page template,
// value and device type. No IP, no cookie identifier, no URL. CRM screen for OWNER: median and p75 over 7 and 28 days.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {startCrm,staffEmail,password} from './helpers/crm-fixture.mjs';import {startSite,php} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const root=path.resolve(import.meta.dirname,'..');
const TEMPLATES=['home','catalog','category','product','kit'],METRICS=['LCP','CLS','INP'],DEVICES=['mobile','desktop'];
const kyivDay=(offset=0)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv'}).format(new Date(Date.now()-offset*86400000));
const pct=(values,p)=>{const s=[...values].sort((a,b)=>a-b);if(!s.length)return null;const i=(s.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return s[lo]+(s[hi]-s[lo])*(i-lo);};
const beacon=(s,body,type='application/json')=>fetch(s.base+'/shop/analytics.php',{method:'POST',headers:{'Content-Type':type},body:typeof body==='string'?body:JSON.stringify(body)});

test('D-72: the beacon stores only day, template, metric, device and value; bad input is refused; no cookie, no IP',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  const before=await s.get('/shop/analytics.php');assert.equal(before.status,200);assert.ok(before.data.settings,'GET still answers the public settings');
  const ok=[{t:'home',m:'LCP',v:1234.5,d:'mobile'},{t:'catalog',m:'CLS',v:0.05,d:'desktop'},{t:'category',m:'INP',v:180,d:'mobile'},{t:'product',m:'LCP',v:0,d:'desktop'},{t:'kit',m:'CLS',v:10,d:'mobile'}];
  for(const body of ok){const r=await beacon(s,body);assert.equal(r.status,204,JSON.stringify(body));assert.equal(r.headers.get('set-cookie'),null,'no cookie on the beacon');assert.equal(await r.text(),'');}
  const r=await beacon(s,{t:'home',m:'INP',v:90,d:'desktop'},'application/json; charset=UTF-8');assert.equal(r.status,204,'charset parameter accepted');
  const bad=[{t:'account',m:'LCP',v:1,d:'mobile'},{t:'home',m:'FID',v:1,d:'mobile'},{t:'home',m:'LCP',v:1,d:'tablet'},{t:'home',m:'LCP',v:60001,d:'mobile'},{t:'home',m:'INP',v:-1,d:'mobile'},
   {t:'home',m:'CLS',v:10.5,d:'mobile'},{t:'home',m:'LCP',v:'100',d:'mobile'},{t:'home',m:'LCP',v:null,d:'mobile'},{t:'home',m:'LCP',d:'mobile'},
   {t:'home',m:'LCP',v:100,d:'mobile',url:'/product/x?utm=1'},{t:'home',m:'LCP',v:100,d:'mobile',id:'abc'},[{t:'home',m:'LCP',v:100,d:'mobile'}],'not json','1e999'];
  for(const body of bad){const x=await beacon(s,body);assert.equal(x.status,400,JSON.stringify(body));assert.equal(x.headers.get('set-cookie'),null);}
  assert.equal((await beacon(s,{t:'home',m:'LCP',v:1,d:'mobile'},'text/plain')).status,415,'a non-JSON content type is refused');
  assert.equal((await beacon(s,{t:'home',m:'LCP',v:1,d:'mobile'},'application/x-www-form-urlencoded')).status,415);
  assert.equal((await beacon(s,JSON.stringify({t:'home',m:'LCP',v:1,d:'mobile',pad:'x'.repeat(1100)}))).status,413,'bodies over 1 KB are refused');
  const cols=s.sql('SHOW COLUMNS FROM rubizh_vitals').map(c=>c.Field);
  assert.deepEqual(cols,['day','template','metric','device','value'],'only the five anonymous fields (no IP, session, cookie or URL column)');
  const rows=s.sql('SELECT day,template,metric,device,value FROM rubizh_vitals ORDER BY template,metric');
  assert.equal(rows.length,ok.length+1);
  for(const row of rows)assert.equal(String(row.day).slice(0,10),kyivDay(),'stored by the Kyiv day');
  assert.deepEqual(rows.map(x=>[x.template,x.metric,x.device,+x.value]).sort(),[...ok.map(b=>[b.t,b.m,b.d,b.v]),['home','INP','desktop',90]].sort());
  const src=readFileSync(path.join(root,'shop/vitals-lib.php'),'utf8');
  assert.match(src,/shopLimit\(\$db,'vitals',\d+,\d+,'network:'\.rubizhNetworkIdentity\(\)\)/,'rate-limited per network with shopLimit');
  assert.doesNotMatch(src,/session_start|setcookie|rubizhDeviceIdentity|REMOTE_ADDR|HTTP_REFERER|REQUEST_URI/,'no session, cookie, address or URL');
 }finally{s.stop();}
});

test('D-72: OWNER sees median and p75 for 7 and 28 days per template × metric × device; other roles get 403',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  // Seed: inside 7 days, inside 28 days only, and outside 28 days (never counted).
  const seed=[];const add=(off,t,m,d,v)=>seed.push([kyivDay(off),t,m,d,v]);
  const in7=[1200,1800,2500,3100,4000],in28=[900,6000,7000],old=[50000,55000];
  in7.forEach((v,i)=>add(i,'home','LCP','mobile',v));in28.forEach((v,i)=>add(8+i*6,'home','LCP','mobile',v));old.forEach(v=>add(29,'home','LCP','mobile',v));old.forEach(v=>add(60,'home','LCP','mobile',v));
  const cls7=[0.01,0.02,0.2,0.3];cls7.forEach(v=>add(6,'product','CLS','desktop',v));add(27,'product','CLS','desktop',0.5);
  add(0,'kit','INP','mobile',120);
  const values=seed.map(r=>`('${r[0]}','${r[1]}','${r[2]}','${r[3]}',${r[4]})`).join(',');
  // The table exists once the stand is prepared (dev/prepare-runtime.php); the seed bypasses the HTTP beacon.
  php(`$db=new PDO('mysql:unix_socket='.getenv('RUBIZH_TEST_MYSQL_SOCKET').';dbname=${s.schema};charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec("INSERT INTO rubizh_vitals(day,template,metric,device,value) VALUES ${values}");`);
  const owner=await s.login('OWNER');const r=await owner.get('/site-speed');
  assert.equal(r.status,200,JSON.stringify(r.data).slice(0,300));
  const d=r.data.data;assert.equal(d.timezone,'Europe/Kyiv');assert.deepEqual(d.windows,[7,28]);
  assert.equal(d.rows.length,TEMPLATES.length*METRICS.length*DEVICES.length,'every template × metric × device');
  for(const t of TEMPLATES)for(const m of METRICS)for(const dev of DEVICES)assert.ok(d.rows.find(x=>x.template===t&&x.metric===m&&x.device===dev),t+m+dev);
  const row=(t,m,dev)=>d.rows.find(x=>x.template===t&&x.metric===m&&x.device===dev);
  const near=(a,b,msg)=>assert.ok(a!==null&&Math.abs(a-b)<0.01,`${msg}: ${a} ≠ ${b}`);
  const lcp=row('home','LCP','mobile');
  assert.equal(lcp.d7.n,in7.length);near(lcp.d7.median,pct(in7,0.5),'7d median');near(lcp.d7.p75,pct(in7,0.75),'7d p75');
  assert.equal(lcp.d28.n,in7.length+in28.length,'28 days: rows older than 28 days are not counted');near(lcp.d28.median,pct([...in7,...in28],0.5),'28d median');near(lcp.d28.p75,pct([...in7,...in28],0.75),'28d p75');
  const cls=row('product','CLS','desktop');
  assert.equal(cls.d7.n,4);near(cls.d7.median,pct(cls7,0.5),'CLS median');near(cls.d7.p75,pct(cls7,0.75),'CLS p75');
  assert.equal(cls.d28.n,5);near(cls.d28.p75,pct([...cls7,0.5],0.75),'CLS 28d p75');
  const inp=row('kit','INP','mobile');assert.equal(inp.d7.n,1);near(inp.d7.median,120,'single value');near(inp.d7.p75,120,'single value p75');
  const empty=row('catalog','INP','desktop');assert.deepEqual([empty.d7,empty.d28],[{n:0,median:null,p75:null},{n:0,median:null,p75:null}]);
  for(const role of ['MANAGER','ACCOUNTANT','WAREHOUSE','SUPPORT']){const x=await (await s.login(role)).get('/site-speed');assert.equal(x.status,403,role);assert.equal(x.data.error.code,'PERMISSION_DENIED');}
  assert.equal((await s.get('/api/staff/site-speed')).status,401,'no session → 401');
 }finally{s.stop();}
});

test('D-72: the client asset is versioned, deferred from index.html, never sends the URL and maps paths to templates',()=>{
 const html=readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/<script defer src="\/assets\/vitals\.2026101801\.js"><\/script>/,'loaded with defer, no inline code');
 const file=path.join(root,'assets/vitals.2026101801.js');assert.ok(existsSync(file));const src=readFileSync(file,'utf8');
 assert.doesNotMatch(src,/location\.href|location\.search|location\.hash|document\.URL|document\.referrer|\.search\b|cookie|localStorage|sessionStorage/,'no URL, query, cookie or storage');
 assert.match(src,/navigator\.sendBeacon\('\/shop\/analytics\.php',new Blob\(\[JSON\.stringify\(\{t:[a-z]+,m:[a-z]+,v:[a-z]+,d:[a-z]+\}\)\],\{type:'application\/json'\}\)\)/,'sends only {t,m,v,d} as application/json');
 assert.match(src,/pagehide/);assert.match(src,/visibilityState==='hidden'/);
 assert.match(src,/largest-contentful-paint/);assert.match(src,/layout-shift/);assert.match(src,/hadRecentInput/);assert.match(src,/interactionId/);
 assert.match(src,/matchMedia\('\(max-width:860px\)'\)/);
 const fn=src.match(/function rzVitalsTemplate\(p\)\{[^\n]*?\n?\}/)?.[0];assert.ok(fn,'mapping function present');
 const ctx={};vm.runInNewContext(fn+';this.map=rzVitalsTemplate;',ctx);
 const cases={'/':'home','/catalog':'catalog','/catalog/':'catalog','/catalog/odiah-ta-forma':'category','/catalog/odiah/kurtky':'category','/product/kurtka-test':'product','/kit':'kit','/kit/':'kit',
  '/kit/0123456789abcdef0123456789abcdef':null,'/product/':null,'/categories':null,'/porady/rozmir':null,'/account/':null,'/offer':null,'/catalogue':null,'/productx':null,'':null};
 for(const [p,want] of Object.entries(cases))assert.equal(ctx.map(p),want,JSON.stringify(p));
});

test('D-72: in a browser the storefront home page sends its metrics on leaving (template home, only {t,m,v,d})',{skip,timeout:180000},async()=>{
 const {chromium}=await import('playwright');
 const s=await startSite(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();const sent=[];
  page.on('request',q=>{if(q.method()==='POST'&&q.url().endsWith('/shop/analytics.php'))sent.push(q.postData());});
  await page.goto(s.base+'/?utm_source=test#x');await page.waitForLoadState('load');await page.waitForTimeout(800);
  await page.mouse.click(10,400);await page.waitForTimeout(300);
  await page.goto('about:blank');
  for(let i=0;i<50&&!s.sql('SELECT COUNT(*) n FROM rubizh_vitals')[0].n;i++)await new Promise(r=>setTimeout(r,100));
  const rows=s.sql('SELECT template,metric,device FROM rubizh_vitals');
  assert.ok(rows.length>=1,'at least one metric stored: '+JSON.stringify(sent));
  for(const r of rows)assert.deepEqual([r.template,r.device],['home','mobile']);
  for(const body of sent){assert.deepEqual(Object.keys(JSON.parse(body)).sort(),['d','m','t','v']);assert.doesNotMatch(body,/utm|\?|#|http/);}
  assert.equal(new Set(rows.map(r=>r.metric)).size,rows.length,'each metric once');
 }finally{await browser.close();s.stop();}
});

test('D-72: CRM «Швидкість сайту» for OWNER on Analytics: accessible table, values, no overflow on a phone; ACCOUNTANT does not see it',{skip,timeout:300000},async()=>{
 const {chromium}=await import('playwright');
 const s=await startCrm({frontend:true}),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  php(`$db=new PDO('mysql:unix_socket='.getenv('RUBIZH_TEST_MYSQL_SOCKET').';dbname=${s.schema};charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec("INSERT INTO rubizh_vitals(day,template,metric,device,value) VALUES ('${kyivDay()}','home','LCP','mobile',2000),('${kyivDay()}','home','LCP','mobile',3000),('${kyivDay()}','product','CLS','desktop',0.05),('${kyivDay(10)}','kit','INP','mobile',250)");`);
  const login=async(page,role)=>{await page.goto(s.base+'/crm/');await page.getByLabel('Email').fill(staffEmail(role));await page.getByLabel('Пароль',{exact:true}).fill(password);await page.getByRole('button',{name:'Увійти'}).click();await page.getByRole('navigation',{name:'Основне'}).waitFor();};
  for(const [width,height] of [[1440,900],[390,844]]){
   const ctx=await browser.newContext({viewport:{width,height}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await login(page,'OWNER');await page.goto(s.base+'/crm/analytics');
   await page.getByRole('heading',{name:'Швидкість сайту'}).waitFor();
   const table=page.getByRole('table',{name:/Швидкість сайту: медіана та p75/});await table.waitFor();
   for(const name of ['Головна','Каталог','Категорія','Товар','Комплект'])assert.equal(await table.getByRole('rowheader',{name}).count(),1,name);
   assert.equal(await table.locator('th[scope="colgroup"]').allInnerTexts().then(x=>x.join('|')),'7 днів|28 днів');
   const text=await table.innerText();assert.match(text,/2,5 с/,'median of 2 s and 3 s in Ukrainian format');assert.match(text,/0,05/);assert.match(text,/250 мс/);assert.match(text,/мобільний/);assert.match(text,/комп’ютер/);
   assert.match(await page.locator('.speed-panel').innerText(),/LCP ≤ 2,5 с, INP ≤ 200 мс, CLS ≤ 0,1/);
   await page.waitForLoadState('networkidle');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=1,width+': no horizontal page scroll');
   assert.deepEqual(errors,[]);await ctx.close();
  }
  const ctx=await browser.newContext();const page=await ctx.newPage();const speed=[];page.on('request',q=>{if(q.url().includes('/api/staff/site-speed'))speed.push(q.url());});
  await login(page,'ACCOUNTANT');await page.goto(s.base+'/crm/analytics');await page.getByRole('heading',{level:1}).first().waitFor();await page.waitForLoadState('networkidle');
  assert.equal(await page.getByRole('heading',{name:'Швидкість сайту'}).count(),0,'ACCOUNTANT sees Analytics without the speed block');assert.deepEqual(speed,[],'and never asks for it');
  await ctx.close();
 }finally{await browser.close();s.stop();}
});
test('D-72 (stage 5.5 review): a host where prepare-runtime was not re-run — the first beacon creates the table, the report is empty, not an error',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  s.sql('DROP TABLE rubizh_vitals');
  const owner=await s.login('OWNER');const empty=await owner.get('/site-speed');assert.equal(empty.status,200,JSON.stringify(empty.data));
  assert.equal(empty.data.data.rows.length,30);assert.ok(empty.data.data.rows.every(r=>r.d7.n===0&&r.d28.n===0));
  s.sql('DROP TABLE rubizh_vitals');
  assert.equal((await beacon(s,{t:'home',m:'LCP',v:2100,d:'mobile'})).status,204,'the beacon creates the table');
  assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_vitals')[0].n,1);
  const idx=s.sql("SHOW INDEX FROM rubizh_vitals WHERE Key_name='idx_vitals_slice'").map(r=>r.Column_name);
  assert.deepEqual(idx,['template','metric','device','value','day'],'the report reads one slice in value order from the index');
 }finally{s.stop();}
});
