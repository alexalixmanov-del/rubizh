# 00 — SYSTEM MAP (глобальный этап 2)

Объект: SITE `51c83d808228a26328081b02211b4e3605353755` (тег `rubizh-stage-1-verified`, проверенный код `f50dc50`), PIM `21198461f8ebb2eadef6dcd6fb77a50a8a038ea9`, CRM-фронтенд `crm.rubizh` `b0e2f9359a05ec835a83d64bb9bcdc2c97487a50` (CRM-бэкенд — `staff/`, `api/staff/` внутри SITE). Карта построена по коду снимков, не по документам; пути относительно корня SITE, `PIM/` — корень PIM. «UNCLEAR» — то, что по коду не определяется (обычно конфигурация хостинга).

## 1. Правила веб-сервера (все `.htaccess`)

| Файл | Правило | Эффект |
|---|---|---|
| `.htaccess:2-3` | `DirectoryIndex storefront.php …`, `Options -Indexes` | `/` → `storefront.php` |
| `.htaccess:5` | `(^|/)\.(?!well-known)` → 403 | `.git`, `.github`, `.env`, `tests/.staging` |
| `.htaccess:6` | `rubizh-private-backups|rubizh-private|rubizh-runtime|rubizh-automation|node_modules` → 403 | |
| `.htaccess:7` | `media/*.php*`, `.phtml`, `.phar` → 403 | |
| `.htaccess:8-10` | `*.bak/.backup/.old/.orig/.swp/.sql/.log/.ini/.env`, `*~` → 403 | в т.ч. `sql/indexes.sql` |
| `.htaccess:12` | `^(dev|tests|docs)(/|$)` → 403 | |
| `.htaccess:13-15` | `package*.json`, `README.md`, `.env*` → 403 | из `*.md` — только README |
| `.htaccess:16-20` | www → apex, HTTP → HTTPS (301) | |
| `.htaccess:21-27` | legacy 301; `product|catalog|kit|categories|porady`, `offer|privacy` → `storefront.php`; `sitemap.xml` → `sitemap.php` | |
| `api/.htaccess:2-10` | `RewriteEngine On`; не-файл → `index.php`; deny `config|lib|database|perf|http-download|photo-storage|schema|np-private|mono-private|seller|photo-status.php`, `*.sql`, `*.log`; проброс `Authorization` | |
| `api/.htaccess:12-14` | deny `site-settings.json/lock`, `settings-*` | |
| `auth/.htaccess:3-5` | deny `config*.php`, `mailer.php` | |
| `shop/.htaccess:1-3` | deny 22 библиотек/воркеров + `*.json/.log/.sql/.sh` | |
| `feeds/.htaccess:2-7` | `RewriteEngine On`; `google.xml` → `google.php`, `meta.csv` → `meta.php`; deny `feed.php` | |
| `staff/.htaccess:1`, `cache/.htaccess:1-2` | `Require all denied` | |

Проверено координатором: в `api/.htaccess:2` и `feeds/.htaccess:2` `RewriteEngine On` без `RewriteOptions Inherit` — корневые rewrite-правила `.htaccess:5-20` (запрет dot-файлов, HTTPS/www) в этих каталогах по стандартной семантике mod_rewrite не применяются (FilesMatch-запреты наследуются) — поведение хостинга UNCLEAR. `api/np-private.php` без собственной защиты (только deny `api/.htaccess:6`; ср. `api/mono-private.php:3`). `api/config.sample.php` не закрыт (возвращает массив, ничего не печатает). Не закрыты `downloads/`, `preview/`, `contracts/`, корневые `*.md` кроме README, `PIM-V3-GAP-MATRIX.json`; в production-архив не входят (`dev/package-release.py:7-9`), наличие на хостинге — UNCLEAR.

## 2. HTTP-точки входа

Общие механизмы: `shopCsrf` (`shop/store-lib.php:58-61`: `hash_equals($_SESSION['csrf'], csrf)`; Origin, если есть, — из `shopAllowedOrigins()` `:51-57`; без Origin — только токен). `shopLimit($db,kind,max,window=3600)` (`store-lib.php:62-67`, окно по `REMOTE_ADDR`, 429). `rubizhPublicGate` (`shop/runtime.php:65-68`, файловый лимит по IP). `rubizhHttpWork`/`rubizhWorkAcquire` (`runtime.php:69-84`, пулы, 503). `auth/bootstrap.php`: лимит `account` 180/60 с, пул `account` 12 (`bank-callback` 4), cookie `rubizh_customer` Secure/HttpOnly/SameSite=Lax (`:14-18`), вход истекает через 24 ч (`:37`). Менеджер = `npManagerId()` (`shop/np-fulfillment.php:22-25`) → `shopStaffRole` (`shop/financial-permissions.php:15-28`). `shopRequirePermission` (`financial-permissions.php:30-41`): OWNER для ручной сверки и переопределений; повторный вход ≤ 15 мин для возврата, сверки, переопределений.

### 2a. Корень и фиды

| URL | Метод | Доступ | CSRF | Лимит | Назначение |
|---|---|---|---|---|---|
| `/`, `/product/*`, `/catalog*`, `/kit*`, `/categories*`, `/porady*`, `/offer`, `/privacy` → `storefront.php` | любой | публично (сессия — только тема, `shop/theme-bootstrap.php:3-9`) | — (чтение) | `storefront` 180/60 + `public-read` 16 (`storefront.php:22`) | оболочка с CSP nonce (`:4`), 301 таксономии (`:24`), 404 товара (`:27-29`) |
| `/sitemap.xml` → `sitemap.php` | любой | публично | — | **нет** | XML sitemap (`sitemap.php:4-6`) |
| `/health.php` | любой | публично | — | `health` 120/60 + пул 2 (`:13-14`) | готовность (`:15-21`) |
| `/feeds/google.xml`, `/feeds/meta.csv` | любой | публично | — | **нет** | фиды Google/Meta (`feeds/feed.php:16-20`) |

