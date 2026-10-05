<?php if (!defined('RUBIZH_AUTH')) { http_response_code(404); exit; } ?>
<div class="auth-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="6" y="2" width="12" height="20" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="M10 18h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>
<?php if ($mergeView): ?>
<p class="auth-step">ОДИН КАБІНЕТ</p><h2 id="auth-title">Об’єднати кабінети?</h2><p class="auth-description">Ви підтвердили обидва способи входу. <?=($proof['kind'] ?? '')==='email_link' ? 'За цим email уже є кабінет.' : 'За цим телефоном уже є кабінет.'?> Об’єднаємо замовлення та прив’язані способи входу в ньому.</p>
<div class="auth-email"><?=esc(($proof['kind'] ?? '')==='email_link' ? $proof['email'] : $proof['phone'])?></div><p class="auth-footnote">Заповнені дані кабінету з цим телефоном залишаться основними. Порожні поля доповнимо з другого профілю.</p>
<?php if ($message !== ''): ?><div class="auth-alert" role="alert"><?=esc($message)?></div><?php endif; ?>
<form method="post" action="/auth/?phone=1"><input type="hidden" name="csrf" value="<?=esc($_SESSION['csrf'])?>"><button class="auth-submit" name="action" value="approve_merge">Об’єднати й увійти →</button></form>
<?php elseif ($challenge): ?>
<p class="auth-step">ПІДТВЕРДЖЕННЯ НОМЕРА</p><h2 id="auth-title">Введіть код із SMS</h2><p class="auth-description">Надіслали шестизначний код на</p><div class="auth-email"><?=esc($challenge['phone'])?></div>
<?php if ($message !== ''): ?><div class="auth-alert" role="alert"><?=esc($message)?></div><?php endif; ?>
<form method="post" action="/auth/?phone=1" class="auth-form"><input type="hidden" name="csrf" value="<?=esc($_SESSION['csrf'])?>"><label for="sms-code">Код підтвердження</label><input id="sms-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" minlength="6" placeholder="000000" required class="sms-code"><button class="auth-submit" name="action" value="phone_verify">Підтвердити й увійти →</button></form>
<p class="auth-footnote">Код діє 5 хвилин. Не повідомляйте його іншим.</p>
<form method="post" action="/auth/?phone=1" class="sms-resend"><input type="hidden" name="csrf" value="<?=esc($_SESSION['csrf'])?>"><input type="hidden" name="phone" value="<?=esc($challenge['phone'])?>"><button class="auth-submit secondary" name="action" value="phone_request" data-resend-after="<?=(int)$resendAfter?>"><span data-resend-label>Надіслати ще раз</span><span aria-hidden="true">↻</span></button></form>
<a class="auth-text-link" href="/auth/?phone=1&amp;change_phone=1">Змінити номер</a>
<?php else: ?>
<p class="auth-step"><?=($identityFlow['kind'] ?? '')==='google' ? 'GOOGLE ПІДТВЕРДЖЕНО' : 'ВХІД ЗА НОМЕРОМ'?></p><h2 id="auth-title"><?=in_array($identityFlow['kind'] ?? '',['google','email'],true) ? 'Підтвердьте телефон' : 'Ваш номер телефону'?></h2>
<p class="auth-description"><?=($identityFlow['kind'] ?? '')==='google' ? 'Підтвердьте номер один раз. Google і телефон відкриватимуть один кабінет із вашими замовленнями.' : 'Надішлемо SMS з одноразовим кодом для входу. Якщо за номером уже є кабінет — відкриємо його.'?></p>
<?php if ($message !== ''): ?><div class="auth-alert" role="alert"><?=esc($message)?></div><?php endif; ?>
<form method="post" action="/auth/?phone=1" class="auth-form"><input type="hidden" name="csrf" value="<?=esc($_SESSION['csrf'])?>"><label for="auth-phone">Номер телефону</label><input id="auth-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" placeholder="+380 XX XXX XX XX" value="<?=esc($phoneValue)?>" required><button class="auth-submit" name="action" value="phone_request">Отримати код →</button></form>
<?php endif; ?>
<form method="post" action="/auth/" class="auth-cancel"><input type="hidden" name="csrf" value="<?=esc($_SESSION['csrf'])?>"><button name="action" value="cancel_phone">Скасувати й повернутися</button></form>
