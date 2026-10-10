// Real PIM models on staging (after real-ingest with STOP_AFTER_INGEST): colour switch, gallery, ?color= deep link.
import {spawn} from 'node:child_process';import {writeFileSync,readFileSync} from 'node:fs';import {createServer} from 'node:net';import {chromium} from 'playwright';import {spawnSync} from 'node:child_process';
const S='/tmp/claude-0/staging',M='/tmp/claude-0/rt/mysql8';
const wire=JSON.parse(readFileSync(process.argv[2],'utf8'));
const models=wire.products.filter(p=>p.colors.length>=2&&p.colors.filter(c=>c.photos.length).length>=2&&p.colors.every(c=>c.photos.length&&!p.colors.some(o=>o!==c&&o.photos.includes(c.photos[0])))).slice(0,3);
const siteSlug=id=>spawnSync(M+'/root/usr/bin/mysql',['--socket='+M+'/mysql.sock','-uroot','-N','-B','prodcopy','-e',"SELECT slug FROM products WHERE pim_contract_version=3 AND id='"+id.replace(/[^a-z0-9]/g,'')+"'"],{encoding:'utf8'}).stdout.trim();
for(const m of models)m.site_slug=siteSlug(m.id);
const port=await new Promise(r=>{const s=createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});const base='http://127.0.0.1:'+port;
const server=spawn('php',['-d','pdo_mysql.default_socket='+M+'/mysql.sock','-d','session.save_path='+S+'/cache','-S',base.slice(7),'-t',S+'/www',S+'/www/router.php'],{stdio:['ignore','ignore','pipe']});let errlog='';server.stderr.on('data',x=>errlog+=x);
for(let i=0;i<100;i++){try{if((await fetch(base+'/api/pim/status')).status)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const report={models:models.map(m=>({id:m.id,slug:m.site_slug,pim_slug:m.slug,colors:m.colors.length})),checks:[]};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 for(const m of models)for(const vp of [{width:390,height:844},{width:768,height:1024},{width:1440,height:900}]){
  const page=await browser.newPage({viewport:vp}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.route(/^https:\/\/(?!127)/,r=>r.request().resourceType()==='image'?r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64')}):r.abort());
  const imgs=()=>page.evaluate(()=>[...document.querySelectorAll('img')].map(i=>i.getAttribute('src')||''));
  const target=m.colors[1],label=[target.color,target.camouflage].filter(Boolean).join(' / ')||target.id;
  await page.goto(base+'/product/'+m.site_slug);await page.waitForLoadState('networkidle');
  const before=await imgs();
  const button=page.locator('[data-color-id="'+target.id+'"],button[data-color="'+target.id+'"]').first().or(page.getByRole('button',{name:label,exact:true}).first());
  let clicked=false;try{await button.click({timeout:5000});clicked=true;}catch{}
  let switched=false;try{await page.waitForFunction(urls=>[...document.querySelectorAll('img')].some(i=>urls.includes(i.getAttribute('src'))),target.photos,{timeout:5000});switched=true;}catch{}
  const url=page.url(),overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  const deep=await browser.newPage({viewport:vp});await deep.route(/^https:\/\/(?!127)/,r=>r.abort());await deep.goto(base+'/product/'+m.site_slug+'?color='+encodeURIComponent(target.id));await deep.waitForLoadState('networkidle');
  const deepOk=await deep.evaluate(urls=>[...document.querySelectorAll('img')].some(i=>urls.includes(i.getAttribute('src'))),target.photos);await deep.close();
  report.checks.push({model:m.id,width:vp.width,label,clicked,gallery_switched:switched,url_has_color:url.includes('color='+encodeURIComponent(target.id))||url.includes('color='+target.id),deep_link_gallery:deepOk,overflow,errors:errors.slice(0,2),first_color_photo_shown_before:before.some(s=>m.colors[0].photos.includes(s))});
  await page.screenshot({path:S+'/private/real-'+m.id+'-'+vp.width+'.png'});await page.close();
 }
}finally{await browser.close();server.kill();report.ok=report.checks.length>0&&report.checks.every(c=>c.clicked&&c.gallery_switched&&c.url_has_color&&c.deep_link_gallery&&!c.overflow&&!c.errors.length);writeFileSync(S+'/private/real-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,1).slice(0,4000));}