### 2b. `/api/*` → `api/index.php`

Не-PIM маршруты: `rubizhPublicGate('catalog')` 300/60 + пул `public-read` 16 (`api/index.php:18`), `Access-Control-Allow-Origin: *` (`api/lib.php:139`). PIM-маршруты — свой CORS (`api/lib.php:130-142`), без лимита.

| Путь | Метод | Доступ | Строка | Назначение |
|---|---|---|---|---|
| `/api/staff/**` | → CRM (2c) | | `:7` | |
| `/api/pim/categories` | GET | PIM bearer (`require_pim`, `hash_equals`, ключ ≥ 24, `api/lib.php:143-149`) | `:25` | таксономия |
| `/api/pim/cache-clear` | **любой** | PIM bearer | `:26` | сброс кеша |
| `/api/pim/sync` | POST | PIM bearer | `:27-72` | синхронизация v3/legacy; 16 МБ; `GET_LOCK`; транзакция |
| `/api/pim/photos` | POST | PIM bearer | `:74-78` | обработка фото (≤ 80) |
| `/api/pim/status` | **любой** | PIM bearer | `:80-91` | статус и `capabilities` |
| `/api/cron/photos?key=` | **любой** | `cron_key` (≥ 16) **в query string**, `hash_equals` | `:96-101` | фото по HTTP; в репозитории не планируется |
| `/api/storefront`, `/api/health`, `/api/categories`, `/api/catalog`, `/api/product/{slug}` | GET (`:104`) | публично | `:108-195` | данные витрины; `/api/health` делает HEAD к своим media URL |

### 2c. CRM API `/api/staff/*` (`api/staff/index.php`, логика `staff/*.php`, каталог закрыт)

HTTPS (loopback только на staging, `staff/bootstrap.php:13`); cookie `rubizh_staff`, path `/api/staff`, SameSite=Strict (`:14`); 503 без `crm_schema`=1 (`:15`). Лимиты: `staff-request` 240/60 (`index.php:8`), вход `staff-login-ip` 20/900 с и `staff-login-account` 8/900 с (`staff/auth.php:25`). `crmActor` (`auth.php:10-15`): 8 ч абсолютно, 30 мин простоя, версия сессии. `crmPermit` (`:16`). CSRF `crmCsrf` (`:21-22`): `staff_csrf` + Origin = Host; на всех не-GET после аутентификации (`index.php:12`) и на входе (`auth.php:24`).

| Маршрут | Метод | Право | Строка |
|---|---|---|---|
| `/auth/session`, `/auth/login`, `/auth/logout`, `/me` | GET, POST, POST, GET | —, CSRF + лимит + password_verify, сессия + CSRF, сессия | `:10-15` |
| `/dashboard`, `/orders`, `/orders/{id}` | GET | `order.view` | `:16-19` |
| `/orders/{id}/assign|note|shipments|confirm|cancel|resolve-item|invoice|manual-reconcile` | POST | `order.assign.*`, `note.create`, `shipment.manage`, карта прав `staff/operations.php:8-20,43` | `:18-20` |
| `/customers[/{id}]`, `/customers/{id}/note` | GET, POST | `customer.view`, `note.create` | `:21-22` |
| `/payments|shipments|returns[/{id}]` | GET | `payment.view`/`shipment.view`/`return.view` | `:23-25` |
| `/payments/{id}/refund` | POST | `payment.refund.execute` (OWNER) + версия + ключ идемпотентности | `:26`, `staff/refunds.php:9` |
| `/shipments/{id}/create|refresh|reconcile|cancel` | POST | `shipment.manage` | `:27` |
| `/returns/{id}/transition`, `/returns` | POST | `return.transition`, `return.create` | `:27-28` |
| `/audit`, `/reports`, `/search`, `/settings` | GET | `audit.view`/`financial.audit.view`, `report.view`, `search`, `settings.view` | `:29-32` |
| `/settings/senders/{code}`, `/settings/staff[/{id}]` | PUT, POST/PUT | `settings.manage`, `staff.manage` | `:33-34` |

### 2d. `/auth/*` (все через `auth/bootstrap.php`)

Библиотеки `auth/*` (account-icons, account-view, account, config.sample, donation-view, email-templates, google-button, google-client, header, http, identities, login-view, mailer, order-cards, order-detail, phone-view, phone) начинаются с `if(!defined('RUBIZH_AUTH')) 404`.

| URL | Метод | Доступ | CSRF | Лимиты | Назначение |
|---|---|---|---|---|---|
| `/auth/` (`auth/index.php`) | GET, POST | публично / сессия покупателя | свой `hash_equals($_SESSION['csrf'])` на каждом POST (`:30-33`), **без проверки Origin** | email-ссылка: 6/ч на IP-или-email, 1/мин на email, 100/сутки (`:99-106`); SMS: 1/мин, 5/ч, 10/сутки на номер, 20/сутки на IP, 15 неверных кодов, глобальный дневной лимит (`auth/phone.php:68-97`), 5 попыток на код (`:121`) | вход и кабинет: `logout` `:35`, `cancel_phone` `:39`, `phone_request` `:43`, `phone_verify` `:53`, `approve_merge` `:65`, `remove_favorite` `:74`, `save_profile/save_delivery` `:79`, `request/link_email` `:87`, `consume` `:121` |
| `/auth/google.php` | POST (старт), GET (callback) | публично / сессия | POST: `hash_equals` + Host `rubizh.shop` (`:8-10`); GET: OAuth `state` + 10 мин + тот же actor (`:25-28`) | account | Google OIDC (`:5-48`) |
| `/auth/session.php` | GET (`:5`) | публично | — | account | состояние сессии |

### 2e. `/shop/*`

