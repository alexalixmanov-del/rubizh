// Stage 5, 5-3: the PDF invoice for orders paid to the ФОП account — number = order number, date, seller requisites from
// the SITE settings, payer, lines, total in figures and in Ukrainian words, payment due = payment_due, payment purpose.
// The VAT line only from the owner's setting invoice_vat_note (empty → no PDF; OWNER sees «Заповніть статус ПДВ у
// налаштуваннях»). Download: receipt/cabinet (the order's owner only — IDOR) and CRM (OWNER/MANAGER/ACCOUNTANT).
// Server-side, no external service; Cyrillic font; the text is extracted by an independent parser (pdf.js).
import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {startCrm,line,roles5,staffEmail,password} from './helpers/crm-fixture.mjs';import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),runtime=(process.env.RUBIZH_PHP_RUNTIME||'/workspace/php-runtime/root/usr')+'';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const phpRun=code=>spawnSync(runtime+'/bin/php8.4',['-n','-d','extension='+runtime+'/lib/php/20240924/mbstring.so','-r',`require '${root}/shop/invoice-pdf.php';`+code],{encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,LD_LIBRARY_PATH:runtime+'/lib/x86_64-linux-gnu'},timeout:20000});
function php(code){const r=phpRun(code);assert.equal(r.status,0,r.stdout+'\n'+r.stderr);return r.stdout;}
const phpJson=v=>"json_decode(base64_decode('"+Buffer.from(JSON.stringify(v)).toString('base64')+"'),true)";
async function pdfText(bytes){
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const doc=await pdfjs.getDocument({data:new Uint8Array(bytes),verbosity:0,isEvalSupported:false}).promise;const pages=[];
 for(let i=1;i<=doc.numPages;i++){const c=await (await doc.getPage(i)).getTextContent();pages.push(c.items.map(x=>x.str).join(' ').replace(/\s+/g,' '));}
 return pages;
}
const sample=(lines=3,vat='ТЕСТОВИЙ СТАТУС ПДВ')=>({number:'RB-261016-ABCD1234',date:'16.10.2026',seller:{name:'ФОП Тестовий Продавець',tax_id:'1234567890',iban:'UA213223130000026007233566001',bank:'Тест-банк',mfo:'322001',address:'м. Київ',phone:'+380 50 000 00 00',email:'shop@example.test'},buyer:{name:'ТОВ «Ґрунт і Їжак»',code:'',address:''},
 lines:Array.from({length:lines},(_,i)=>({name:'Куртка тактична Softshell «Тест» №'+(i+1)+' · M · Чорний · RUB-F'+String(i).padStart(4,'0'),unit:'шт.',qty:2,price_kop:286050,sum_kop:572100})),subtotal_kop:572100*lines,discount_kop:0,total_kop:572100*lines,vat_note:vat,due:'19.10.2026, 18:00 (за київським часом)',purpose:'оплата замовлення RB-261016-ABCD1234'});

test('amount in Ukrainian words: control sums (genders, plurals, teens, thousands, millions)',()=>{
 const cases={100:'Одна гривня 00 копійок',201:'Дві гривні 01 копійка',2101:'Двадцять одна гривня 01 копійка',1112:'Одинадцять гривень 12 копійок',123456:'Одна тисяча двісті тридцять чотири гривні 56 копійок',
  200000:'Дві тисячі гривень 00 копійок',1234567890:'Дванадцять мільйонів триста сорок п’ять тисяч шістсот сімдесят вісім гривень 90 копійок',0:'Нуль гривень 00 копійок'};
 const keys=Object.keys(cases).map(Number);const out=JSON.parse(php(`$k=${phpJson(keys)};echo json_encode(array_combine($k,array_map('shopAmountInWordsUa',$k)),JSON_UNESCAPED_UNICODE);`));
 for(const [k,v] of Object.entries(cases))assert.equal(out[k],v,k);
});

