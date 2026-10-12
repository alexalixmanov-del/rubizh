# RAW — SECURITY, агент SEC (ecc:security-reviewer), SITE 51c83d8

Статическое чтение, `npm audit --omit=dev --offline`, gitleaks по репозиторию, один тест (`sms-protection` «strangers cannot exhaust» — зелёный, подтверждает SEC-02). Каталог: `scratchpad/audit/tmp-sec/`.

## SEC-01 — HIGH, LIKELY — SSRF через заголовок Host в публичном `/api/health`
`api/index.php:~125`: при относительном `media_url` цель HEAD строится как `'https://'.($_SERVER['HTTP_HOST']??'rubizh.shop').$url`, `curl` без фильтра приватных адресов и с `FOLLOWLOCATION`. Без аутентификации; утечка HTTP-статуса и Content-Type цели. Достижимость зависит от vhost хостинга. Исправление: брать хост из `public_base_url`/`https://rubizh.shop`, убрать HTTP-проверку или использовать `rubizhDownloadTarget()`, без редиректов.

## SEC-02 — MEDIUM, CONFIRMED — SMS-вход раскрывает, зарегистрирован ли номер
`auth/phone.php:~95-101`: после 70 % дневного бюджета неизвестный номер получает отказ «SMS-вхід тимчасово недоступний», известный — проверку и затем код; текст одинаков, но поведение различается (оракул). Атакующий доводит бюджет до 70 % сам (~4 IP или одна IPv6 /64). Тест `sms-protection` закрепляет различие. Исправление: одинаковое поведение для всех выше порога, без видимого различия.

## SEC-03 — MEDIUM, LIKELY — дешёвый отказ во входе (email-ссылка, SMS)
`auth/index.php:99-106` (`$hour>=6 || $recent>0 || global>=100`, счётчик по `ip_hash OR email`), `auth/phone.php:~85-101`. 6 отправок в час блокируют ссылку жертве; 100 разных email в сутки исчерпывают глобальный бюджет для всех (менеджеры входят тем же путём); то же для SMS. Исправление: раздельные лимиты (email, IP, устройство, глобальный); глобальный порог → проверка, не отказ; не учитывать отклонённые попытки в чужих ключах; оповещение владельца на 80 %.

## SEC-04 — MEDIUM, LIKELY — неподтверждённый email гостевого заказа импортируется в аккаунт и получает письма
`auth/identities.php:140-147` (`customerOwnOrders` по `o.email = identity.subject`), `shop/order.php:11,44` (email только по формату), `shop/cart-reminder.php`. Любой может оформить заказ на чужой email → заказ появится в кабинете жертвы, письма и напоминания с содержимым атакующего (до 20 заказов/ч на IP). Исправление: импортировать по email только заказы, созданные в подтверждённой сессии, или флаг подтверждения email.

## SEC-05 — MEDIUM (HIGH, если REMOTE_ADDR — адрес прокси), LIKELY / SUSPECTED — лимиты по IP vs CGNAT мобильных операторов
Места: `shop/order.php:33` (`orders` 20/ч, счётчик увеличивается до проверки — `PRICE_CHANGED` и повторы тратят квоту), `auth/index.php:99-106` (6/ч), `auth/phone.php` (20/сутки на IP, всплеск 5/10 мин, проверка с 3), `shop/runtime.php:65` (`account` 180/60 с, `storefront` 180/60, `catalog` 300/60), прочие `shopLimit`. При десятках–сотнях абонентов за одним IPv4: 7-й человек за час не получает ссылку; ~10–20 клиентов SMS на IP в сутки; при рекламной кампании первыми срабатывают эти лимиты. Если за хостингом прокси и `REMOTE_ADDR` — его адрес, лимиты становятся глобальными (20 заказов/ч на весь магазин) — проверить до запуска.

Предложенная схема: ключи — подтверждённый телефон, сессия (`checkout_scope`), устройство (HttpOnly cookie `rz_dev`, 1 год), сеть (IPv4 точно, IPv6 /64). Заказы: считать только после успешной проверки, без повторов и `PRICE_CHANGED`; жёстко 5/ч и 15/сутки на телефон, 10/ч на сессию и устройство; IP — мягко 60/ч (проверка), жёстко 300/ч. SMS — лимиты на номер как сейчас, устройство 6/сутки мягко, IP проверка с 5/10 мин и отказ только с 150/сутки. Email — 3/ч на адрес, IP мягко 30/ч, глобальный порог → проверка. `rubizhPublicGate` `account` 600/мин + подкорзина на сессию 60/мин, 429 выше 3×. Всегда Retry-After и понятный текст с запасным каналом.

## SEC-06 — MEDIUM, LIKELY — слабости лимитов: IPv6, переполнение корзин, fail-closed 503
`shop/runtime.php:48-64`, `store-lib.php:62`. Ключ — полный `REMOTE_ADDR` (одна IPv6 /64 = 2^64 адресов); файловые корзины (4096 × 64): заполненная корзина отвечает 503 новым идентичностям — можно выбить вход владельца CRM (`staff-login-account` по email). Исправление: IPv6 → /64; вытеснение старейшей записи вместо отказа; не fail-closed для входа.

