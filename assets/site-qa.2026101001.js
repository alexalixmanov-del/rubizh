// Image states for the storefront: loading → skeleton, loaded → the picture without any overlay, error → fallback.
// The framework renders <img> late and from cache, so the state is taken from load/error events and from img.complete.
(function(){
 'use strict';
 const mark=img=>{if(img.complete&&img.currentSrc){if(img.naturalWidth>0){img.dataset.loaded='1';delete img.dataset.error;}else{img.dataset.error='1';delete img.dataset.loaded;}}};
 document.addEventListener('load',e=>{if(e.target&&e.target.tagName==='IMG'){e.target.dataset.loaded='1';delete e.target.dataset.error;}},true);
 document.addEventListener('error',e=>{if(e.target&&e.target.tagName==='IMG'){e.target.dataset.error='1';delete e.target.dataset.loaded;}},true);
 const scan=()=>document.querySelectorAll('img:not([data-loaded]):not([data-error])').forEach(mark);
 new MutationObserver(()=>requestAnimationFrame(scan)).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src','srcset']});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();
})();