test('PDF: opens, Cyrillic text extracts, table header on every page, amount in words, VAT line verbatim, no PDF without VAT note',async()=>{
 const bytes=Buffer.from(php(`echo base64_encode(shopInvoicePdf(${phpJson(sample(60))}));`),'base64');
 assert.equal(bytes.subarray(0,8).toString(),'%PDF-1.4');assert.match(bytes.subarray(-6).toString(),/%%EOF\n$/);
 const pages=await pdfText(bytes);assert.ok(pages.length>=3,'60 lines need several pages: '+pages.length);const all=pages.join(' ');
 for(const t of ['Рахунок на оплату № RB-261016-ABCD1234 від 16.10.2026','Постачальник:','ФОП Тестовий Продавець','РНОКПП 1234567890','IBAN UA213223130000026007233566001','Платник:','ТОВ «Ґрунт і Їжак»',
  'Куртка тактична Softshell «Тест» №60','2 860,50','343 260,00','ТЕСТОВИЙ СТАТУС ПДВ','Всього на суму: Триста сорок три тисячі двісті шістдесят гривень 00 копійок','Сплатити до: 19.10.2026, 18:00','Призначення платежу: оплата замовлення RB-261016-ABCD1234'])assert.ok(all.includes(t),'missing: '+t);
 pages.forEach((p,i)=>{assert.ok(p.includes('Сторінка '+(i+1)+' з '+pages.length),'footer on page '+(i+1));assert.ok(p.includes('Ціна, грн'),'table header on page '+(i+1));});
 const none=phpRun(`try{shopInvoicePdf(${phpJson(sample(1,''))});echo 'made';}catch(ShopInvoiceUnavailable $e){echo $e->getMessage();}`);
 assert.equal(none.stdout,'VAT_NOTE_MISSING','no invented VAT wording: no PDF without the owner setting');
});

test('payer requisites: optional, ЄДРПОУ/РНОКПП control digit, no military unit numbers (OPSEC)',()=>{
 const r=JSON.parse(php(`require_once '${root}/shop/wholesale-lib.php';$ok8=null;for($n=10000000;$n<10000100&&!$ok8;$n++)if(wholesaleEdrpouValid((string)$n))$ok8=(string)$n;$ok10=null;for($n=1000000000;$n<1000000100&&!$ok10;$n++)if(wholesaleRnokppValid((string)$n))$ok10=(string)$n;
 $bad8=substr($ok8,0,7).(((int)substr($ok8,7)+1)%10);
 $out=[];foreach([[],['payer_name'=>'ТОВ «Тест»','payer_code'=>$ok8,'payer_address'=>'м. Київ'],['payer_code'=>$ok10],['payer_code'=>$bad8],['payer_name'=>'Військова частина А1234'],['payer_address'=>'в/ч 1234'],['payer_name'=>'ФОП Іваненко']] as $c){try{$out[]=['ok',shopInvoicePayer($c)];}catch(RuntimeException $e){$out[]=['err',$e->getMessage()];}}echo json_encode($out,JSON_UNESCAPED_UNICODE);`));
 assert.deepEqual(r[0],['ok',[]]);assert.equal(r[1][0],'ok');assert.equal(r[1][1].payer_name,'ТОВ «Тест»');assert.equal(r[2][0],'ok');
 assert.equal(r[3][0],'err');assert.match(r[3][1],/контрольна цифра/);
 assert.deepEqual([r[4][0],r[5][0]],['err','err']);assert.match(r[4][1],/номер військової частини/);assert.equal(r[6][0],'ok');
});

