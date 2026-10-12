# RAW — PHP BACKEND, агент PHP (ecc:php-reviewer), SITE 51c83d8

Изолированный fixture (ограничители `rubizhRateAllow`/`shopLimit` в копии отключены для фаззинга). Каталог: `scratchpad/audit/tmp-php/`.

**HTTP 500 не найдено.** Запрошены все PHP-точки входа `/`, `api/`, `auth/`, `shop/`, `feeds/`, `sitemap.xml`, все `/api/*` и `/api/staff/*` — методы GET/POST/PUT/DELETE/OPTIONS/HEAD; пустое тело, битый JSON, `[]`, `null`, строка; формы с `a[]=`; массивы в параметрах; неверные типы полей; аноним, покупатель с CSRF, сотрудники OWNER и READ_ONLY. ~80 точек × 17 вариантов без сессии + ~4000 запросов с сессиями: статусы 200/303/400/401/403/404/405/409, в логе нет warning/notice/fatal. 503 только законные (`/health.php` до heartbeat кеша, `/api/health` без публикации PIM). Класс ошибки «неопределённая функция на GET» не воспроизведён. Не тестировались: `mail-worker.php` и `/api/cron/photos` с верным ключом; реальные Google/SMS/НП; webhook MonoPay — только неподписанный/битый.

## PHP-01 — MEDIUM, CONFIRMED — CRM API отдаёт внутренние сообщения PHP и пути сервера, с неверным статусом
`api/staff/index.php:36` (единый catch: любой не-CRM `Throwable` → 409 `DOMAIN_CONFLICT` с `$e->getMessage()`); источники — `staff/reports.php:31` (`crmLike`), `staff/read.php` (`crmPeriod`, `preg_match` по `from`). `GET /api/staff/payments?q[]=a` (также `/shipments`, `/returns`) → 409 «crmLike(): Argument #1 ($q) must be of type string, array given, called in /…/www/staff/reports.php on line 31»; `GET /api/staff/orders?period=custom&from[]=1` → 409 с сообщением `preg_match()`. Только для аутентифицированных сотрудников (в т.ч. READ_ONLY). Тест: `tmp-php/fuzz2.test.mjs`, вывод `out3.txt`. Исправление: сообщение только для `CrmError`/`ShopOrderConflict`; прочие — лог класса + request_id, общий текст, 500; `TypeError`/`ValueError` → 400 `INVALID_INPUT`; отклонять массивы в `q`, `from`, `to`, `manager`, `supplier`, `state`, `customer`.

## PHP-02 — LOW, LIKELY — sitemap отдаёт обрезанный XML при ошибке посреди потока
`sitemap.php:4-10`: XML выводится по мере построения; ошибка БД после первых `<url>` → 503 слишком поздно, клиент получает обрезанный документ с `Cache-Control: public, max-age=3600`. Исправление: буферизовать, заголовки и тело только при успехе; `no-store` на ошибке.

## PHP-03 — LOW, CONFIRMED — sitemap пишет в лог `$e->getMessage()` (PDO-сообщение может содержать SQL)
`sitemap.php:10`; остальные 28 вызовов `error_log` пишут только класс/код/текст/id. Исправление: класс и код.

## Проверено, чисто
SQL-инъекции (все подстановки — серверные или из белых списков: `api/index.php:145-163`, `api/lib.php:346,363,409`, `auth/account.php:88-91`, `staff/read.php:31`, `staff/reports.php:23`, `staff/index.php:24`, миграции; тест `sort=total;DROP TABLE` уже есть); строгие сравнения (`in_array` со strict, секреты через `hash_equals`); утечки ошибок (публичные JSON — общие/4xx, `display_errors=0`, нет `var_dump`/`print_r`/`phpinfo`/трассировок); коды статуса (кроме PHP-01); персональные данные и секреты в логах (только класс/код/фиксированный текст; `auth/mailer.php:39` пишет `curl_error()` без учётных данных).

Ограничения: `.htaccess` не проверялся (встроенный PHP-сервер); настройки production Apache/`error_log`/`display_errors` вне подключённых файлов не проверялись; PIM-эндпоинты только без ключа (401).