| URL | Метод | Доступ | CSRF | Лимит | Назначение |
|---|---|---|---|---|---|
| `shop/catalog.php` | GET (`:7`) | публично | — | `catalog` 300/60 + пул (`:6`) | каталог (`:10-25`) |
| `shop/analytics.php` | любой | публично | — | **нет** | публичные настройки + GA4/Meta (`:3`) |
| `shop/customer.php` | GET, POST | GET публично (выдаёт `csrf`); POST — покупатель (`:7`) | shopCsrf `:7` | `favorites` 300/ч | избранное; создаёт `checkout_scope` (`:22`) |
| `shop/checkout-quote.php` | POST (`:5`) | публично | shopCsrf `:6` | `price-quotes` 120/60 | расчёт цены в откатываемой транзакции |
| `shop/order.php` | POST (`:5`) | публично + `checkout_scope` (`:9`) | shopCsrf `:6` | пул `checkout` 8; `orders` 20/ч (`:33`); `GET_LOCK` request_id (`:28`) | создание заказа (идемпотентный `request_id`) |
| `shop/order-status.php` | GET | `shopMayReadOrder` (`store-lib.php:134-138`) | — | 120/60 | квитанция |
| `shop/repeat-order.php` | GET | `shopMayReadOrder` | — | account | повтор заказа |
| `shop/payment-start.php` | POST | `shopMayReadOrder` | shopCsrf | `payment-start` 12/60 | `monoCreate` |
| `shop/payment-return.php` | GET, POST | `shopMayReadOrder` (`:9`) | shopCsrf `:11` | `payment` 12/60 | возврат с оплаты; `retry|invoice|cancel` |
| `shop/mono-webhook.php` | POST | подпись банка `X-Sign` ECDSA (кеш-ключ, затем обновлённый, `mono-lib.php:38-41`); без сессии | — (подпись) | `mono-webhook` 180/60; пул `bank-callback` 4 | `monoApplyEvent`, парковка + pull-сверка |
| `shop/cart-reminder.php` | POST | `checkout_scope` | shopCsrf | `cart-reminder` 30/ч (`save`) | напоминание о корзине |
| `shop/cart-return.php` | GET, POST | владение `code` | POST shopCsrf; **GET без CSRF** (кладёт `cart_recovery` в сессию и редиректит, `:10`) | account | возврат корзины / отписка |
| `shop/kits.php` | GET, POST | публично | POST shopCsrf | `kits` 60/ч | поделиться комплектом / прочитать по коду |
| `shop/np-directory.php` | GET | публично | — | 90/60 | справочник НП (ключ сервера) |
| `shop/preferences.php` | GET, POST | POST — покупатель | shopCsrf | account | тема/пожертвование |
| `shop/order-confirm.php` | POST | менеджер + `order.confirm` | shopCsrf | 30/60 | `npConfirm` |
| `shop/financial-actions.php` | GET, POST | менеджер + `payment.view`; рисковые действия (`:15-17,22`) | shopCsrf `:12` | 20/60 | DTO/аудит; `invoice.create|invoice.resend|refund.execute|manual_reconcile` с версией заказа |
| `shop/np-manager.php` | GET, POST | менеджер; POST кроме `mono_refund|mono_reconcile|confirm` — `shipment.manage` (`:11`) | свой `hash_equals` (`:9`) + Origin (`:10`) | 30/60 | консоль менеджера |
| `shop/np-print.php` | любой | любой менеджер | — | account | печать ТТН |
| `shop/donations.php` | GET, POST | менеджер; `batch` — `payment.manual_reconcile` (`donations-lib.php:14`); `sent` — `order.confirm` | shopCsrf | 20/60 | пожертвования, скрин ≤ 8 МБ с проверкой MIME |
| `shop/donation-proof.php` | любой | менеджер или `shopMayReadOrder` + оплачен | — | account | скрин пожертвования |
| `shop/settings.php` | GET, POST | OWNER + повторный вход (`:5`) | свой `hash_equals` (`:10`) + Origin (`:11`) | 10/60 | настройки владельца |
| `shop/mail-worker.php` | **любой** | **`cron_key` в query string** (`:4-5`) | — | account | HTTP-тик очереди писем; не вызывается из `automation-worker.sh` |

Доступны по HTTP, но без вывода (только определения; проверено токенизатором): `shop/` customer-states, customer-ui, donation-target, donations-lib, financial-permissions, normalization, order-p0-schema, order-state, order-validation, pim-v3-checkout, pim-v3-contract, pim-v3-read, pim-v3-schema, pim-v3-sync, pricing-policy, reservations, settings-lib, supplier-notifications, theme-bootstrap, mono-mock; `api/kits.php`. `shop/crm-bridge.php` подключает `staff/*`. `shop/receipt-view.php` — 404 по `RUBIZH_AUTH`. Только CLI (404 по HTTP): `shop/cache-worker.php`, `photo-worker.php`, `notification-worker.php`, `mono-worker.php`, `np-worker.php`, `np-check.php`.

## 3. Cron, фоновые задачи, CLI

Один crontab, каждую минуту: `bash shop/automation-worker.sh` (`dev/install-automation-cron.sh:12`; по умолчанию dry-run, `--apply`, бэкап crontab). `automation-worker.sh`: `flock -n` на `../rubizh-automation/<name>.lock` (`:15-16`), интервал через `<name>.state` (`:17-25`), лог с ротацией 2 МБ (`:26-28`), задачи параллельно (`:36-44`).

| Задача | Интервал | Скрипт | Доп. блокировка | Что делает |
|---|---|---|---|---|
| cache (`:36`) | 60 с | `shop/cache-worker.php` | `flock cache/worker.lock`; `GET_LOCK('rubizh_photo_worker',0)` | фото, прогрев кеша, heartbeat для `health.php` |
| notifications (`:37`) | 60 с | `shop/notification-worker.php` | строки `sending`/`locked_at` 5 мин | жизненный цикл заказов, письма, уведомления, поставщики, напоминания |
| payments (`:38`) | 180 с | `shop/mono-worker.php` | только `flock` | `monoWorkerRun`: ≤ 25 активных + ≤ 10 `awaiting_webhook` (`mono-lib.php:127-130`) |
| delivery (`:39`) | 900 с | `shop/np-worker.php` | `GET_LOCK rubizh_np_order_*` | обновление ≤ 30 отправлений НП |
| photos (`:40`) | 60 с | `shop/photo-worker.php` | `GET_LOCK('rubizh_photo_worker',0)` | `process_photos(150, 45 с)` |

