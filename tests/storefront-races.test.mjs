import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const asset=html.match(/src="\/(assets\/shop-client[^"?]+)[?\"]/)[1];
const source=readFileSync(new URL('../'+asset,import.meta.url),'utf8');
// Execute the shipped class methods with controlled network responses, not copies.
function method(name,context){
 const start=source.lastIndexOf('\n        '+name+'=');
 assert.ok(start>=0,name);
 const from=start+('\n        '+name+'=').length;
 const next=source.slice(from).search(/\n        [a-zA-Z_]\w*[=(]/);
 const expression=source.slice(from,from+next).trim().replace(/;$/,'');
 return new Function('return function(){return ('+expression+');}')().call(context);
}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function context(state){return {state,customerUnmounted:false,setState(patch){Object.assign(this.state,patch);}};}
const order=number=>({order:{number,items:[{sku:'fixture',qty:1}],payment_status:'unpaid'}});

test('Opening a second order during an in-flight receipt request loads the second order',async()=>{
 const a=deferred(),b=deferred(),calls=[];
 const c=context({orderNumber:'A',lastOrder:null});
 c.storeReceiptNumber=()=>c.state.orderNumber;c.storeTrackPaid=()=>{};
 c.storeRequest=url=>{calls.push(url);return url.endsWith('A')?a.promise:b.promise;};
 c.storeLoadReceipt=method('storeLoadReceipt',c);
 const first=c.storeLoadReceipt();c.state.orderNumber='B';const second=c.storeLoadReceipt();
 b.resolve(order('B'));await second;a.resolve(order('A'));await first;
 assert.equal(calls.length,2);assert.equal(c.state.lastOrder?.number,'B');assert.equal(c.state.receiptLoading,false);
});
test('An older failed receipt request cannot erase a newer successful order',async()=>{
 const a=deferred(),b=deferred(),c=context({orderNumber:'A',lastOrder:null});
 c.storeReceiptNumber=()=>c.state.orderNumber;c.storeTrackPaid=()=>{};c.storeRequest=url=>url.endsWith('A')?a.promise:b.promise;
 c.storeLoadReceipt=method('storeLoadReceipt',c);
 const first=c.storeLoadReceipt();c.state.orderNumber='B';const second=c.storeLoadReceipt();
 b.resolve(order('B'));await second;a.reject(new Error('old request failed'));await first;
 assert.equal(c.state.lastOrder?.number,'B');assert.equal(c.state.receiptError,'');
});
test('Receipt refresh deduplicates the same order and retains its last known data on a network failure',async()=>{
 const a=deferred(),c=context({orderNumber:'A',lastOrder:order('A').order});let calls=0;
 c.storeReceiptNumber=()=>c.state.orderNumber;c.storeTrackPaid=()=>{};c.storeRequest=()=>{calls++;return a.promise;};
 const load=method('storeLoadReceipt',c),first=load();await load();assert.equal(calls,1);
 a.reject(new Error('offline'));await first;assert.equal(c.state.lastOrder.number,'A');assert.equal(c.state.receiptLoading,false);assert.equal(c.state.receiptError,'offline');
});
test('Out-of-order promo responses keep the latest requested code and quote',async()=>{
 const a=deferred(),b=deferred(),c=context({promoInput:'FIRST',cart:[{sku:'one',qty:1}]});
 c.storePricingLines=cart=>cart;c.storeRequest=(url,body)=>body.promo==='FIRST'?a.promise:b.promise;
 const apply=method('applyPromo',c),first=apply();c.state.promoInput='SECOND';const second=apply();
 b.resolve({quote:{total:90}});await second;a.resolve({quote:{total:80}});await first;
 assert.equal(c.state.promo,'SECOND');assert.equal(c.state.storeQuote.total,90);
});
test('Clearing a promo while it is loading cannot restore the old discount',async()=>{
 const a=deferred(),c=context({promoInput:'FIRST',cart:[{sku:'one',qty:1}]});
 c.storePricingLines=cart=>cart;c.storeRequest=()=>a.promise;
 const apply=method('applyPromo',c),first=apply();c.state.promoInput='';await apply();
 a.resolve({quote:{total:80}});await first;
 assert.equal(c.state.promo,null);assert.equal(c.state.storeQuote,null);
});
test('An older promo error cannot remove a newer valid discount',async()=>{
 const a=deferred(),b=deferred(),c=context({promoInput:'FIRST',cart:[{sku:'one',qty:1}]});
 c.storePricingLines=cart=>cart;c.storeRequest=(url,body)=>body.promo==='FIRST'?a.promise:b.promise;
 const apply=method('applyPromo',c),first=apply();c.state.promoInput='SECOND';const second=apply();
 b.resolve({quote:{total:90}});await second;a.reject(new Error('expired'));await first;
 assert.equal(c.state.promo,'SECOND');assert.equal(c.state.storeQuote.total,90);assert.equal(c.state.promoBad,false);
});
test('A quote for changed cart contents is rejected instead of displaying its obsolete total',async()=>{
 const a=deferred(),c=context({promoInput:'FIRST',cart:[{sku:'one',qty:1}]});
 c.storePricingLines=cart=>cart;c.storeRequest=()=>a.promise;const first=method('applyPromo',c)();
 c.state.cart=[{sku:'one',qty:2}];a.resolve({quote:{total:80}});await first;
 assert.equal(c.state.storeQuote,null);assert.match(c.state.checkoutError,/Кошик змінився/);
});
for(const fail of [false,true])test('Changing delivery during directory '+(fail?'failure':'success')+' clears loading without stale errors',async()=>{
 const a=deferred(),c=context({npEnabled:true,npCityRef:'city',delivery:'np',npLoading:false,npPoints:[]});
 c.storeRequest=()=>a.promise;const search=method('npSearch',c);search('warehouses','');
 await new Promise(r=>setTimeout(r,310));assert.equal(c.state.npLoading,true);c.state.delivery='courier';
 if(fail)a.reject(new Error('old directory'));else a.resolve({items:[{ref:'old-branch'}]});
 await new Promise(r=>setTimeout(r,0));assert.equal(c.state.npLoading,false);assert.equal(c.state.npError,'');assert.deepEqual(c.state.npPoints,[]);
});
test('Changing city before the directory debounce expires prevents the obsolete request',async()=>{
 const c=context({npEnabled:true,npCityRef:'city',delivery:'np',npLoading:false});let calls=0;
 c.storeRequest=async()=>{calls++;return {items:[]};};method('npSearch',c)('warehouses','');c.state.npCityRef='other';
 await new Promise(r=>setTimeout(r,310));assert.equal(calls,0);assert.equal(c.state.npLoading,false);
});
test('Home kit actions fit narrow screens in both themes',async()=>{
 const server=await startPreview(0),browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const theme of ['light','dark'])for(const width of [320,360,390]){
  const page=await browser.newPage({viewport:{width,height:900}});await page.addInitScript(t=>localStorage.setItem('rubizh.theme',t),theme);
  await page.goto('http://127.0.0.1:'+server.address().port+'/');const button=page.getByRole('button',{name:'Допомогти з вибором →',exact:true});
  const box=await button.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width,JSON.stringify({theme,width,box}));await page.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