test('invoice PDF over HTTP: owner of the order only (IDOR), roles in CRM, no PDF before confirmation or without VAT note, card orders have none',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  // An invoice order with payer requisites, placed from a buyer session.
  const who=await s.get('/shop/customer.php'),cookie=who.headers.get('set-cookie').split(';')[0],csrf=who.data.csrf;
  const lines=[{...line(),qty:2}];const q=await s.post('/shop/checkout-quote.php',{csrf,lines,payment:'invoice'},{Cookie:cookie});assert.equal(q.status,200,JSON.stringify(q.data));
  const contact={name:'Олена Петренко',recipient:'Олена Петренко',email:'buyer@fixture.test',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch',np_delivery:{city_ref:s.ref(10),warehouse_ref:s.ref(20)},payer_name:'ТОВ «Ґрунт»',payer_address:'м. Київ, вул. Тестова, 1'};
  const placed=await s.post('/shop/order.php',{csrf,request_id:crypto.randomUUID().replaceAll('-',''),contact,payment:'invoice',lines,expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version},{Cookie:cookie});
  assert.equal(placed.status,200,JSON.stringify(placed.data));const id=placed.data.order.id,number=s.sql('SELECT order_number FROM rubizh_customer_orders WHERE id='+id)[0].order_number;
  const stored=JSON.parse(s.sql('SELECT contact_json FROM rubizh_order_details WHERE order_id='+id)[0].contact_json);assert.equal(stored.payer_name,'ТОВ «Ґрунт»');
  const buyer=()=>s.get('/shop/invoice.php?order='+id,{Cookie:cookie});
  // Confirm availability when the order waits for the manager (then the PDF becomes available).
  const owner=await s.login('OWNER');let card=(await owner.get('/orders/'+id)).data.data;
  if(card.actions.includes('confirm')){assert.equal((await buyer()).status,409,'no PDF before confirmation');const r=await owner.send('/orders/'+id+'/confirm',{availability_confirmed:true,expected_version:card.version});assert.ok(r.status<300,JSON.stringify(r.data));card=(await owner.get('/orders/'+id)).data.data;}
  // No VAT note yet: no PDF anywhere; OWNER gets the owner's wording.
  assert.equal((await buyer()).status,409);
  assert.deepEqual([card.invoice_pdf.available,card.invoice_pdf.reason,card.invoice_pdf.message],[false,'VAT_NOTE_MISSING','Заповніть статус ПДВ у налаштуваннях']);
  const managerCard=(await (await s.login('MANAGER')).get('/orders/'+id)).data.data;assert.equal(managerCard.invoice_pdf.reason,'VAT_NOTE_MISSING');assert.notEqual(managerCard.invoice_pdf.message,'Заповніть статус ПДВ у налаштуваннях');
  assert.equal((await owner.get('/orders/'+id+'/invoice-pdf')).status,409);
  // The owner fills the VAT status (fixture wording, not a real one).
  writeFileSync(s.site+'/api/site-settings.json',JSON.stringify({invoice_vat_note:'ТЕСТОВИЙ СТАТУС ПДВ'}));
  const r=await fetch(s.base+'/shop/invoice.php?order='+id,{headers:{Cookie:cookie}});assert.equal(r.status,200,await r.clone().text());
  assert.equal(r.headers.get('content-type'),'application/pdf');assert.match(r.headers.get('content-disposition'),/attachment; filename="rakhunok-RB-/);assert.match(r.headers.get('cache-control'),/no-store/);
  const text=(await pdfText(Buffer.from(await r.arrayBuffer()))).join(' ');
  for(const t of ['Рахунок на оплату № '+number,'ТОВ «Ґрунт»','м. Київ, вул. Тестова, 1','ТЕСТОВИЙ СТАТУС ПДВ','Призначення платежу: оплата замовлення '+number,'Всього на суму:','Сплатити до:'])assert.ok(text.includes(t),'missing: '+t);
  // IDOR: another visitor, no session, a guessed id.
  const other=await s.get('/shop/customer.php'),otherCookie=other.headers.get('set-cookie').split(';')[0];
  assert.equal((await s.get('/shop/invoice.php?order='+id,{Cookie:otherCookie})).status,404,'another buyer');
  assert.equal((await s.get('/shop/invoice.php?order='+id)).status,404,'no session');
  assert.equal((await s.get('/shop/invoice.php?order='+(id+1000),{Cookie:cookie})).status,404,'unknown order');
  // CRM: OWNER, MANAGER, ACCOUNTANT download; WAREHOUSE and SUPPORT cannot (and get no invoice state).
  for(const role of roles5){const a=await s.login(role);const res=await fetch(s.base+'/api/staff/orders/'+id+'/invoice-pdf',{headers:{Cookie:a.cookie}});const allowed=['OWNER','MANAGER','ACCOUNTANT'].includes(role);
   assert.equal(res.status,allowed?200:403,role);if(allowed)assert.equal(res.headers.get('content-type'),'application/pdf',role);
   assert.equal((await a.get('/orders/'+id)).data.data.invoice_pdf?.available??null,allowed?true:null,role+' card state');}
  // Card orders have no ФОП invoice.
  const card2=await s.checkout([line()]);assert.equal((await s.get('/shop/invoice.php?order='+card2.id,{Cookie:card2.cookie})).status,409);
  assert.equal((await owner.get('/orders/'+card2.id)).data.data.invoice_pdf.reason,'NOT_INVOICE');
 }finally{s.stop();}
});