HTTP-триггеры вне расписания: `/api/cron/photos?key=` (`api/index.php:96-101`), `shop/mail-worker.php?key=` (`:4-6`). Ручные CLI — `dev/*.php` (защита `PHP_SAPI`): проверки, конфигурация (`pim-v3-enable --plan/--apply` с SHA256 и бэкапом), ремонт и backfill (dry-run по умолчанию).

## 4. Миграции и деплой

Ленивые миграции на веб-запросах: `migrate()` (`api/lib.php:52-…`, `SCHEMA_VERSION=4`, `GET_LOCK`), `auth/bootstrap.php:20-31`, `shopStoreDatabase()` (`store-lib.php:21-34`) — `CREATE TABLE IF NOT EXISTS`; пропускаются при `meta.runtime_schema='20261008-v1'` (`shop/runtime.php:86-93`), который ставит только `dev/prepare-runtime.php:10`.

| Миграция | Файлы | Защита |
|---|---|---|
| Order P0 | `dev/migrate-order-p0.php`, `shop/order-p0-schema.php` | `--plan`/`--apply`, проверка имени БД, проверенный бэкап вне webroot (SHA256) или `--isolated`; CLI; `meta.order_p0_schema=1`; аудит с триггерами запрета UPDATE/DELETE |
| Runtime | `dev/prepare-runtime.php` | отказ при P0-схеме с заказами; индекс только если нет |
| PIM v3 | `dev/migrate-pim-v3.php`, `shop/pim-v3-schema.php` | plan по умолчанию, бэкап, preflight типов/collation, `GET_LOCK`, журнал с хешами, отказ на нежурналированный объект |
| CRM | `dev/migrate-crm.php`, `staff/schema.php` | plan/apply + бэкап, журнал с хешами, `meta.crm_schema=1`; **ни один установщик не вызывает** — порядок ручной |
| Категории, реклассификация | `dev/migrate-categories.php`, `dev/reclassify-catalog-v2.php` | apply с бэкапом, rollback |
| Индексы | `dev/install-catalog-indexes.php`, `sql/indexes.sql` | PHP проверяет `SHOW INDEX`; SQL-файл не идемпотентен |
| Разрушительные | `dev/pim-v3-catalog-reset.php`, `dev/pim-v3-legacy-hide.php` | plan → apply по SHA256 + бэкап; у reset нет restore |

Деплой: `dev/deploy-update.sh` (SHA256 архива; порядок: библиотеки → остальное → точки входа; `php -l` до/после; бэкап `release-*`; атомарная замена; откат по EXIT trap); `dev/rollback-update.sh` (файлы, без БД); `dev/install-pim-v3.sh` (бэкап БД → архив по SHA256 → deploy → P0 → runtime → PIM v3 → сверка инвентаря `LOST_*`=0 → smoke; v3 sync/платежи/cron/CRM не включает). `dev/package-release.py` — детерминированный zip из `git ls-files` без tests/docs/downloads/preview/`*.md`/приватных конфигов.

## 5. Контракт PIM → SITE

