# RAW — QA / TESTS, агент QA (ecc:pr-test-analyzer), SITE 51c83d8

Запускались только три файла с macOS-сбоями. Вывод: `scratchpad/audit/tmp-qa/`.

## 1. Четыре теста, падающие на macOS (CONFIRMED запуском)
- **QA-01 / QA-02** (`deploy.test.mjs:9`, `:24`) — `dev/deploy-update.sh:39` использует `realpath -m` (в BSD нет `-m`); также `find -printf` (`:18`), `sha256sum` (`:9`). Решение: сделать скрипт переносимым (нормализация пути без `-m`, `find . -type f | sed`) либо явный skip не на Linux с причиной. LOW.
- **QA-03** (`automation.test.mjs:84`) — `shop/automation-worker.sh:9` `command -v flock || exit 2`; на macOS нет `flock`; тест не проверяет код выхода и падает с вводящим в заблуждение `ENOENT …/runs`. Решение: skip при отсутствии `flock` с причиной + проверять код выхода. LOW.
- **QA-04** (`crm-migration.test.mjs:3`) — `tests/helpers/mysql-snapshot.php:5` требует путь `/tmp/` (на macOS `mkdtemp` даёт `/var/folders/…`), молча `exit(1)`; затем `git show d5e93f9` требует полную историю. Решение: принимать `sys_get_temp_dir()`/realpath или создавать файл в `/tmp`; печатать причину; предусловие `git cat-file -e d5e93f9^{commit}` со skip. LOW.
- **QA-05 MEDIUM, LIKELY** — CI использует PHP 8.3, локальный shim — 8.2, тесты — `php8.4`; production — PHP 8.2; ни один CI-прогон не проверяет 8.2 (кроме `php -l` при деплое). Исправление: матрица CI с `php-version: '8.2'` (хотя бы `php -l` всех файлов и один набор с БД).

## 2. Покрытие критичных путей
Покрыто: webhook (подпись, сумма, валюта, чужой счёт, дубли, истечение, парковка + сверка, ранний), идемпотентность, расчёт и смена цены, полы цен и kit/опт, возвраты (лимит, параллельность), резервы (последняя единица, TTL, отмена, поздняя оплата), IDOR A↔B, RBAC, step-up, CSRF CRM, лимиты SMS, контракт PIM v3.
- **QA-06 MEDIUM, LIKELY** — CSRF/Origin публичных эндпоинтов магазина (`shop/store-lib.php:58-60`) не тестируется: удаление строки 59/60 оставит набор зелёным. Исправление: параметризованный тест (без токена, неверный токен, верный токен + чужой Origin → 403, без новых строк) для `order.php`, `payment-start.php`, `checkout-quote.php`, `cart-reminder.php` и др.
- **QA-07 MEDIUM, CONFIRMED (отсутствие)** — срок оплаты в рабочих днях (`shop/order-lifecycle.php:4-8` `shopWorkdayDeadline`: Europe/Kyiv, выходные, `bank_holidays`, переходы DST 2026-03-29 / 2026-10-25) без прямого теста; `p0-integration.test.mjs:75` обходит расчёт прямой записью SQL. Исправление: табличный PHP-тест (пятница 23:30 → понедельник, через DST, праздник в понедельник, полночь UTC = следующий день в Киеве).
- **QA-08 MEDIUM, LIKELY** — фоновые воркеры без собственных тестов (`mono-worker.php` CLI, `notification-worker.php`, `np-worker.php`, `photo-worker.php` — только через фейковый php); `supplier-notifications.php` (`supplierSendPending:36`, `supplierAcknowledge:48`, `supplierLate:51`) не тестируется вовсе.
- **QA-09 LOW/MEDIUM, LIKELY** — НП: `shop/np-print.php`, `np-check.php` без тестов; `npCancelDraft` (`np-fulfillment.php:190`), `npReconcile:174`, `npRefresh:198` без поведенческих тестов.
- **QA-10 LOW/MEDIUM, SUSPECTED** — дрейф контракта PIM не обнаруживается в CI (замороженная фикстура, PIM не проверяется). Владелец — PIM: тест на побайтное равенство экспорта фикстуре.

## 3. Слабые проверки
- **QA-11 MEDIUM, CONFIRMED** — `automation.test.mjs:84-89` проверяет фейковый интерпретатор; «нет перекрытия» опирается на sleep 0.2 с.
- **QA-12 MEDIUM, LIKELY** — отрицательные проверки после фиксированного sleep: `order-idempotency.test.mjs:36` (300 мс), `:42`, `:47` (1500 мс), `cart-reminder-ui.test.mjs:27` (700 мс). Исправление: ждать сигнал/стабильный счётчик.
- **QA-13 LOW** — `pricing-policy.test.mjs`: проверки в PHP `check()`; диагностика слабая.
- **QA-14 LOW** — проверки по тексту исходников (`site-qa`, `release-hardening`, `runtime-security`, `pim-v3-foundation`).
- **QA-15 LOW** — тихие skip без `RUBIZH_TEST_MYSQL_SOCKET`; в CI проверять `skipped 0`.

## 4. Нестабильность
- **QA-16 MEDIUM, CONFIRMED** — пороги времени в `crm-performance.test.mjs` (`<1500`, `<2000` мс) — оставить счётчик запросов и EXPLAIN, время ослабить.
- **QA-17 LOW** — гонка свободного порта `tests/helpers/site-fixture.mjs:17`.
- **QA-18 LOW** — ~40 фиксированных `waitForTimeout` в браузерных тестах.
- **QA-19 LOW, SUSPECTED** — арифметика с реальными часами.

## 5. CI
Один job `npm test`, без матрицы; закреплён SHA фронтенда CRM, `fetch-depth: 0`, `php -l` всех файлов, выгрузка доказательств.
