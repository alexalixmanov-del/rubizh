# RUBIZH RC1 — интерфейсные контракты (этап 3)

> Выведено из кода на снимках: SITE `release/rc1` (база `rubizh-stage-2-verified` = `6311e40`), PIM `fix/pimc-p1@5fd46cb` (только чтение), CRM frontend `crm.rubizh@b0e2f93` (только чтение). Ссылки `path:line`; пути PIM — относительно `pim.rubizh/`, CRM — относительно `crm.rubizh/`. Значения ключей/токенов и персональные данные не приводятся; по неисправленным дефектам — только ID из `docs/release-hardening/03-DEFECT_REGISTER.md`. Составлено агентом `ecc:architect`, сверено координатором; зелёный статус тестов — по Quality Gate этапа 3 (`docs/release-hardening/STAGE_CHECKPOINT.md`).
>
> Тесты, которым нужна БД, без `RUBIZH_TEST_MYSQL_SOCKET` пропускаются (QA-15); CI задаёт сокет и требует `skipped 0` (`.github/workflows/ci.yml`).

---

## 1. PIM → SITE, контракт 3 (v3)

### 1.1 Эндпоинты `/api/pim/*` (`api/index.php`)

| Метод / путь | Назначение | Ссылка | Вызывает PIM |
|---|---|---|---|
| `POST /api/pim/sync` | приём каталога; есть ключ `contract_version` → v3, иначе legacy | `api/index.php:27-75`, ветвление `:32-36` | да, `app/lib/final-workflow.inc.js:235` |
| `POST /api/pim/costs` (приватный контракт, stage 5) | себестоимость (выплата поставщика) по SKU → `rubizh_crm_sku_costs`; не публичен | `api/index.php:79-85`, `api/pim-private.php` | да, после COMMITTED-публикации (PIM `pimSitePrivateCosts()`) |
| `POST /api/pim/backup` (stage 5) | приём gzip-копии данных PIM в приватную папку вне webroot | `api/index.php:86`, `api/pim-private.php:73-105` | да, PIM «Копії на сайті» |
| `GET /api/pim/backups` (stage 5) | список копий (`id`, `at`, `size`, `sha256`, `label`) | `api/index.php:87`, `api/pim-private.php:113-116` | да, PIM «Копії на сайті» |
| `GET /api/pim/backups/{id}` (stage 5) | точная выдача одной копии (`application/gzip`, `no-store`) | `api/index.php:88`, `api/pim-private.php:119-124` | да, PIM «Копії на сайті» |
| `GET /api/pim/status` | счётчики, `api_version`, `capabilities` | `api/index.php:83-94` | да, `final-workflow.inc.js:221` |
| `POST /api/pim/photos` `{limit}` (1..80) | обработка очереди фото | `api/index.php:77-81` | да (legacy), `app/rubizh_pim.html:8746` |
| `GET /api/pim/categories` | таксономия SITE | `api/index.php:25` | в `app/lib` не найдено |
| `/api/pim/cache-clear` | очистка кеша | `api/index.php:26` | в `app/lib` не найдено |
| прочие | `404 «Нет такого метода PIM»` | `api/index.php:95` | — |

