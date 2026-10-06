// Keep the supplied homepage artwork in sync with the selected theme, including SPA navigation.
(() => {
  const root = document.documentElement;
  const artwork = (layout, theme) => `/assets/hero-${layout}-${theme}.2026100608.webp`;
  const theme = () => root.dataset.theme === 'light' ? 'light' : 'dark';
  const preload = document.createElement('link');
  preload.rel = 'preload';
  preload.as = 'image';
  preload.href = artwork(matchMedia('(max-width:860px)').matches ? 'mobile' : 'desktop', theme());
  preload.setAttribute('fetchpriority', 'high');
  document.head.append(preload);

  function update(picture) {
    const source = picture.querySelector('source');
    const image = picture.querySelector('img');
    if (!source || !image) return;
    const current = theme();
    const mobile = artwork('mobile', current);
    const desktop = artwork('desktop', current);
    if (source.getAttribute('srcset') !== mobile) source.setAttribute('srcset', mobile);
    if (image.getAttribute('src') !== desktop) image.setAttribute('src', desktop);
  }
  const refresh = () => document.querySelectorAll('.rz-hero-picture').forEach(update);
  new MutationObserver(refresh).observe(root, {attributes:true, attributeFilter:['data-theme']});
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches('.rz-hero-picture')) update(node);
      node.querySelectorAll('.rz-hero-picture').forEach(update);
      const picture = node.closest('.rz-hero-picture');
      if (picture) update(picture);
    }
  }).observe(root, {childList:true, subtree:true});
  refresh();
})();