| Пункт | Факт | Ссылка |
|---|---|---|
| Направление | PIM (браузерное приложение) отправляет в SITE; SITE в PIM не обращается и обратного канала нет | `PIM/app/lib/final-workflow.inc.js:208-215`; в SITE исходящих вызовов к PIM нет |
| Аутентификация | `Authorization: Bearer <pim_key>`, ключ ≥ 24, `hash_equals`; 401 | `api/lib.php:143-149` |
| Эндпоинты, которые вызывает PIM v3 | `GET /api/pim/status`, `POST /api/pim/sync` (фото обрабатывает cron SITE) | `final-workflow.inc.js:221,235`; `shop/automation-worker.sh:40` |
| Включение v3 | `cfg('pim_v3_sync')===true` **и** `meta.pim_v3_schema='2'`; иначе capabilities только `{pricing_policy_version:1}`; legacy-тело после включения v3 → 409 `CONTRACT_V3_REQUIRED` | `shop/pim-v3-sync.php:16-26`; `api/index.php:37` |
| Конверт v3 | `contract_version 3`, `pricing_policy_version 1`, `category_catalog_version 2`, `size_catalog_version 1`, `inventory_policy_version 1`, `order_policy_version 1`, `model_colors_version 1`, `currency UAH`, `catalog_revision`, `categories`, `products[]` (только READY), `hide_ids[]` (только явные) | `PIM/app/lib/final-workflow.inc.js:193-199` |
| Модель → цвет → вариант | модель: id/model_id, slug, name, category, availability + три флага разрешений, `site_price`, photos, colors, variants, size_catalogs, size_options, publication, kit_component…; цвет: id, color, photos, `variant_skus`; вариант: sku, color_id, size*, availability*, `order_submission_allowed`, `payment_allowed`, `requires_order_confirmation`, stock/stock_quantity/stock_status, inventory_*, expires_at, lead_time, price/site_price/kit_price/wholesale/minimum_sale_price/discount_margin_floor_pct, приватная маршрутизация поставщика | `final-workflow.inc.js:154-189` |
| Разрешения по наличию | IN_STOCK 1/1/0; PREORDER, ORDER_ON_REQUEST, SIZE_CONFIRMATION_REQUIRED 1/0/1; UNKNOWN 0/0/1; OUT_OF_STOCK 0/0/0 (submission/payment/confirmation) | `PIM/app/server-contract.md:24-31` |
| Пакеты | PIM: 100 изменённых моделей на чанк, `batch_id`, категории в чанке 0, hide_ids в последнем; SITE: ≤ 200 моделей и ≤ 200 чанков, стадирование в `rubizh_pim_batch_chunks`, финальный чанк → полная проверка → одна транзакция под `GET_LOCK`; повтор чанка → тот же ACK, другие байты → 409; любая неверная модель отклоняет весь пакет (422) | `final-workflow.inc.js:207-251`; `pim-v3-sync.php:9-10,40-49,245-300` |
| Проверка на SITE | конверт и версии (`pim-v3-sync.php:34-49`); категории без циклов (`:52-61`); закреплённая draft-07 схема с хешем (`pim-v3-contract.php:13-66`); правила моделей: владение цветами/фото/размерами, уникальность SKU, `payment_allowed` вместе с флагом подтверждения → конфликт, stock vs stock_quantity, обязательные поля цены (`:94-176`); slug/name/описание, ≥ 1 фото, лист категории (`pim-v3-sync.php:102-127`); политика цены: `site_price==price`, пол и маржа 15 %, границы kit/опта (`pricing-policy.php:19-41`) | как указано |
| Что хранит SITE | `products` (+`pim_*`, `pim_kit_slot`), `variants` (46 колонок; отсутствующие SKU → `pim_active=0`, не удаляются), `rubizh_catalog_pricing` (приватные полы), `rubizh_catalog_fulfillment`/`supplier_articles`, фото и владение фото, цвета, размерные каталоги и опции, категории (с ручной блокировкой `rubizh_category_decisions`), журналы пакетов | `pim-v3-sync.php:135-230`; `pim-v3-schema.php:58-78` |
| Владение | каталог, SKU, наличие, разрешения, цены и полы — PIM (SITE хранит зеркало); итоговая цена в checkout — SITE пересчитывает по сохранённой политике PIM; заказы, покупатели, оплаты, отправления, резервы — только SITE (резервы вычитаются из `pim_stock_quantity` и в PIM не возвращаются) | `pim-v3-checkout.php:51-66`; `reservations.php:21-36` |
| Записи SITE в зеркало вне синхронизации | CLI `dev/pim-v3-legacy-hide.php:45,54`, `dev/repair-catalog.php:23`; legacy-таксономия `taxonomy.php:91`; legacy-очистка `api/index.php:56-57`. В сам PIM SITE не пишет | grep |
| Фикстуры | `contracts/pim-v3/2/wire.exact.json` побайтно совпадает с `PIM/app/contracts/fixtures/pim-site-wire-v3.exact.json`; **хеш в обоих манифестах (`66a1b714…`) не совпадает с файлом (`c21fe16c…`)** — проверено координатором; хеш никто не проверяет. `wire.schema.json` совпадает с PIM | `contracts/pim-v3/2/manifest.json:9`; `PIM/app/contracts/fixtures/…manifest.json:6` |
| Документ PIM устарел | `PIM/app/server-contract.md:3` пишет, что сборка не вызывает `/pim/sync`, а код вызывает | `final-workflow.inc.js:217-251` |

## 6. Внешние провайдеры (точки вызова)

| Провайдер | Вызовы | Транспорт | Ошибки | Mock / тесты |
|---|---|---|---|---|
| MonoPay `monoApi()` (`shop/mono-lib.php:9-17`) | `invoice/create` — `monoCreate` (payment-start, payment-return, financial-actions, `staff/operations.php:17`); `pubkey` — вебхук (обновление ≤ 1/60 с под `GET_LOCK`); `invoice/status` — `monoParkedReconcile`, `monoInvalidateFailed`, `monoRefresh` (mono-worker, order-lifecycle, payment-return), `monoReconcile`; `invoice/remove` — `monoInvalidateFailed`; `invoice/cancel` (возврат) — `monoRefund` (np-manager, financial-actions, `staff/refunds.php:20`) | `api.monobank.ua`, X-Token из env или конфигурации, 5/20 с, без редиректов, TLS | счёт `unknown` при сбое; незавершённый счёт блокирует новый; потерянный webhook подтверждается чтением статуса только через 900 с | `RUBIZH_MONO_TESTS` + `mono_test_transport`; `monoMockEnabled()` = `mono_mock` + `environment=staging` + хост не rubizh.shop (`:3`); иначе нужен `mono_activation_confirmed` + токен |
| Вебхук MonoPay (входящий) | `shop/mono-webhook.php` | 64 КиБ, X-Sign ECDSA, 180/60 | `MonoEventRejected` → 200 parked; иначе 503 | — |
| Nova Poshta `npApiCallOnce()` (`shop/np-lib.php:74-92`) | справочники городов/отделений/улиц — `npCached` (кеш БД 1–24 ч) из `np-directory.php`, `npValidateDelivery` (`order.php:34`); контрагенты/отправитель; `Counterparty.save`/`Address.save`; `InternetDocument.save` — `npCreate` (только при `np_ttn_enabled`, `np-fulfillment.php:110`); `getDocumentList` — `npReconcile`; `TrackingDocument.getStatusDocuments` — `npRefresh` (np-worker) | `api.novaposhta.ua`, ключ из env или конфигурации, 5/25 с, TLS | 429 → `NpRateLimited`; не-200 → `NpUnknownResult` (сохранение не повторяется); `success!==true` → `NpRejected` (ключ вычищен) | `RUBIZH_NP_TESTS` + `np_test_transport` |
| TurboSMS | `sendPhoneCode` (`auth/phone.php:42-56`) из `phoneRequest` | `api.turbosms.ua/message/send.json`, Bearer, HTTPS, 5/25 с, 1 МиБ, `sequence_id` | `turboSmsAccepted`; без автоповтора | `smsEnabled()`; `RUBIZH_SMS_TESTS` + транспорт; `cli-server` + `sms_test_outbox` |
| Google | `auth/google.php`, `googleExchange` (`auth/google-client.php:37-46`) | accounts.google.com, oauth2.googleapis.com; redirect URI фиксирован | flash в сессии | `googleEnabled()`; тестового транспорта нет |
| Почта SMTP `rubizhSendEmail` (`auth/mailer.php:27-41`) | ссылка входа, письма о заказе (5 повторов), письма покупателю, напоминания о корзине, уведомления менеджеру, письма поставщику | `smtps://mail.adm.tools:465`, 15/35 с, TLS | исключение → строка очереди `pending`/`failed` | хука нет; тесты — пустой пароль; вызовы в `notifications.php:31`, `cart-reminders-lib.php:57`, `order-lifecycle.php:65`, `supplier-notifications.php:43` пустой пароль не проверяют |
| Telegram | `shopTelegramSend` (`shop/notifications.php:21-23`) | api.telegram.org, 5/15 с | 5 повторов | хук только для поставщиков |
| Загрузка фото | `fetch_to_webp` (`api/lib.php:399-402`) → `rubizhDownloadImage` (`api/http-download.php:36-50`) | закреплённый DNS (`CURLOPT_RESOLVE`), ≤ 4 редиректа, 15 МиБ, 20 с | — | — |

