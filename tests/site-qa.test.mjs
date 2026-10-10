// Final SITE QA pass: static regressions over the UI sources the storefront actually serves.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';

const root=new URL('..',import.meta.url).pathname;
const read=f=>readFileSync(join(root,f),'utf8');
const served=()=>{const html=read('index.html');const assets=[...html.matchAll(/(?:src|href)="\/(assets\/[^"?]+\.(?:js|css))/g)].map(m=>m[1]);
 const php=['storefront.php',...readdirSync(join(root,'auth')).filter(f=>f.endsWith('.php')).map(f=>'auth/'+f)];
 return [...new Set(['index.html','offer.html','privacy.html',...assets,...php])].filter(f=>existsSync(join(root,f)));};
const CYR='А-Яа-яІіЇїЄєҐґ';

test('apostrophe: UI strings use the typographic apostrophe ’, never U+02BC ʼ / ‘ / ` and never a detached «Ім ‘ я»',()=>{
 const bad=new RegExp(`[${CYR}](?:\\u02bc|\\u2018|\`)[${CYR}]|[${CYR}]\\s+[\\u2018\\u02bc\`]\\s*[${CYR}]|[${CYR}][\\u2018\\u02bc\`]\\s+[${CYR}]`,'u');
 const hits=[];for(const f of served()){const s=read(f);s.split('\n').forEach((line,i)=>{if(bad.test(line))hits.push(f+':'+(i+1)+': '+line.match(bad)[0]);});}
 assert.deepEqual(hits,[]);
});

const servedClient=()=>served().find(f=>/^assets\/shop-client\./.test(f));
const servedV3=()=>served().find(f=>/^assets\/pim-v3-product\./.test(f));
import vm from 'node:vm';

test('availability: buyer labels come from the structured PIM status; provenance wording is never a badge; UNKNOWN is never «В наявності»',()=>{
 const src=read(servedClient());assert.ok(!src.includes('За даними постачальника'));
 const block=src.slice(src.indexOf('const STORE_V3_LABEL='),src.indexOf('function storeSizeMissing('));
 const {label,status,tone}=new Function(block+';return {label:STORE_V3_LABEL,status:storeV3Status,tone:storeV3Tone};')();
 const p=(...v)=>({variants:Object.fromEntries(v.map((x,i)=>[i,x]))});
 const cases=[[p({availability_v3:'IN_STOCK',payment_allowed:true},{availability_v3:'UNKNOWN'}),'В наявності','in'],[p({availability_v3:'UNKNOWN',order_submission_allowed:true}),'Уточнимо наявність','order'],
  [p({availability_v3:'PREORDER'}),'Під замовлення','order'],[p({availability_v3:'ORDER_ON_REQUEST'}),'Під замовлення','order'],[p({availability_v3:'SIZE_CONFIRMATION_REQUIRED'}),'Уточнимо розмір','order'],
  [p({availability_v3:'OUT_OF_STOCK'}),'Немає в наявності','out'],[p({availability_v3:'IN_STOCK',payment_allowed:false}),'Немає в наявності','out']];
 for(const [prod,text,t] of cases){const c=status(prod);assert.equal(label[c],text,JSON.stringify(prod));assert.equal(tone(c),t);}
 assert.match(read(servedV3()),/UNKNOWN:'Уточнимо наявність'/);
});