**Авторизация.** `Authorization: Bearer <pim_key>`, сравнение `hash_equals`; несовпадение → 401; ключ короче 24 символов или плейсхолдер → 500 (`api/lib.php:143-149`). CORS только для `pim_origins` (`api/lib.php:130-137`). PIM шлёт тот же заголовок (`final-workflow.inc.js:211`). Неудачные попытки считаются по сети: 30 за 600 с, затем 429 (этап 5, `api/lib.php:159`). Во время ротации принимается и `pim_key_next` (этап 5; слабый или равный `pim_key` игнорируется и логируется, `api/lib.php:148-152`); процедура — [CONFIG §3.1](CONFIG.md#31-pim_key). Смена ключа перед production — PL-3 ([PRE_LAUNCH_BLOCKERS](PRE_LAUNCH_BLOCKERS.md#pl-3)).

**Размеры.** Тело > 16 МБ → 413 без `error_code` (`api/index.php:30-31`); чанк v3 > 8 МБ → 413 `BYTE_LIMIT` (`shop/pim-v3-sync.php:35`).

### 1.2 Capability gate

- `pimV3Enabled()` = `cfg('pim_v3_sync')===true` **и** `meta pim_v3_schema='2'` (`shop/pim-v3-sync.php:16-22`). В `api/config.sample.php` ключа нет → по умолчанию выключено. Включение — только `dev/pim-v3-enable.php` (`contracts/pim-v3/2/manifest.json:11-12`).
- `capabilities` (`shop/pim-v3-sync.php:23-26`): выключено → `{"pricing_policy_version":1}`; включено → `contract_version:3, version:3, pricing_policy_version:1, category_catalog_version:2, size_catalog_version:1, inventory_policy_version:1, order_policy_version:1, model_colors_version:1, envelope:"products", max_chunk_models:200` (`:8-9`).
- PIM сверяет каждую версию и `envelope` (`final-workflow.inc.js:4,216`); при расхождении ничего не отправляет (`SYNC_DISABLED`, `:222`). Чанк PIM фиксирован 100 моделей (`:207`) ≤ 200.

### 1.3 Конверт пакета и чанки

Заголовок чанка (`shop/pim-v3-sync.php:34-49`):

| Поле | Правило SITE | PIM |
|---|---|---|
| `contract_version, version, pricing_policy_version, category_catalog_version, size_catalog_version, inventory_policy_version, order_policy_version, model_colors_version` | строго `PIM_V3_CONTRACT`, иначе 409 `UNSUPPORTED_VERSION:<key>` (`:39`) | `final-workflow.inc.js:230,233` |
| `currency` | ровно `"UAH"`, иначе 400 `CURRENCY` (`:38`) | `:233` |
| `products` | список; `models` запрещён → 400 `ENVELOPE_PRODUCTS_REQUIRED` (`:40`); ≤200, иначе 413 `CHUNK_TOO_LARGE` (`:44`) | `:233` |
| `batch_id` | `^PB-[a-f0-9]{16}-[a-f0-9]{16}$` (`:41`) | `'PB-'+catalog_revision+'-'+fnvHash(...)` (`:229`) |
| `chunk_index`, `chunk_count` | целые, `1≤count≤200`, `0≤index<count` (`:42-43`) | `:233` |
| `hide_ids` | ≤20000; непустой только в последнем чанке (`:45-46`) | `:233` |
| `categories` | обязательны в чанке 0 (`:47`) | `:234` (+`category_catalog_hash`) |
| `catalog_revision` | `^[A-Za-z0-9_.:-]{8,64}$` (`:48`) | `fnvHash` (`:198`) |
| `pim_version`, `generated_at`, `category_catalog_hash` | SITE не проверяет (обязательны только в `contracts/pim-v3/2/wire.schema.json:7-24`, в runtime не применяется — PIMC-08) | `:233-234` |

Жизненный цикл (`shop/pim-v3-sync.php:241-302`): чанк → `sha256(raw)`, хранится в `rubizh_pim_batch_chunks`, не последний → `STAGED`; последний → сборка (`MISSING_CHUNKS`, `BATCH_MIXED`), проверка всего пакета, одна транзакция под `GET_LOCK` (иначе 503 `CATALOG_BUSY`), пересчёт категорий и кеша. Любая ошибка — каталог не меняется, пакет `REJECTED`.

Повторы: `COMMITTED` + тот же чанк/хеш → сохранённый ACK с `replayed:true` (`:246-251,280-281`); другие байты → 409 `BATCH_HASH_CONFLICT` (`:248,257`); другая ревизия → 409 `BATCH_REVISION_CONFLICT` (`:255`); повтор `REJECTED` → 409 `BATCH_REJECTED` (`:252`). `ignore_user_abort(true)` + 300 с (`:262`).

ACK: промежуточный `{ok:true,batch_id,chunk_index,status:"STAGED"}`; финал `{ok:true,…,status:"COMMITTED",contract_version:3,pricing_policy_version:1,catalog_revision,results:[{id,status:"created"|"updated"|"unchanged",…}],hidden_ids}` (`:287,293`); отказ `{ok:false,error:"PIM contract 3: <CODE>",error_code,results:[{id,status:"error",errors:[≤10]}]}` (`api/index.php:35`; `shop/pim-v3-sync.php:125,275`). PIM принимает финал только при `COMMITTED`, `contract_version==3`, каждой модели ровно один раз и `hidden_ids == hide_ids` (`final-workflow.inc.js:236-247`).

Коды отказа: 409 `CONTRACT_V3_NOT_ENABLED` (`:242`); 413 `BYTE_LIMIT`/`CHUNK_TOO_LARGE`; 400 `INVALID_JSON, BATCH_CONTRACT, CURRENCY, ENVELOPE_PRODUCTS_REQUIRED, BATCH_ID, CHUNK_INDEX, HIDE_IDS, HIDE_IDS_LAST_CHUNK_ONLY, CATEGORIES_REQUIRED, CATALOG_REVISION` (`:36-48`); 409 `UNSUPPORTED_VERSION:*`, `BATCH_HASH_CONFLICT, BATCH_REJECTED, BATCH_REVISION_CONFLICT, MISSING_CHUNKS, BATCH_MIXED`; 422 `CATEGORY_CATALOG` (+`CATEGORY_IDENTITY`, `CATEGORY_PARENT:*`, `CATEGORY_CYCLE:*`), `DUPLICATE_MODEL`, `HIDE_AND_PUBLISH_CONFLICT`, `INVALID_MODELS` (`:53-61,270-275`); 503 `CATALOG_BUSY`. Коды моделей (`results[].errors`): `shop/pim-v3-sync.php:112-120`, `shop/pim-v3-contract.php:22-66,94-183`.

### 1.4 Поля модели `products[]`

Проверка по закреплённой схеме `contracts/pim-v3/1/category-size-export.schema.json` (SHA-256 сверяется при загрузке, `shop/pim-v3-contract.php:13-17`) + правила `pim-v3-contract.php:94-183`, `pim-v3-sync.php:103-128`.

| Поле | Тип / обязательность | Семантика SITE |
|---|---|---|
| `id`, `model_id` | string, обяз.; `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$`; `id===model_id`; уникальны без учёта регистра | `pim-v3-contract.php:68,110` |
| `slug`, `name`, `marketing_name_uk`, `description` | непустые; `marketing_name_uk` ≤2000 байт | публичное имя из `marketing_name_uk` (`pim-v3-sync.php:161`) |
| `photos` | ≥1 URL; https:443 без учётных данных | `pim-v3-contract.php:69-75,96,117-120` |
| `canonical_category_id` | обяз.; некорневая категория пакета | `pim-v3-sync.php:114-115`; ручной lock SITE сохраняется (`:222-227`, ARCH-09) |
| `publication_state` | `ACTIVE\|HIDDEN\|ARCHIVED` | `visible=1` только `ACTIVE` (`:166,176`) |
| `*_version` политик | const 1 | схема `:5-34,993-1008` |
| `availability` | `IN_STOCK, OUT_OF_STOCK, PREORDER, ORDER_ON_REQUEST, UNKNOWN, SIZE_CONFIRMATION_REQUIRED` | схема `:996-1005` |
| `order_submission_allowed`, `payment_allowed`, `requires_order_confirmation` | boolean, обяз.; `payment_allowed=true` ⇒ `IN_STOCK` и ≥1 payable вариант | схема `:984-992,1015-1043` |
| `brand`, `filter_attributes`, `recommended_with`, `kit_component`, `kit_component_tags` | необяз. | `pim-v3-sync.php:161-164,179` |
| `site_price` (модель) | number\|null | при записи не используется (`pim-v3-sync.php:150-231`) |
| `checkout_allowed`, `supplier_bindings` | запрещены | схема `:1010-1014`; `wire.schema.json:295-296` |

**Цвета `colors[]`**: `id` (уникален в модели), `photos[]`, `variant_skus[]` (должно совпасть с SKU этого цвета, иначе `COLOR_SKU_OWNERSHIP`), `color`/`camouflage` string\|null ≤480 байт, `photo_assignment` `source_associated|unknown`. Неактивный цвет → `active=0`, не удаляется (`pim-v3-sync.php:180-190`).

**SKU `variants[]`** (схема `:311-341`, `wire.schema.json:217-230`):

| Поле | Тип | Семантика |
|---|---|---|
| `sku` | уникален в пакете; не принадлежит другой модели | никогда не удаляется: отсутствующий → `pim_active=0, availability='out'`, разрешения 0 (`pim-v3-sync.php:192`) |
| `color_id` | string\|null; цвет этой модели | `pim-v3-contract.php:150` |
| `size_status` | `EXACT_SIZE\|ONE_SIZE\|NO_SIZE_REQUIRED\|SIZE_CONFIRMATION_REQUIRED` | схема `:347-354` |
| `size_*` | string ≤120 байт, необяз. | PIM приводит числа к строкам (`final-workflow.inc.js:177`) |
| `availability` + 3 разрешения | enum / boolean | источник истины; legacy-колонка выводится (`pim-v3-sync.php:96-100,193,204`) |
| `stock`, `stock_quantity` | number≥0\|null; null при `UNKNOWN`/`STATUS`/`FEED_PRESENCE`; совпадают | `pim-v3-contract.php:162-165` |
| `stock_observed_at`, `source_updated_at`, `expires_at` | int (мс)\|null | `expires_at≤now` запрещает оформление (`pim-v3-checkout.php:50`); нецелое — «не истекает» (PIMC-07) |
| `stock_data_age_hours`, `stale_source`, `stock_warning_hours` | number/bool | только предупреждение, порога 48 ч нет (`pim-v3-checkout.php:49`) |
| `price_ready`, `price`, `site_price`, `minimum_sale_price`, `kit_price`, `wholesale[]` | pricing v1; `price_ready=false` ⇒ `price===site_price` | `pim-v3-contract.php:166-173`; `shopPricingPolicy` (`pim-v3-sync.php:120,157`) |
| флаги подтверждения | boolean/enum | `payment_allowed` + флаг подтверждения → `CONFIRMATION_PERMISSION_CONFLICT` (`pim-v3-contract.php:151`) |
| `fulfillment_supplier*` | приватные | только маршрутизация НП/поставщика (`pim-v3-sync.php:208-213`) |

`size_catalogs[]` (`scope MODEL|COLOR`) и `size_options[]` (заявка на размер без SKU: `availability=SIZE_CONFIRMATION_REQUIRED`, `payment_allowed=false`, `requires_order_confirmation=true`) — схема `:183-305`.

**Скрытие** только по явным `hide_ids`; отсутствие ≠ скрытие (`pim-v3-sync.php:233-237`; `contracts/pim-v3/2/README.md:33-35`). **Публичный DTO** — белый список (`shop/pim-v3-read.php:23-36`): `stock` всегда `null`, цена `null` без подтверждённой политики, приватные поля удаляются (`api/lib.php:209-215`).

### 1.5 Наличие: null и UNKNOWN

| `availability` | order | payment | confirmation | stock |
|---|---|---|---|---|
| `IN_STOCK`, `price_ready=true` | true | true | false | число/null по `inventory_mode` |
| `IN_STOCK`, `price_ready=false` | false | false | true | — |
| `PREORDER` / `ORDER_ON_REQUEST` | true | false | true | null |
| `SIZE_CONFIRMATION_REQUIRED` | true | false | true | null |
| `UNKNOWN` | **false** | **false** | true | null |
| `OUT_OF_STOCK` | false | false | false | — |

SITE: строка без `pim_order_submission_allowed=1` → `UNAVAILABLE` («Наявність невідома…», `shop/pim-v3-checkout.php:48`); без подтверждённой цены заказ невозможен (`:52`); любая не-payable строка → весь заказ `WAITING_CONFIRMATION` (`:72-80`); счёт только при `CONFIRMED` после повторной проверки (`:92-98`; `shop/mono-lib.php:27`); резерв только для числового остатка (`:57-59`).

### 1.6 Legacy-синхронизация (R1: по умолчанию выключена)

- `api/config.sample.php:14` `'pim_legacy_sync' => false`; строгая проверка `!==true` → `LEGACY_SYNC_DISABLED` (`api/lib.php:232-237`); отсутствие ключа, `'true'`, `1` — выключено. Через `site-settings.json` не переопределяется (`shop/settings-lib.php:4,8`). Тот же предохранитель — `pimLegacyWrite`/`pimAssertLegacyModels` (`api/lib.php:245-259`), `api/kits.php:5,13`.

| Тело | `pim_legacy_sync` | v3 | Ответ |
|---|---|---|---|
| с `contract_version` | любое | выкл | 409 `CONTRACT_V3_NOT_ENABLED` (`api/index.php:33-35`) |
| без | ≠`true` | любое | 409 `LEGACY_SYNC_DISABLED` (`api/index.php:37`) |
| без | `true` | вкл | 409 `CONTRACT_V3_REQUIRED…` без `error_code` (`api/index.php:38`) |
| без | `true` | выкл | legacy; запись в модель v3 → 409 `CONTRACT_V3_REQUIRED`, откат (`api/lib.php:245-251`) |

---

### 1.7 Приватный контракт `rubizh-pim-private-costs/1`: себестоимость для CRM (stage 5, OD-4.1)

Решение владельца OD-4.1 (2026-10-16): себестоимость для CRM «Валовий прибуток» берётся из PIM. Контракт **приватный**: отдельный от публичного каталога (`contracts/pim-v3/2`, `products[]`), публичные ответы его не содержат (`catalog_public_data` срезает cost/payout-ключи). Описание — `contracts/pim-private-costs/1/README.md`; схема — `schema.json`; фикстура `fixture.json` — точный вывод экспортёра PIM на синтетическом каталоге (копия PIM `app/contracts/fixtures/pim-site-private-costs-v1.exact.json`).

**Запрос.** `POST /api/pim/costs`, `Authorization: Bearer <pim_key | pim_key_next>`, `Content-Type: application/json`. Тело ≤ 2 МБ, строк ≤ 20 000.

| Поле | Тип / правило |
|---|---|
| `private_contract` | `"rubizh-pim-private-costs"` (const) |
| `version` | `1` (const) |
| `currency` | `"UAH"` (const) |
| `generated_at` | `YYYY-MM-DDTHH:MM:SS(.mmm)Z`, UTC |
| `revision` | hex, 8–64 символов |
| `costs[]` | уникальные строки `{sku, supplier_payout_minor}`; лишние ключи запрещены |
| `costs[].sku` | `^[A-Za-z0-9._-]{1,64}$`, без дубликатов |
| `costs[].supplier_payout_minor` | целое 0…10 000 000 000 (копейки) |

**Ответы.**

| Код | `error_code` | Условие |
|---|---|---|
| 200 | — | `{ok:true, private_contract, version:1, stored:N}`; запись upsert в `rubizh_crm_sku_costs(sku, cost_minor, source='pim', observed_at)` одной транзакцией |
| 401 | — | неверный ключ (счёт по сети, см. 1.1) |
| 409 | `STALE_BATCH` | пришла пакетная выгрузка старее уже принятой (`generated_at` сравнивается с `meta.pim_costs_generated_at`); ничего не пишется. Повтор той же или более новой выгрузки — штатно |
| 409 | `CRM_SCHEMA_MISSING` | нет таблицы `rubizh_crm_sku_costs` (миграция CRM не применена) |
| 413 | `TOO_LARGE` или без кода | тело больше 2 МБ |
| 422 | прочие причины | нарушена схема (неизвестный ключ, дубликат SKU, отрицательное или нецелое значение, лишние строки); ничего не пишется |

Правила: строки батча **не удаляются** (заказы сохраняют свою себестоимость); тело запроса не логируется; ответ с ошибкой — `Cache-Control: no-store`.

**Кто видит.** Только CRM, `dashboard.finance`: OWNER и ACCOUNTANT (`contracts/crm/crm-api.json`). Формула валовой прибыли не меняется: при отсутствии себестоимости хотя бы у одного проданного SKU показатель не считается («Немає даних собівартості від PIM», [05-CRM_ANALYTICS_FORMULAS](../crm/05-CRM_ANALYTICS_FORMULAS.md)).

**Тесты.** SITE `tests/stage5-pim-costs.test.mjs` (контракт на точной фикстуре, роли × поля, каждый публичный endpoint без себестоимости, STALE_BATCH); PIM `app/tests/stage5-private-costs.test.cjs` (вывод экспортёра = фикстура, wire не изменён).

### 1.8 Резервные копии PIM на сайте: `/api/pim/backup`, `/api/pim/backups` (stage 5, 5-4)

PIM отправляет свою копию данных сайту, чтобы она не существовала только в IndexedDB браузера оператора. Копии хранятся в приватной папке `pim_backup_dir` вне публичного корня (по умолчанию `../../private/pim-backups`; папка внутри webroot отклоняется с 500; в папку пишется `.htaccess` с `Require all denied`). Хранятся 14 новейших копий (`pim_backup_keep`), лишние удаляются; копии, брошенные незавершённой загрузкой, удаляются при очистке.

**`POST /api/pim/backup`** (ключ PIM, `Authorization: Bearer`):

| Заголовок / тело | Правило |
|---|---|
| `X-Backup-SHA256` | обязателен, 64 hex (SHA-256 тела); иначе 422 `INVALID_SHA256` |
| `X-Backup-Label` | необязательный, URL-кодирован, ≤ 80 символов, без управляющих символов; иначе 422 `INVALID_LABEL` |
| тело | gzip (магия `1f 8b`) с JSON-копией; ≤ `pim_backup_max_bytes` (64 МБ по умолчанию), распакованный размер ≤ 4× лимита |

Ответ 200: `{ok:true, id, size, sha256}`, `id` вида `pim-YYYYMMDDTHHMMSSmmmZ-xxxxxxxxxxxx`.

| Код | `error_code` | Условие |
|---|---|---|
| 413 | `TOO_LARGE` | тело или распакованные данные больше лимита |
| 422 | `NOT_GZIP`, `SHA256_MISMATCH` | тело не gzip или не совпадает с `X-Backup-SHA256` |
| 422 | `SECRET_IN_BACKUP` | в копии найден ключ PIM (`pim_key`, `pim_key_next`) или `cron_key`; копия не сохраняется |
| 429 | `TOO_MANY_BACKUPS` | больше 30 загрузок за час (общий счётчик `pim-backup`) |

**`GET /api/pim/backups`** (ключ PIM): `{ok:true, keep, backups:[{id, at, size, sha256, label}]}`, новейшие первыми, `Cache-Control: no-store`.

**`GET /api/pim/backups/{id}`** (ключ PIM): точный файл `application/gzip`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. Неверный `id` или отсутствующая копия — 404 «Копію не знайдено». Копия не попадает в публичные маршруты, CORS разрешает заголовки `X-Backup-Sha256` и `X-Backup-Label` только для `pim_origins`.

**Тесты.** SITE `tests/stage5-pim-backup.test.mjs` (checksum, gzip, ключ внутри копии, лимит размера, точная выдача, папка внутри webroot отклоняется).

---

## 2. SITE ↔ CRM (Staff API `/api/staff/*`)

### 2.1 Транспорт, сессия, CSRF, лимиты

| Аспект | Контракт | Ссылка |
|---|---|---|
| Маршрут | `/api/staff/*` → `api/staff/index.php` | `api/index.php:7` |
| Конверт | `{ok:true,data,meta:{request_id,csrf}}` / `{ok:false,error:{code,message,details},meta}` | `api/staff/index.php:4,36` |
| HTTPS | обязателен (403 `HTTPS_REQUIRED`), кроме loopback при `environment=staging` | `staff/bootstrap.php:13` |
| Cookie | `rubizh_staff`, `path=/api/staff`, `Secure`, `HttpOnly`, `SameSite=Strict`, `use_strict_mode` | `staff/bootstrap.php:14` |
| Срок сессии | 8 ч абсолютный, 30 мин простоя; отзыв `session_version` | `staff/auth.php:11-13` |
| Вход | `POST /auth/login {email,password,csrf,rate_proof?}`; 8 неудач/15 мин на IP+email → 428 `CHECK_REQUIRED` (PoW) | `staff/auth.php:23-33` |
| CSRF | `meta.csrf` → поле `csrf` во всех не-GET; `Origin` должен совпасть с `Host` | `staff/auth.php:21-22`; `api/staff/index.php:12` |
| Лимиты | 240 запросов / 60 с (429 `RATE_LIMITED`); тело ≤64 КБ (413) | `api/staff/index.php:8-9` |
| Схема | `meta crm_schema≠1` → 503 `STAFF_SCHEMA_REQUIRED`; миграция только CLI | `staff/bootstrap.php:15`; `staff/schema.php:22-33` |
| Клиент CRM | `fetch("/api/staff"+path,{credentials:"same-origin"})`, csrf из `meta`, 401 → `crm-auth-required`, `requestId` 32 hex | `src/api.ts:227-256` |

### 2.2 Роли и права

`crmPermit` (таблица `rubizh_staff_permissions`, `staff/auth.php:14,16`) + `shopRequirePermission` (код, `shop/financial-permissions.php:5-14,32-44`).

| Право | OWNER | MANAGER | LOGISTICS | READ_ONLY |
|---|---|---|---|---|
| просмотр (`order/customer/shipment/return/note/audit/report/payment.view, search, settings.view`) | + | + | + | + |
| `payment.invoice.create`, `payment.invoice.resend`, `order.confirm` | + | + | — | — |
| `shipment.manage` | + | — | + | — |
| `order.assign.self/any`, `order.cancel`, `return.create` | + | + | — | — |
| `note.create`, `return.transition` | + | + | + (`IN_TRANSIT/RECEIVED`, `staff/operations.php:29`) | — |
| `payment.refund.request`, `financial.audit.view` | + | — | — | — |
| `payment.refund.execute`†, `payment.manual_reconcile`†, `order.price_override`†, `order.total_override`† | + | — | — | — |
| `settings.manage`, `staff.manage`, `inventory.return` | + | — | — | — |

† step-up: вход не старше `max(60, staff_stepup_seconds ?? 900)` с (`shop/financial-permissions.php:38-43`). Для `settings.manage`/`staff.manage` step-up нет (CRM-SEC-FRESH-01, этап 4).

### 2.3 Эндпоинты (версия, идемпотентность, вызовы CRM)

| SITE | Право | Версия / идемпотентность | CRM |
|---|---|---|---|
| `GET /auth/session`, `POST /auth/login`, `POST /auth/logout` | — | — | `src/shell.tsx:86,123,200` |
| `GET /me` | сессия | — | не вызывается |
| `GET /dashboard` | `order.view` | — | `src/overview.tsx:52` |
| `GET /orders?…`, `GET /orders/{id}` | `order.view` | — | `src/orders.tsx:72,524` |
| `POST /orders/{id}/assign` | `order.assign.self/any` | `STALE_ORDER` (`staff/operations.php:8-11`) | `src/orders.tsx:648` (только себя) |
| `POST /orders/{id}/confirm` | `order.confirm` | `STALE_ORDER` (`:12-15`) | `src/orders.tsx:598-604` |
| `POST /orders/{id}/resolve-item` | `order.confirm` | `STALE_ORDER` | ветка есть, кнопки нет |
| `POST /orders/{id}/cancel` | `order.cancel` | `STALE_ORDER` | `src/orders.tsx:704` |
| `POST /orders/{id}/invoice` | `payment.invoice.create` | `STALE_ORDER`; нужен `CONFIRMED` (409 `CONFIRMATION_REQUIRED`); открытый счёт возвращается тот же (`shop/mono-lib.php:30`) | `src/orders.tsx:665` |
| `POST /orders/{id}/manual-reconcile` | `payment.manual_reconcile`† | `STALE_ORDER` | `src/orders.tsx:605-606,710` (риск R-C1) |
| `POST /orders/{id}/note` | `note.create` | `request_id`; иное тело → 409 `IDEMPOTENCY_CONFLICT` (`staff/operations.php:4-7`) | `src/orders.tsx:459` |
| `POST /orders/{id}/shipments` | `shipment.manage` | `request_id`=`operation_key`; нужен `PAID/PARTIALLY_REFUNDED` (`:43-49`) | `src/orders.tsx:580-597` |
| `GET /customers[/{id}]`, `POST /customers/{id}/note` | `customer.view`/`note.create` | `request_id` | `src/sections.tsx:116,218,247` |
| `GET /payments\|shipments\|returns[/{id}]` | `*.view` | — | `src/sections.tsx:51-56,453,627,782` |
| `POST /payments/{id}/refund` | `payment.refund.execute`† | `idempotency_key=request_id`; версия при новом ключе (`api/staff/index.php:26`, `staff/refunds.php:10-24`) | `src/sections.tsx:457-462` |
| `POST /shipments/{id}/create\|refresh\|reconcile\|cancel` | `shipment.manage` | `STALE_ORDER` | `src/sections.tsx:633-635` |
| `POST /returns`, `POST /returns/{id}/transition` | `return.create`/`return.transition` | `request_id` + `STALE_ORDER` (`staff/operations.php:21-36`) | `src/orders.tsx:546,579`; `src/sections.tsx:792-810` |
| `GET /audit`, `GET /reports`, `GET /search`, `GET /settings` | `*.view` / `search` | — | `src/sections.tsx:1001,1105`; `src/overview.tsx:206`; `src/shell.tsx:445` |
| `PUT /settings/senders/{code}`, `POST/PUT /settings/staff[/{id}]` | `settings.manage`/`staff.manage` | `STALE_ORDER` по `version`/`session_version`; `LAST_OWNER_REQUIRED` | `src/sections.tsx:1204-1309` |

**Версия заказа.** `sha256(json({order, shipments, invoices, refunds, returns, note_id}))` (`staff/read.php:40,42`); `hash_equals`, иначе 409 `STALE_ORDER` с `details.current_version` (`:50`); мутации под `npLocked`. CRM перечитывает заказ (`src/orders.tsx:556-558`); остаточный риск — CRM-FE-01 (этап 4).

**Второй канал SITE** (старые формы менеджера, сессия покупателя): роль `shop/financial-permissions.php:15-31`, версия `updated_at`; без `expected_updated_at` → 409 `STATE_REQUIRED`, расхождение → 409 `STATE_CHANGED` (`shop/financial-actions.php:15-19`; `shop/mono-lib.php:193-202`). Только здесь: `invoice.resend`, `invoice_not_created`, `npResolveUnknown` (`shop/np-fulfillment.php:204-234`).

### 2.4 Коды ошибок Staff API

| Код | HTTP |
|---|---|
| `AUTH_REQUIRED`, `LOGIN_FAILED` | 401 |
| `CHECK_REQUIRED` | 428 |
| `CSRF_INVALID`, `HTTPS_REQUIRED`, `PERMISSION_DENIED` | 403 |
| `RATE_LIMITED` | 429 |
| `PAYLOAD_TOO_LARGE` | 413 |
| `NOT_FOUND` | 404 |
| `STAFF_SCHEMA_REQUIRED`, `SERVICE_UNAVAILABLE` | 503 |
| `INVALID_*` (JSON, REQUEST_ID, NOTE, ASSIGNEE, RETURN_LINES, TRACKING_NUMBER, INVENTORY_DECISION, PROFILE, NP_REF, REFUND_AMOUNT, STAFF, PAGINATION, DATE, PERIOD), `SEARCH_TOO_LONG` | 400 |
| `STALE_ORDER`, `IDEMPOTENCY_CONFLICT`, `CONFIRMATION_REQUIRED`, `PAID_ORDER_REQUIRED`, `RETURN_*`, `ZERO_VALUE_PHYSICAL_RETURN`, `INVALID_STATE_TRANSITION`, `INVENTORY_DECISION_REQUIRED`, `REFUND_*`, `SENDER_PROFILE_INCOMPLETE`, `LAST_OWNER_REQUIRED`, `VERIFIED_PAYMENT_REQUIRED`, `PROVIDER_RESULT_UNKNOWN`, `PROVIDER_STATE_CONFLICT`, коды `ShopOrderConflict` | 409 |
| `DOMAIN_CONFLICT` (прочие исключения; текст исключения в `message` — CRM-PHP-01) | 409 |

Источники: `staff/auth.php`, `staff/bootstrap.php`, `staff/operations.php`, `staff/refunds.php`, `staff/read.php`, `staff/reports.php`, `api/staff/index.php:8-36`.

**Сверка CRM ↔ SITE.** Вызовов CRM к несуществующим эндпоинтам SITE нет. В SITE есть, CRM не использует: `GET /me`, `resolve-item`, назначение другому сотруднику. В Staff API не выведены: `invoice.resend`, `invoice_not_created`, `npResolveUnknown`.

---

## 3. SITE ↔ провайдеры

### 3.1 MonoPay

| Аспект | Контракт | Ссылка |
|---|---|---|
| Исходящие | `https://api.monobank.ua/api/merchant/` + `X-Token` (env `RUBIZH_MONO_TOKEN` / `mono_token`), TLS-проверка, без редиректов, 5/20 с; не-200 = неизвестный результат | `shop/mono-lib.php:9-15` |
| Методы | `invoice/create` (копейки, `ccy:980`, `validity:3600`) `:36`; `invoice/status` `:65,143,179,214`; `invoice/remove` `:141`; `invoice/cancel` `:207`, `staff/refunds.php:21`; `pubkey` `:53` | `shop/mono-lib.php` |
| Флаги | `monoConfigured()` = `mono_activation_confirmed===true` + токен (`:4`); mock только `mono_mock===true` + `environment==='staging'` + не production Host (`:3`, ARCH-10); `pageUrl` только `pay.mbnk.biz`/`pay.monobank.ua` (`:20`) | — |
| Webhook | `POST /shop/mono-webhook.php`; не POST 405, >64 КБ 413, нет/битый `X-Sign` 403; `openssl_verify(SHA256)`; ключ перечитывается ≤1 раз/60 с; 180 запросов/мин | `shop/mono-webhook.php:5-6`; `shop/mono-lib.php:39-57` |
| Ответы | применено 200; подписано, но неприменимо — 200 `{parked:true}` + аудит; неизвестный счёт/ошибка БД — 503 (банк повторит) | `shop/mono-lib.php:62-70,86-88` |
| Повторы/порядок | `event_hash=sha256(raw)` `INSERT IGNORE`; финальные статусы не откатываются; устаревший `modifiedDate` игнорируется; `cancelList` проверяется целиком | `shop/mono-lib.php:71-110` |
| Деньги | статус меняет только подписанный webhook; восстановление при потерянном webhook — `awaiting_webhook` + 900 с + `success` + совпадение `reference`; попытка без `invoice_id` старше 900 с → `failure` (R5) | `shop/mono-lib.php:89-104,151-185` |
| Воркер | CLI; 2×25 + 10 `awaiting_webhook` | `shop/mono-worker.php`; `shop/mono-lib.php:187-192` |
| Возврат покупателя | не подтверждает оплату | `shop/payment-return.php:18-19` |
| Тестовые подмены | `RUBIZH_MONO_TESTS` + `mono_test_transport`; staging-mock `shop/mono-mock.php:5-20` | — |

### 3.2 Нова пошта

| Аспект | Контракт | Ссылка |
|---|---|---|
| Транспорт | `POST https://api.novaposhta.ua/v2.0/json/` `{apiKey, modelName, calledMethod, methodProperties}`; 5/25 с; ключ env `RUBIZH_NP_API_KEY` / `nova_poshta_api_key` | `shop/np-lib.php:74-92` |
| Результаты | 429 → `NpRateLimited`; не-200/битое → `NpUnknownResult` (запись не повторяется); `success≠true` → `NpRejected` (ключ маскируется) | `shop/np-lib.php:85-90` |
| Флаги | ТТН только `np_ttn_enabled===true` (`shop/np-fulfillment.php:120`); карта — `np_card_payment_verified===true` или `monoConfigured()` (`:126`); COD запрещён (`:128`) | `api/config.sample.php:30-38` |
| Неизвестный результат ТТН | `unknown`, повтор заблокирован; сверка по маркеру `RB-<operation_key>` (R6); «не создана» — только владельцем после полной сверки старше 2 ч | `shop/np-fulfillment.php:163-245` |
| Трекинг | только вперёд, терминальные залипают | `shop/np-fulfillment.php:250-273` |
| Подмена | `RUBIZH_NP_TESTS` + `np_test_transport` | `shop/np-lib.php:77` |

### 3.3 TurboSMS

`smsEnabled()` = `sms_enabled===true` + `auth_secret`≥40 + `turbosms_token` + `turbosms_sender` (env-переопределения `RUBIZH_SMS_ENABLED`, `RUBIZH_TURBOSMS_*`; `auth/identities.php:5-33`; по умолчанию выключено). `POST https://api.turbosms.ua/message/send.json`, Bearer, `sequence_id`, без автоповтора; успех — `turboSmsAccepted` (`auth/phone.php:33-55`). Подмены: `RUBIZH_SMS_TESTS` + `sms_test_transport`.

### 3.4 Почта и Telegram

SMTP `smtps://mail.adm.tools:465`, пароль `noreply_password` / env `RUBIZH_NOREPLY_PASSWORD`, TLS-проверка (`auth/mailer.php:27-41`). Очереди `rubizh_order_mail`, `rubizh_buyer_mail` (≤5 попыток, 5 мин), напоминания о корзине. Telegram `sendMessage` при валидных `tg_bot_token` + `tg_chat_id`, `sent_parts` от дублей (`shop/notifications.php:18-32`).

### 3.5 DEFERRED → этап 6

Живые банк/НП/SMS/почта/OAuth и сквозной провайдерский E2E не выполнялись (PASS не заявляется): `invoice/remove` на `failure` (RV-4), `cancelList` в `success` (FPAY-03), реальная подпись monobank, живая ТТН, доставка TurboSMS/SMTP/Telegram. См. [PRE_LAUNCH_BLOCKERS](PRE_LAUNCH_BLOCKERS.md#pl-4) PL-4.

---

## 4. Тесты, покрывающие контракты

Зелёные на финальном SHA RC1 — см. Quality Gate в `docs/release-hardening/STAGE_CHECKPOINT.md`.

**PIM → SITE:** `pim-v3-sync.test.mjs` («status advertises contract 3 only when enabled…», «exact PIM wire ingests atomically…», «absence is not hide…», «invalid model rejects the whole batch…», «HIDDEN or ARCHIVED…»); `pim-v3-foundation.test.mjs` (закреплённая схема, URL фото, UAH, публичный whitelist); `pim-v3-checkout.test.mjs` (IN_STOCK, UNKNOWN/OUT_OF_STOCK, смешанная корзина, смена цены); `q4-v3-preorder.test.mjs`; `pim-v3-enable.test.mjs`; `stage2b-legacy-boundaries.test.mjs` (R1). PIM-сторона (`pim.rubizh/app/tests/`): `final-workflow.test.cjs` («wire envelope…», «publisher refuses without negotiated contract v3», «publisher sends the exact wire…», «incomplete ACK is not recorded…», «committed exact wire fixture is byte-identical…»), `model-colors.test.cjs`; SITE в них — мок.

**SITE ↔ CRM:** `crm-security`, `crm-domain`, `crm-confirmation`, `crm-shipping`, `crm-browser` (собранный `crm.rubizh/dist`; в CI закреплён `ref: b0e2f93`), `crm-performance`, `crm-migration`, `q5-manager-rbac`, `p0-integration`, `staff-email-trust`, `idor-orders`, `stage2-r9-*`.

**MonoPay:** `mono-webhook-contract`, `stage2b-payment-recovery`, `stage2b-payment-deadline`, `q7-payment-readiness`, `p0-integration`, `order-idempotency`, `stage2-r9-auth-csrf`. **НП:** `np-setup`, `stage2-r6-logistics`, `crm-shipping`. **SMS/почта:** `sms-protection`, `automation`.

**Обновление поверх production и откат:** `rc1-upgrade-rollback.test.mjs` (этап 3, п. 4.4).

**Не покрыто тестом:** 409 `CONTRACT_V3_REQUIRED` из `api/index.php:38`; `POST /orders/{id}/manual-reconcile` Staff API; `/pim/categories`, `/pim/cache-clear`.

---

## 5. Известные расхождения и риски

| # | Наблюдение | Доказательство |
|---|---|---|
| R-P1 | `wire.schema.json` в runtime SITE не применяется (`pim_version`, `generated_at`, `category_catalog_hash` не проверяются) | `shop/pim-v3-sync.php:34-49`; PIMC-08 |
| R-P2 | Отклонённый пакет нельзя повторить с тем же `batch_id` (409 `BATCH_REJECTED`); PIM строит `batch_id` из содержимого — после исправления на стороне SITE нужен новый контент | `shop/pim-v3-sync.php:252,268`; `final-workflow.inc.js:229` |
| R-P3 | PIM при отказе показывает только `error`, разбивку `results[].errors` не сохраняет | `final-workflow.inc.js:213` |
| R-P4 | Ответ `api/index.php:38` без `error_code`, тестом не покрыт | `api/index.php:10,35,38` |
| R-P5 | Хеш точной wire-фикстуры помечен устаревшим (PIMC-C1, PIM OWNER DECISION) | `contracts/pim-v3/2/manifest.json:9` |
| R-P6 | Открытые PIMC-01/02/03/04/05/07/11, PIMC-P2/P3/P4 | `03-DEFECT_REGISTER.md` |
| R-P7 | `stage-2/00-SYSTEM_MAP.md:234` утверждает, что флага отключения legacy нет — устарело (`api/lib.php:235-237`) | — |
| R-C1 | CRM в ручной сверке отправляет `invoice_id` последнего платежа; для попыток `creating/unknown` без банковского id это, вероятно, всегда отказ. **Кандидат, не подтверждён тестом** → этап 4 ([KNOWN_ISSUES](KNOWN_ISSUES.md)) | `src/orders.tsx:605-606`; `shop/mono-lib.php:31,36-37,212-215` |
| R-C2 | Просроченный step-up превращается в общий «Недостатньо прав», причина не видна CRM | `shop/financial-permissions.php:42`; `api/staff/index.php:36` |
| R-C3 | Права в БД заполняются `INSERT IGNORE`: изъятие права в коде не удалит его из мигрированной БД (денежные права дополнительно проверяются кодом) | `staff/schema.php:30`; `staff/auth.php:14,16` |
| R-C4 | CRM-SEC-FRESH-01, CRM-PHP-01, ARCH-12, ARCH-08, CRM-FE-01 — этап 4 | `03-DEFECT_REGISTER.md` |
| R-X1 | Mock MonoPay частично зависит от Host (ARCH-10); webhook принимается при `monoConfigured()=false` | `shop/mono-lib.php:3`; `shop/mono-webhook.php:5-6` |
| R-X2 | Провайдеры проверены только моками — DEFERRED → этап 6 | `STAGE_CHECKPOINT.md` |
