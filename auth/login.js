"use strict";
// Only a presentation timer. The server independently enforces resend limits.
(() => {
  const button = document.querySelector('[data-resend-after]');
  if (!button) return;
  const label = button.querySelector('[data-resend-label]');
  const seconds = Math.max(0, Number(button.dataset.resendAfter) || 0);
  const deadline = Date.now() + seconds * 1000;
  const render = () => {
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    button.disabled = left > 0;
    label.textContent = left ? 'Надіслати ще раз · ' + left + ' с' : 'Надіслати ще раз';
    return left;
  };
  if (render()) {
    const timer = setInterval(() => { if (!render()) clearInterval(timer); }, 1000);
    window.addEventListener('pagehide', () => clearInterval(timer), {once: true});
    window.addEventListener('pageshow', e => { if (e.persisted) window.location.reload(); });
  }
})();
