// Stage 5.5 (owner D-72): anonymous speed metrics of the landing page. Sends only {t: template, m: metric, v: value, d: device},
// each metric once, when the page is hidden or left. Never the address, query, referrer or any visitor identifier.
(()=>{'use strict';
function rzVitalsTemplate(p){return p==='/'?'home':/^\/catalog\/?$/.test(p)?'catalog':/^\/catalog\/[^/]+(?:\/[^/]+)*\/?$/.test(p)?'category':/^\/product\/[^/]+\/?$/.test(p)?'product':/^\/kit\/?$/.test(p)?'kit':null}
const tpl=rzVitalsTemplate(location.pathname);
if(!tpl||typeof PerformanceObserver!=='function'||typeof navigator.sendBeacon!=='function')return;
const dev=matchMedia('(max-width:860px)').matches?'mobile':'desktop',vals={},sent={},observers=[];
const watch=(type,each,opts)=>{try{const o=new PerformanceObserver(list=>list.getEntries().forEach(each));o.observe({type,buffered:true,...opts});observers.push([o,each]);return true;}catch(e){return false;}};
// LCP: the last candidate the browser reports (it stops after the first input).
watch('largest-contentful-paint',e=>{vals.LCP=e.startTime;});
// CLS: largest session window (shifts < 1 s apart, window ≤ 5 s), shifts right after input excluded.
let win=0,first=0,last=0;
if(watch('layout-shift',e=>{if(e.hadRecentInput)return;if(win&&e.startTime-last<1000&&e.startTime-first<5000)win+=e.value;else{win=e.value;first=e.startTime;}last=e.startTime;if(win>(vals.CLS||0))vals.CLS=win;}))vals.CLS=vals.CLS||0;
// INP: the slowest interaction of the visit.
watch('event',e=>{if(e.interactionId&&e.duration>(vals.INP||0))vals.INP=e.duration;},{durationThreshold:16});
function send(){
 for(const [o,each] of observers)try{o.takeRecords().forEach(each);}catch(e){}
 for(const m of ['LCP','CLS','INP']){
  const raw=vals[m];if(sent[m]||typeof raw!=='number'||!isFinite(raw)||raw<0)continue;sent[m]=true;
  const val=m==='CLS'?Math.round(raw*10000)/10000:Math.round(raw);
  try{navigator.sendBeacon('/shop/analytics.php',new Blob([JSON.stringify({t:tpl,m:m,v:val,d:dev})],{type:'application/json'}));}catch(e){}
 }
}
addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')send();});
addEventListener('pagehide',send);
})();
