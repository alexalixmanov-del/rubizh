/* Small progressive enhancements; commerce remains in the original React app. */
(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href="#equipment"],a.rz-skip');
    if (!link) return;
    const target = link.classList.contains('rz-skip')
      ? document.querySelector('#main-content, [data-store-surface] > section')
      : document.getElementById('equipment');
    if (!target) return;
    event.preventDefault();
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
  });
})();
