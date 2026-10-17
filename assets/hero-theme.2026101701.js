// Keep the supplied homepage artwork in sync with the selected theme, including SPA navigation.
(() => {
  const root = document.documentElement;
  const artwork = (layout, theme) => `/assets/hero-${layout}-${theme}.2026100608.webp`;
  const theme = () => root.dataset.theme === 'light' ? 'light' : 'dark';
  const phone = matchMedia('(max-width:860px)');
  // Reserve bandwidth for the current page on a cold mobile connection.
  if (location.pathname === '/') {
    const preload = document.createElement('link');
    preload.rel = 'preload';
    preload.as = 'image';
    preload.href = artwork(phone.matches ? 'mobile' : 'desktop', theme());
    preload.setAttribute('fetchpriority', 'high');
    document.head.append(preload);
  }

  function update(picture) {
    // The initial HTML still contains the homepage template on other routes.
    // Setting its image URL would download hidden artwork before hydration.
    if (location.pathname !== '/') return;
    const source = picture.querySelector('source');
    const image = picture.querySelector('img');
    if (!source || !image) return;
    const current = theme();
    const mobile = artwork('mobile', current);
    const desktop = artwork('desktop', current);
    // Stage 5.3 (PL-2): the fallback src follows the current layout too — WebKit loads an img's src even when a <source>
    // matches, so a phone downloaded the 136 KB desktop artwork next to the mobile one.
    const fallback = phone.matches ? mobile : desktop;
    if (source.getAttribute('srcset') !== mobile) source.setAttribute('srcset', mobile);
    if (image.getAttribute('src') !== fallback) image.setAttribute('src', fallback);
  }
  const refresh = () => document.querySelectorAll('.rz-hero-picture').forEach(update);
  new MutationObserver(refresh).observe(root, {attributes:true, attributeFilter:['data-theme']});
  phone.addEventListener?.('change', refresh);
  // Stage 5.3 (PL-2): the server sends the home hero as a static first screen; it gives way to the live page as soon as
  // the client renders its surface (the template copy inside <x-dc> does not count).
  const live = node => [...(node.matches('[data-store-surface]') ? [node] : []), ...node.querySelectorAll('[data-store-surface]')].some(surface => !surface.closest('x-dc'));
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (live(node)) document.querySelectorAll('[data-first-screen]').forEach(first => first.remove());
      if (node.matches('.rz-hero-picture')) update(node);
      node.querySelectorAll('.rz-hero-picture').forEach(update);
      const picture = node.closest('.rz-hero-picture');
      if (picture) update(picture);
    }
  }).observe(root, {childList:true, subtree:true});
  refresh();
})();