test('search: while a query loads the previous total is not shown; the title count is the server total, not the page size',()=>{
 const src=read(servedClient());
 assert.match(src,/t\.resultCountText=e\.storeLoading\?'Шукаємо…':/);
 assert.match(src,/"Результати за запитом «" \+ t\.sq \+ "»" \+ \(t\.storeLoading \? "" : " — " \+ x\(Number\(t\.storeCatalog\?\.total \?\? at\.length\)/);
 assert.match(src,/nodeCount=t => \{\s*\/\/ Inside a search the counts are the result's own/);
 assert.match(read('shop/catalog-lib.php'),/GROUP BY p\.category_path[^\n]*\$facets\['category_counts'\]=/);
 assert.ok(!/category_counts[^\n]*(REGEXP|JSON_)/.test(read('shop/catalog-lib.php')));
});

test('PIM v3 product: shown SKU = selected real SKU, characteristics in Ukrainian from canonical keys, no null values',()=>{
 const window={};vm.runInNewContext(read(servedV3()),{window,location:{search:''},URLSearchParams,Intl,history:{},document:{}});
 const a=window.storeV3Map({id:'m1',model_id:'m1',attributes:{color:null,camouflage:'Мультикам',season:'winter',gender:'male',material:'Cordura 1000D',unknown_key:'x'},colors:[{id:'c1',photos:[]},{id:'c2',photos:[]}],variants:[{sku:'RUB-1',color_id:'c1',size_display:'M'}],size_options:[]},{photoData:[],specs:[]});
 assert.deepEqual(JSON.parse(JSON.stringify(a.specs)),[['Сезон','Зима'],['Стать','Чоловіча'],['Матеріал','Cordura 1000D']]);
 const html=read('index.html');assert.match(html,/<sc-if value="\{\{ item\.sku \}\}"><span>\{\{ item\.skuTitle \}\} <span data-product-sku/);
 assert.match(read(servedV3()),/t\.item\.sku=v&&!v\.option_id\?v\.sku:single\?single\.sku:'';/);
 assert.match(html,/data-color-row="1"[^>]*>Колір</,'colour selector has its own heading, not «Розмір»');
});

test('layout fixes: category titles never split words, «Доставка» stays in the 861–1180px nav, cart modal centred, product gallery sticky, hero badge off the product',()=>{
 const css=read('assets/site-qa.2026101001.css');
 assert.match(css,/\.rz-category h3\{overflow-wrap:normal!important;word-break:normal!important/);
 assert.match(css,/\.rz-section-name\{overflow-wrap:normal!important;word-break:normal!important/);
 assert.ok(!/break-all/.test(css));
 assert.match(css,/@media \(min-width:861px\) and \(max-width:1180px\)\{\s*\[data-mainnav\]>\[role="button"\]:last-child\{display:flex!important\}/);
 assert.match(css,/\[data-mobile-dialog="mini"\]\{align-items:center!important/);
 assert.match(css,/\[data-product-gallery\]\{position:sticky/);
 assert.match(css,/@media \(max-width:1439px\)\{\.rz-hero-logo\{display:none!important\}\}/);
 const html=read('index.html');assert.ok(html.indexOf('/assets/site-qa.2026101001.css')<html.indexOf('</head>'));
});

test('photos: loading → skeleton, loaded → no «Фото готується» over the picture, error → fallback; the kit block is never a bare dark box',()=>{
 const html=read('index.html'),css=read('assets/site-qa.2026101001.css'),js=read('assets/site-qa.2026101001.js');
 assert.equal((html.match(/data-photo-box="1"/g)||[]).length,(html.match(/Фото готується<\/div>/g)||[]).length);
 assert.equal((html.match(/data-photo-ph="1"/g)||[]).length,(html.match(/Фото готується<\/div>/g)||[]).length);
 assert.match(css,/\[data-photo-box\]:has\(img:not\(\[data-error\]\)\) \[data-photo-ph\]\{visibility:hidden\}/);
 assert.match(css,/\.rz-kit-art:has\(img:not\(\[data-loaded\]\):not\(\[data-error\]\)\)/);
 assert.match(js,/dataset\.loaded='1'/);assert.match(js,/dataset\.error='1'/);
});

test('content: wholesale benefits listed once; informative images have alt; checkout recipient hint is a visible label, not a clipped placeholder',()=>{
 const html=read('index.html');
 assert.equal((html.match(/Рахунок на ФОП або ТОВ/g)||[]).length,1);assert.equal((html.match(/Закріплений менеджер/g)||[]).length,1);
 assert.match(html,/<img sc-camel-src="\{\{ gc\.src \}\}" alt="\{\{ gc\.title \}\}"/);
 assert.match(html,/<label data-checkout-recipient[^>]*><span>Інший отримувач \(необов’язково\)<\/span><input name="recipient"[^>]*placeholder="ПІБ отримувача"/);
 assert.ok(!html.includes('Отримувач інший? Вкажіть його ПІБ'));
 assert.match(html,/aria-disabled="true"[^>]*>\{\{ addLabel \}\}<\/div>/,'a disabled buy button says why (choose a size / availability), not always «Немає в наявності»');
});