## 7. База данных, машины состояний, флаги

### 7.1 Как применяется схема, кодировка, время

| Тема | Факт | Ссылка |
|---|---|---|
| Ядро каталога | `migrate()` на каждом `db()`, стоп при `meta.schema >= 4`, `GET_LOCK('rubizh-schema-…',10)` | `api/lib.php:7,46,52-110` |
| Ленивые миграции магазина/входа | `shopStoreDatabase()`; пропуск при `rubizhSchemaPrepared()` (`meta.runtime_schema='20261008-v1'`, пишет только CLI) | `shop/store-lib.php:21-34`; `shop/runtime.php:86-93`; `dev/prepare-runtime.php:10` |
| Order P0, CRM, PIM v3 | только CLI, журналы с хешами; PIM v3 требует MariaDB ≥ 10.6 / MySQL ≥ 8.0.16 | `shop/order-p0-schema.php:23-33`; `staff/schema.php:23-33`; `shop/pim-v3-schema.php:108-146` |
| Разрыв | ленивый путь создаёт `rubizh_stock_reservations` без `status/committed_at/released_at` (их добавляет только P0), а `shopReserveLines` пишет `status` | `shop/order-lifecycle.php:21`; `order-p0-schema.php:7-8`; `reservations.php:29` |
| Кодировка | DSN `utf8mb4`; таблицы `DEFAULT CHARSET=utf8mb4` без явного COLLATE; `rubizh_customer_identities` — `utf8mb4_bin` | `api/database.php:42`; `auth/identities.php:52-56` |
| Время | 201 × `UTC_TIMESTAMP()`, PHP `gmdate()`/`time()`, `strtotime(… ' UTC')`; `NOW()`/`date_default_timezone_set` нет; Europe/Kyiv явно — рабочие дни срока оплаты (`shop/order-lifecycle.php:4-8`), отображение (`auth/account.php:116`), поле даты НП (`np-fulfillment.php:129`), пожертвования (`donations-lib.php:21`), отчёты CRM (`staff/reports.php:4`); таблицы входа — epoch BIGINT | grep |
| Попутно | после синхронизации v3 `meta.catalog_updated`='<datetime>-pim3-…' (`pim-v3-sync.php:281`), `/api/health` разбирает его `strtotime(… ' UTC')` → `false` → 503 «последняя публикация N ч назад» | `api/index.php:133` |

### 7.2 Таблицы (неявные связи, если не указан FK)

| Таблица | Где создаётся | Ключевые поля | Ключи |
|---|---|---|---|
| `meta` | `api/lib.php:59` | k, v | PK k |
| `categories`, `products`, `variants`, `photos`, `sync_log`, `rubizh_catalog_fulfillment`, `rubizh_catalog_supplier_articles`, `rubizh_catalog_pricing` | `api/lib.php:62-104` | products: price_min/max DECIMAL(14,2), visible, `pim_*` (CHECK); variants: price/kit_price DECIMAL(14,2), ~35 `pim_*` | products UQ slug; variants PK sku, FK `pim_color_owner` → `rubizh_product_colors` (`pim-v3-schema.php:69-70`) |
| `rubizh_auth_links`, `rubizh_auth_attempts` | `auth/bootstrap.php:29-30` | token_hash, ip_hash, время BIGINT | UQ token_hash |
| `rubizh_customer_orders` | `auth/account.php:19` | status VARCHAR(32) 'new', payment_status 'pending', total DECIMAL(12,2), currency 'UAH', items_json; v3: pim_order_state, pim_payment_state, pim_fulfillment_state (CHECK) | UQ external_id ('web:'+request_id, `shop/order.php:44`); CRM-индексы `staff/schema.php:19` |
| `rubizh_accounts`, `rubizh_customer_identities`, `rubizh_account_orders`, `rubizh_account_redirects`, `rubizh_auth_link_targets` | `auth/identities.php:45-63` | | |
| `rubizh_phone_challenges` | `auth/phone.php:15` | code_hash, attempts, state | |
| таксономия, решения категорий | `shop/taxonomy.php:40-43`; `shop/reclassification-v2.php:8-10` | | |
| `rubizh_customer_preferences`, `rubizh_order_timeline` | `shop/customer-ui.php:6-7` | | PK (order_id,event,event_key) |
| `rubizh_order_audit` | `shop/order-p0-schema.php:9` (CLI) | before/after JSON | триггеры запрета UPDATE/DELETE (`:10`) |
| `rubizh_stock_reservations` | `shop/order-lifecycle.php:21` (+P0) | qty DECIMAL(12,2), expires_at, status | PK (order_id,sku) |
| `rubizh_order_timing`, `rubizh_buyer_mail`, `rubizh_donation_batches`, `rubizh_order_donations` | `shop/order-lifecycle.php:20-25` | payment_due, paid_at | |
| `rubizh_order_fulfillment_lines`, `rubizh_order_shipments`, `rubizh_np_order_confirmations`, `rubizh_np_audit`, `rubizh_np_cache` | `shop/np-fulfillment.php:6-16` | shipments: tracking_number UQ, operation_key UQ, status 'draft' | `rubizh_np_audit` — также журнал событий MonoPay |
| `rubizh_favorites`, `rubizh_shared_kits`, `rubizh_checkout_requests`, `rubizh_order_details`, `rubizh_order_mail`, `rubizh_shop_limits` | `shop/store-lib.php:26-31` | checkout_requests: request_id PK, scope_hash, payload_hash | |
| `rubizh_cart_reminders`, `rubizh_notifications`, `rubizh_supplier_skus`, `rubizh_supplier_dispatch` | `shop/cart-reminders-lib.php:6`; `shop/notifications.php:5`; `shop/supplier-notifications.php:5-6` | | notifications UQ (order_id,event,channel) |
| `rubizh_mono_invoices`, `rubizh_mono_events` | `shop/mono-lib.php:6-7` | amount BIGINT (копейки), status, refund_status; events: event_hash PK | invoice_id UQ, reference UQ |
| CRM: roles, permissions, users, assignments, internal_notes, staff_audit, returns, refund_operations, sender_profiles, order_contact_evidence, crm_migrations | `staff/schema.php:6-16` (CLI) | refund_operations: ext_ref UQ, idempotency_key UQ | триггеры запрета UPDATE/DELETE для staff_audit и internal_notes (`:18`) |
| PIM v3: product_colors, model_photos, color_photos, size_catalogs, size_options, pim_batches, pim_batch_chunks, pim_legacy_mappings, pim_history, order_request_selections, pim_categories, pim_category_mappings, pim_foundation_journal | `shop/pim-v3-schema.php:58-73,132` | CHECK-ограничения (size_options: payment_allowed=0, requires_order_confirmation=1) | единственные настоящие FK |

