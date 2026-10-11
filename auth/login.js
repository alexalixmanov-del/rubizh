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
// Q-6: when the server asks for the anti-automation check, solve it before sending the phone form.
// No third-party service; the server verifies the answer and the limits independently.
(() => {
  const meta = document.querySelector('meta[name="rubizh-sms-check"]');
  if (!meta || !window.crypto?.subtle) return;
  const [nonce, rawBits] = meta.content.split(':'); const bits = Number(rawBits) || 16;
  const zeros = bytes => { let z = 0; for (const b of bytes) { if (b === 0) { z += 8; continue; } z += Math.clz32(b) - 24; break; } return z; };
  for (const form of document.querySelectorAll('form')) {
    const button = form.querySelector('button[value="phone_request"]'); if (!button) continue;
    form.addEventListener('submit', async event => {
      if (form.dataset.checked === '1') return;
      event.preventDefault(); button.disabled = true; const label = button.textContent; button.textContent = 'Перевіряємо…';
      const encoder = new TextEncoder(); let n = 0;
      while (zeros(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(nonce + ':' + n)))) < bits) n++;
      for (const [name, value] of [['sms_check', String(n)], ['action', 'phone_request']]) { const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.append(input); }
      form.dataset.checked = '1'; button.textContent = label; form.submit();
    });
  }
})();
