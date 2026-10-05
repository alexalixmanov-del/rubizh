<?php if (!defined('RUBIZH_AUTH')) { http_response_code(404); exit; } ?>
<section class="auth-shell" aria-labelledby="auth-title">
<div class="auth-intro"><h1>Стоїмо за своє.<br><span>Стоїмо за <em>Україну.</em></span></h1></div>
<div class="auth-card">
<?php if ($phoneView): ?>
<?php require __DIR__.'/phone-view.php'; ?>
<?php elseif ($pending): ?>
<div class="auth-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" stroke="currentColor" stroke-width="1.5"/><path d="m8 12 3 3 5-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
<p class="auth-step">ПІДТВЕРДЖЕННЯ ВХОДУ</p><h2 id="auth-title">Це ви?</h2><p class="auth-description">Посилання готове. Підтвердьте вхід до свого кабінету.</p><div class="auth-email"><?=esc((string)$target)?></div>
<form method="post" action="/auth/"><input type="hidden" name="csrf" value="<?=esc($_SESSION['csrf'])?>"><input type="hidden" name="token" value="<?=esc($token)?>"><button class="auth-submit" name="action" value="consume">Увійти до кабінету <span aria-hidden="true">→</span></button></form><a class="auth-text-link" href="/auth/">Увійти з іншою адресою</a>
<?php elseif ($linkSent): ?>
<div class="auth-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="auth-icon-check">✓</span></div>
<p class="auth-step">ПОСИЛАННЯ НАДІСЛАНО</p><h2 id="auth-title">Перевірте пошту</h2><p class="auth-description">Надіслали посилання для входу на</p><div class="auth-email"><?=esc(strtolower(trim($emailValue)))?></div>
<ol class="auth-steps"><li><span>1</span><div>Відкрийте лист від РУБІЖ<small>Якщо листа немає у вхідних, перевірте «Спам».</small></div></li><li><span>2</span><div>Натисніть посилання в листі<small>Воно діє 45 хвилин і працює один раз.</small></div></li></ol>
<?php if ($message !== ''): ?><div class="auth-alert" role="alert"><?=esc($message)?></div><?php endif; ?>
<form method="post" action="/auth/?sent=1"><input type="hidden" name="csrf" value="<?=esc($_SESSION['csrf'])?>"><input type="hidden" name="email" value="<?=esc(strtolower(trim($emailValue)))?>"><button class="auth-submit secondary" name="action" value="request" data-resend-after="<?=(int)$resendAfter?>"><span data-resend-label>Надіслати ще раз</span><span aria-hidden="true">↻</span></button></form>
<a class="auth-text-link" href="/auth/?change=1">Змінити email</a><p class="auth-footnote">Не отримали лист? Перевірте папку «Спам» або надішліть посилання повторно через хвилину.</p>
<?php else: ?>
<div class="auth-heading"><div class="auth-icon auth-entry-icon" aria-hidden="true"><?php if ($smsReady && (($_GET['email'] ?? '')!=='1')): ?><svg viewBox="0 0 24 24" fill="none"><path d="m7 3 3 4-2 3c1.2 2.6 3.4 4.8 6 6l3-2 4 3-2 4C10 22 2 14 3 5l4-2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><?php else: ?><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><?php endif; ?></div>
<h2 id="auth-title">Раді бачити вас</h2></div><?php if ($smsReady && (($_GET['email'] ?? '')!=='1')): ?>
<p class="auth-description">Увійдіть, щоб керувати своїми замовленнями.</p>
<?php if ($message !== ''): ?><div class="auth-alert" role="alert"><?=esc($message)?></div><?php endif; ?>
<form method="post" action="/auth/?phone=1" class="auth-form"><input type="hidden" name="csrf" value="<?=esc($_SESSION['csrf'])?>"><label for="entry-phone">Номер телефону</label><input id="entry-phone" name="phone" type="tel" inputmode="tel" maxlength="30" autocomplete="tel" placeholder="+380 XX XXX XX XX" required><button class="auth-submit" name="action" value="phone_request">Отримати код →</button></form>
<p class="auth-sms-hint">Надішлемо SMS із кодом входу</p>
<?php if ($googleReady): ?><div class="auth-divider">або</div><?php require __DIR__.'/google-button.php'; ?><?php endif; ?>
<a class="auth-text-link" href="/auth/?email=1">Увійти через email</a>
<?php if ($googleReady): ?><p class="auth-link-note"><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m9 15 6-6M8 17l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 7l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0) scale(.92)" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span><span>Перший вхід через Google? Підтвердьте телефон, щоб об’єднати замовлення.</span></p><?php endif; ?>
<?php else: ?><p class="auth-description">Вкажіть email. Надішлемо лист з одноразовим посиланням для входу.</p>
<?php if ($message !== ''): ?><div class="auth-alert" role="alert"><?=esc($message)?></div><?php endif; ?>
<form method="post" action="/auth/" class="auth-form"><input type="hidden" name="csrf" value="<?=esc($_SESSION['csrf'])?>"><label for="email">Ваш email</label><input id="email" name="email" type="email" maxlength="254" required autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="name@example.com" value="<?=esc($emailValue)?>"><button class="auth-submit" name="action" value="request">Отримати посилання <span aria-hidden="true">→</span></button></form>
<p class="auth-footnote"><?=$smsReady ? 'Для нового кабінету після email також підтвердьте телефон. Він об’єднає всі способи входу.' : 'Перший вхід? Кабінет створиться автоматично після підтвердження email.'?></p>
<?php if ($smsReady): ?><a class="auth-text-link" href="/auth/">Увійти за телефоном</a><?php endif; ?>
<?php if ($googleReady): ?><div class="auth-divider">або</div><?php require __DIR__.'/google-button.php'; ?><?php endif; ?>
<?php endif; ?>
<?php endif; ?>
<div class="auth-trust"><span aria-hidden="true">◈</span> Без пароля · Безпечний вхід</div>
</div>
</section>
<footer class="auth-footer"><span>Потрібна допомога?</span><a href="tel:+380976867892">+380 97 686 78 92 ↗</a><a href="/privacy.html">Конфіденційність</a></footer>