test('checkout: payer fields only for invoice payment, with the OPSEC hint; settings page has the VAT status field',()=>{
 const html=readFileSync(path.join(root,'index.html'),'utf8'),bundle=readFileSync(path.join(root,'assets/shop-client.2026101601.js'),'utf8'),settings=readFileSync(path.join(root,'shop/settings.php'),'utf8');
 assert.match(html,/<sc-if value="\{\{ payInvoice \}\}"[^>]*>\s*<fieldset data-payer-fields="1"/);
 for(const n of ['payer_name','payer_code','payer_address'])assert.match(html,new RegExp('<label[^>]*>[^<]+<input name="'+n+'"'),n+' has a visible label');
 assert.match(html,/Без прізвищ військових/);assert.match(bundle,/payer_name:\(e\.payerName/);
 assert.match(settings,/name="invoice_vat_note"/);assert.match(settings,/Заповніть статус ПДВ у налаштуваннях/);
});

test('hosting: shop/invoice-pdf.php and shop/fonts/ are not web-readable; the fonts and their licence ship in the archive',async()=>{
 const {execFileSync}=await import('node:child_process');const {mkdtempSync}=await import('node:fs');const {tmpdir}=await import('node:os');
 const shopRules=readFileSync(path.join(root,'shop/.htaccess'),'utf8');
 const denied=[...shopRules.matchAll(/<FilesMatch\s+"([^"]+)">\s*\n\s*Require all denied/g)].map(m=>new RegExp(m[1]));
 for(const f of ['invoice-pdf.php','wholesale-lib.php','order-create.php'])assert.ok(denied.some(r=>r.test(f)),f+' denied');
 assert.ok(!denied.some(r=>r.test('invoice.php')),'the buyer download stays public (it checks the owner itself)');
 assert.match(readFileSync(path.join(root,'shop/fonts/.htaccess'),'utf8'),/^Require all denied$/m,'shop/fonts/ denied');
 const zip=path.join(mkdtempSync(path.join(tmpdir(),'site-rel-')),'r.zip');execFileSync('python3',[path.join(root,'dev/package-release.py'),zip]);
 const names=execFileSync('python3',['-c',"import sys,zipfile;print('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))",zip],{encoding:'utf8'}).trim().split('\n').map(n=>n.replace(/^rubizh\//,''));
 for(const n of ['shop/fonts/RubizhInvoiceSans-Regular.ttf','shop/fonts/RubizhInvoiceSans-SemiBold.ttf','shop/fonts/OFL.txt','shop/fonts/.htaccess','shop/invoice-pdf.php','shop/invoice.php'])assert.ok(names.includes(n),n+' ships');
 assert.match(readFileSync(path.join(root,'shop/fonts/OFL.txt'),'utf8'),/SIL Open Font License, Version 1\.1/);
});

test('CRM screen: OWNER sees «Заповніть статус ПДВ у налаштуваннях», then «Завантажити рахунок (PDF)» downloads the invoice',{skip,timeout:300000},async()=>{
 const s=await startCrm({frontend:true,extraConfig:",'staging_allow_loopback'=>true"});const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const who=await s.get('/shop/customer.php'),cookie=who.headers.get('set-cookie').split(';')[0],csrf=who.data.csrf;const lines=[line()];
  const q=await s.post('/shop/checkout-quote.php',{csrf,lines,payment:'invoice'},{Cookie:cookie});
  const contact={name:'Олена Петренко',recipient:'Олена Петренко',email:'buyer@fixture.test',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch',np_delivery:{city_ref:s.ref(10),warehouse_ref:s.ref(20)}};
  const placed=await s.post('/shop/order.php',{csrf,request_id:crypto.randomUUID().replaceAll('-',''),contact,payment:'invoice',lines,expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version},{Cookie:cookie});assert.equal(placed.status,200);const id=placed.data.order.id;
  const owner=await s.login('OWNER');let card=(await owner.get('/orders/'+id)).data.data;
  if(card.actions.includes('confirm')){await owner.send('/orders/'+id+'/confirm',{availability_confirmed:true,expected_version:card.version});}
  const p=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(s.base+'/crm/');await p.getByLabel('Email').fill(staffEmail('OWNER'));await p.getByLabel('Пароль',{exact:true}).fill(password);await p.getByRole('button',{name:'Увійти'}).click();await p.getByRole('navigation',{name:'Основне'}).first().waitFor();
  await p.goto(s.base+'/crm/orders/'+id);await p.getByText('Заповніть статус ПДВ у налаштуваннях').waitFor();
  assert.equal(await p.getByRole('button',{name:'Завантажити рахунок (PDF)'}).count(),0,'no button without the VAT status');
  writeFileSync(s.site+'/api/site-settings.json',JSON.stringify({invoice_vat_note:'ТЕСТОВИЙ СТАТУС ПДВ'}));
  await p.reload();const button=p.getByRole('button',{name:'Завантажити рахунок (PDF)'});await button.waitFor();
  const [dl]=await Promise.all([p.waitForEvent('download'),button.click()]);assert.match(dl.suggestedFilename(),/^rakhunok-RB-.+\.pdf$/);
  const text=(await pdfText(readFileSync(await dl.path()))).join(' ');assert.ok(text.includes('ТЕСТОВИЙ СТАТУС ПДВ'));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();s.stop();}
});

test('PDF layout: for 1–45 lines (and a discount) no text reaches the footer; the totals block is never split',async()=>{
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const bad=[];
 for(let n=1;n<=45;n++){const inv={...sample(n),discount_kop:n%3?0:1000,subtotal_kop:572100*n+(n%3?0:1000)};
  const bytes=Buffer.from(php(`echo base64_encode(shopInvoicePdf(${phpJson(inv)}));`),'base64');
  const doc=await pdfjs.getDocument({data:new Uint8Array(bytes),verbosity:0,isEvalSupported:false}).promise;let totalsPage=null,wordsPage=null;
  for(let i=1;i<=doc.numPages;i++){for(const it of (await (await doc.getPage(i)).getTextContent()).items){if(!it.str.trim())continue;const y=it.transform[5];
   if(!/^Рахунок № |^Сторінка /.test(it.str)&&y<52)bad.push(n+': «'+it.str.slice(0,30)+'» at y='+y.toFixed(1));
   if(it.str.startsWith('Разом до сплати'))totalsPage=i;if(it.str.startsWith('Призначення платежу'))wordsPage=i;}}
  if(totalsPage!==wordsPage)bad.push(n+': totals on page '+totalsPage+', purpose on page '+wordsPage);}
 assert.deepEqual(bad,[]);
});