`rubizh_pim_legacy_mappings` и `rubizh_pim_category_mappings` создаются, но нигде не читаются и не пишутся. Таблиц без CREATE нет.

### 7.3 Машины состояний

**Заказ (legacy `status`)**: вставка `new`/`confirmed` (`shop/order.php:44` через `pimV3OrderDecision`, `shop/pim-v3-checkout.php:72-79`); `→ confirmed` — `npConfirm` (`shop/np-fulfillment.php:95`; не требует `new`, повторное подтверждение заново запускает срок оплаты `order-lifecycle.php:13`); `→ cancelled` — `shopCancelOrder` (`store-lib.php:150`, под `GET_LOCK`, проверки статуса, оплаты, открытого счёта, отправлений), `monoApplyEvent` на `expired` (`mono-lib.php:97`, без проверки статуса/отправлений; срок счёта 3600 с, `:35`), дедлайн `shopLifecycleTick` (`order-lifecycle.php:51-57`, 2 рабочих дня по Киеву, `:29`); `→ shipped/partially_shipped/delivered/returned/partially_returned` — `npAggregateOrder` (`np-fulfillment.php:206-214`, по отправлениям, без проверки оплаты); `processing`, `completed` не пишутся.

**v3 `pim_order_state`**: NULL → WAITING_CONFIRMATION/CONFIRMED (`pim-v3-checkout.php:83`); → CONFIRMED (`np-fulfillment.php:96`); → CANCELLED (`store-lib.php:150`, `mono-lib.php:97`); CONFIRMED → COMPLETED (`np-fulfillment.php:219`, доставлено и оплачено); NEW не пишется. Проекции `shopCanonicalOrder` (`shop/order-state.php:5-51`) и списка CRM (`staff/read.php:22`) для legacy `new` различаются.

**Оплата**: `payment_status` — `pending` при вставке; `→ paid` подписанным успехом (`mono-lib.php:92`, без проверки статуса заказа — поздняя оплата отменённого заказа, помечается STATE_CONFLICT) или OWNER по подтверждению (`np-fulfillment.php:100`, без проверки суммы); `pending → failed` (`:93`); `→ refunded` по `reversed` (`:95`, без требования `paid`), `monoRefund` (`:136`, из `paid`), `crmRefundState` (`staff/refunds.php:7`, без проверки предыдущего, может вернуть `paid` поверх `refunded`). `pim_payment_state`: UNPAID → PAYMENT_PENDING (`mono-lib.php:35`) → PAID (`:92`, безусловно; `np-fulfillment.php:101`) / UNPAID (`:93`) / REFUNDED, PARTIALLY_REFUNDED. Счёт `rubizh_mono_invoices.status`: creating → created/unknown (`:35-36`), сверка OWNER (`:143-145`), → awaiting_webhook (`:82`), → статус банка (`:91`; дедупликация по хешу `:85`, без отката из success/reversed `:86-87`, monotonic modifiedDate `:90`; чтение статуса двигает деньги только для awaiting_webhook + success + reference + 900 с, `:119-125`). `refund_status`: '' → processing → результат/unknown (`:135-137`); единственный выход из `unknown` — webhook `reversed` (UNCLEAR). `rubizh_refund_operations.status` (`staff/refunds.php:19-31`): webhook допускает failure → success.

**Доставка**: вставка draft — `npDraft` (`np-fulfillment.php:72-80`; в legacy-консоли без требования оплаты `np-manager.php:28`, в CRM — PAID, `staff/operations.php:45`); draft → creating (`:159`, `npAssertReady` `:109-126`: `np_ttn_enabled`, наличие подтверждено, оплачено, без наложенного платежа, адрес); creating → created/error/unknown (`:153-170`); сверка (`:178-187`); draft/error → cancelled (`:192`); трекинг (`:198-202`, без монотонности — sent → created возможно); `pim_fulfillment_state` → READY_TO_SHIP (`mono-lib.php:92` условно, `np-fulfillment.php:101` безусловно), → TTN_CREATED/IN_TRANSIT/DELIVERED (`:216-219`, без монотонности); SHIPPED не пишется.

**Предзаказ / запрос (v3)**: `request_state` строки (`store-lib.php:111`, `pim-v3-checkout.php:39,67`); заказ WAITING_CONFIRMATION, если есть строка не v3, без `payment_allowed` или с подтверждением (`pim-v3-checkout.php:78`); выбор размера — `rubizh_order_request_selections` (`:84-85`); решение менеджера — `pimV3ConfirmRequests` → `shopAcceptOrderQuote` (`order-validation.php:90-99`, отказ при открытом счёте, `:92`).