## SEC-07 — MEDIUM, LIKELY — блокировка входа сотрудника CRM посторонним
`staff/auth.php:25` (`rubizhRateAllow('staff-login-account',…,8,900)` до `password_verify`, учитывает и успешные). 8 попыток за 15 мин по email владельца блокируют вход. Исправление: учитывать только неудачные, ключ IP+аккаунт, проверка вместо блокировки.

## SEC-08 — LOW–MEDIUM, LIKELY/SUSPECTED — пробелы HTTPS-редиректа и HSTS
`api/.htaccess:2`, `feeds/.htaccess:2` без `RewriteOptions Inherit` (HTTPS-редирект и запрет dot-файлов не действуют в `/api/` — ключ PIM и `cron_key` могут идти по HTTP); HSTS только из PHP; `sitemap.php`, `feeds/feed.php`, `shop/analytics.php` без HSTS/Referrer-Policy/XFO; статические `/index.html`, `/offer.html` без CSP с nonce. Исправление: `RewriteOptions Inherit` или дублировать правило; HSTS и Referrer-Policy в `.htaccess`; `rubizhHeaders()` в sitemap/фидах/analytics; редирект `/index.html` → `/`.

## SEC-09 — MEDIUM, SUSPECTED — служебные и релизные файлы в дереве и не закрыты
`downloads/*.zip`, `downloads/Rubizh-private-integrations.enc` (OpenSSL `Salted__`, 320 байт), корневые `*.md` (кроме README), `PIM-V3-GAP-MATRIX.json`, `preview/`, `contracts/`, `api/config.sample.php`. В production-архив не входят (`dev/package-release.py`), наличие на хостинге неизвестно. Открытых секретов в архивах нет; `.enc` не расшифровывался. Исправление: закрыть `downloads|preview|contracts|sql` и `*.md|zip|enc` в `.htaccess`; удаление `downloads/` и `.enc` из репозитория и истории — решение владельца.

## SEC-10 — LOW, CONFIRMED — секреты в query string, неограниченный подбор ключей
`api/index.php:96-101` (`/api/cron/photos?key=`), `shop/mail-worker.php:4-6`; маршруты PIM без лимита. Исправление: ключ в заголовке или только CLI; лимит и задержка на неудачи.

## SEC-11 — LOW, CONFIRMED — изменение состояния по GET в `shop/cart-return.php:10-12`
GET с валидным кодом кладёт `cart_recovery` и `checkout_scope` без CSRF (можно подсунуть свою корзину). Исправление: страница подтверждения с POST + CSRF.

## SEC-12 — MEDIUM, SUSPECTED — время жизни сессии не задано; доступ гостя к заказу только через сессию
`auth/bootstrap.php:14-18`; нет `gc_maxlifetime`/`save_path`; по умолчанию ~24 мин — гость, ушедший в банк, может потерять доступ к странице заказа. Исправление: `session.gc_maxlifetime ≥ 86400`, приватный `save_path`, короткий подписанный токен возврата из банка.

## SEC-13 — LOW — CSP: `'unsafe-eval'`, `style-src 'unsafe-inline'`, `img-src https:` (`shop/runtime.php:38-42`) — остаточный риск при XSS (XSS не найден).

## SEC-14 — LOW / INFO
`shop/kits.php:7-12` — общие комплекты хранятся год и не удаляются; `donation_report_url` — любой https-хост; CI-actions закреплены по major-тегам; `auth/config.sample.php` содержит публичный Google client id (не утечка).

## Проверено, чисто
Сессии (регенерация ID при входе/выходе, Secure/HttpOnly/SameSite, strict mode; CRM — Strict, версия сессии, 8 ч / 30 мин); OTP (5 попыток, `FOR UPDATE`, HMAC, лимиты, одноразовость, тестовый outbox только `cli-server`); RBAC/IDOR (`shopMayReadOrder`, `customerOrder`, `npManagerId` + `shopRequirePermission`, `crmPermit`; `np-print`/`donation-proof`/просмотр консоли открыты всем ролям сотрудников — похоже, намеренно); CSRF (все изменяющие POST; единственный GET — SEC-11); XSS (SSR через `storefrontEsc`, JSON с `JSON_HEX_*`, JSON-LD, реквизиты через `rubizhSellerHtml`; клиент без `innerHTML`); настройки владельца (GA4 `/^G-[A-Z0-9]{5,20}$/D`, Pixel `/^\d{5,30}$/D` — проверка при сохранении и при каждом чтении; соцсети — то же; email `FILTER_VALIDATE_EMAIL`; IBAN `UA\d{27}`; управляющие символы отклоняются) — внедрение скрипта через настройки невозможно; open redirect нет; SSRF кроме SEC-01 нет (`api/http-download.php`: публичный IP, закрепление DNS, порты 80/443, ≤ 4 редиректа, 15 МиБ); загрузка скрина пожертвования (менеджер, 8 МиБ, двойная проверка MIME, хранение в БД, `nosniff`); заголовки на HTML/JSON/кабинете/консоли/CRM; `npm audit` — 0 уязвимостей; gitleaks (107 коммитов) — 3 срабатывания на синтетических значениях фикстур; CI без секретов, `contents: read`.

Требует проверки на хостинге: `REMOTE_ADDR` за прокси (SEC-05), IPv6, наличие `downloads/`/`*.md`/`preview/` (SEC-09), `gc_maxlifetime`/`save_path` (SEC-12), маршрутизация по Host (SEC-01).