**Резерв**: вставка ACTIVE — `shopReserveLines` (`reservations.php:21-31`, только строки в наличии с подтверждённым остатком); ACTIVE → RELEASED/EXPIRED (`:7-19`); любое не-COMMITTED → COMMITTED (`:15`, в т.ч. RELEASED/EXPIRED без перепроверки остатка; вызовы `mono-lib.php:92,94,95`, `np-fulfillment.php:102`, `order-lifecycle.php:34`); `expires_at` переносится для всех строк (`order-lifecycle.php:14`); неявное истечение в `shopReservedQty` (`:36`).

**Прочее**: возвраты CRM (`staff/operations.php:29`, по версии); пакеты PIM RECEIVED → REJECTED/COMMITTED (VALIDATED не пишется); очереди писем/уведомлений pending → sending → sent/failed/skipped (захват с блокировкой). Блокировка заказа — `npLocked` (`GET_LOCK rubizh_np_order_<id>`, 2 с, `np-fulfillment.php:40-43`); версия заказа в `financial-actions.php:18-19` проверяется вне блокировки; `order-confirm.php` и `confirm` консоли без проверки версии (CRM — с проверкой, `staff/operations.php:14`).

### 7.4 Флаги и где они действуют на сервере

`cfg()` = `api/config.php` + `np-private.php` + `mono-private.php` + `site-settings.json` (`api/lib.php:17-29`); настройки владельца переопределяют только белый список (`shop/settings-lib.php:4`), ни один флаг ниже в него не входит.

| Флаг | Где | Что блокирует |
|---|---|---|
| Legacy-синхронизация PIM | `api/index.php:21-72` | **флага «выключено» в SITE нет**: только ключ `pim_key` + CORS `pim_origins`; legacy отклоняется лишь после включения v3 (`:37`) |
| AUTOPRICES | — | в коде SITE отсутствует (только документы); переключатель на стороне PIM |
| `pim_v3_sync` + `meta.pim_v3_schema='2'` | `shop/pim-v3-sync.php:16-26` | приём пакетов v3 (409 `CONTRACT_V3_NOT_ENABLED`); при включении — отказ legacy; включается `dev/pim-v3-enable.php:12` |
| `meta.pim_v3_schema='2'` | `shop/pim-v3-read.php:6-8` | все записи `pim_*` в заказах и разрешение строк v3 в checkout (`pim-v3-checkout.php:7`) |
| `mono_mock` | `shop/mono-lib.php:3` | только при `environment=staging` и хосте не rubizh.shop (в CLI хоста нет — действуют первые два условия) |
| `mono_activation_confirmed` + токен | `mono-lib.php:4` | без них: оплата картой отклоняется (`order.php:23`), `monoApi` бросает, воркер выходит, повтор оплаты закрыт |
| `np_card_payment_verified` | `np-fulfillment.php:116` | альтернатива для ТТН по карточному заказу |
| `environment=staging`, `staging_origins`, `staging_allow_loopback`, `public_base_url` | `mono-lib.php:3,18`; `store-lib.php:54-60`; `staff/bootstrap.php:13` | mock, база URL банка (иначе https://rubizh.shop), доп. Origin в `shopCsrf`, loopback для CRM |
| `sms_enabled`, `google_enabled` (+ env) | `auth/identities.php:22-37` | вход по SMS/Google |
| `staff_roles`, `np_manager_emails`, `staff_stepup_seconds` | `financial-permissions.php:19-39` | роли и окно повторного входа |
| `np_ttn_enabled`, ключ НП | `np-fulfillment.php:110`; `np-lib.php:7` | создание ТТН; без ключа — ручной адрес, воркер выходит |
| `cart_reminders_enabled` | `cart-reminders-lib.php:12` | напоминания (по умолчанию включены при наличии SMTP-пароля) |
| `catalog_checkout_max_age_seconds` | `store-lib.php:103-105` | отказ строкам с устаревшей синхронизацией (по умолчанию 48 ч) |
| `cron_key` | `api/index.php:97-98`; `shop/mail-worker.php:4` | HTTP-cron |
| `meta.runtime_schema`, `crm_schema`, `order_p0_schema` | `runtime.php:86-93`; `staff/schema.php:22` | ленивые миграции; без `crm_schema` CRM API → 503 |



## Stage2 correction overlay (2026-10-12)

Историческая карта выше построена по pinned baseline51c83d8. На Stage2 branch публичный api health использует только local media verification; no-ledger refunds проверяют предоставленные correlation facts, неполные facts удерживаются как unknown; диагностические чтения и SITE refund/reconcile/confirm проверяют актуальную версию под order lock. AUTH manager email fallback использует proven email identity, Google contact_email не является такой идентичностью. NP transient directory outage сохраняет ручной адрес с unverified refs; TTN readiness по-прежнему требует manager validation. Paid fulfillment confirmation не меняет price/items/timing/reservation snapshots. Q8 recovery хранит полную selection и пересчитывается из текущих PIM prices/slots. SSR/SPA metadata имеют одного владельца. Installer требует reviewed artifact + существующие P0 prerequisites и HTTP200 smoke; старый zip не пересобран и fail-closed до будущей reviewed packaging задачи. SOURCE_OF_TRUTH, PIM/CRM source, prices/floors, activation flags и deployment не изменены. Точный SHA/CI — STAGE_CHECKPOINT; дефекты и решения — только существующий03.

Карту guard boundary дополняют24 отрицательных CSRF/Origin HTTP probes на8 critical mutation endpoints (stage2-request-guards), existing accountA/B IDOR, staff role/step-up/revocation suites и сквозные contract/browser cases. Это не доказательство exhaustive dynamic traversal каждого endpoint/method/role из карты; финальный fresh SECURITY проход не завершён и не обозначается PASS.
