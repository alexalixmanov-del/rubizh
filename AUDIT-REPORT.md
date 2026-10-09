# РУБІЖ SITE — аудит перед интеграцией PIM Contract v3

Дата: 2026-10-09 UTC. Этап: **AUDIT + PLAN**, без реализации. Review-ветка: `review/site-pim-v3-audit-2026-10-09`.

## Основания и границы проверки

| Источник | Зафиксированная версия | Что установлено |
|---|---|---|
| SITE `origin/main` | `0e7dafa39e632690220d5d93669e571254286388` | Предыдущая Reclassification v2; pricing commit не является его предком |
| SITE pricing / база review | `bee58327e859efb618faea3631229de3fd3c1e39` | Ветка `feature/shop-pricing-policy-v1`; 20 файлов отличаются от main |
| PIM production release | `27fb26056563eb1fcf144ffdb2ba9ab264fa9313` | Изучены schema, server-contract, classification export, colors, inventory, pricing |
| Принятый PIM RC | `440aa60ee42795ba8bf5167d8121470a5a56aab3` | Отдельный закреплённый RC; не заменяет production baseline |

Проверка diff RC→release по contract inputs: schema, server-contract, canonical-categories и inventory-policy идентичны; classification-ui/production-ui менялись. Выводы об exporter/network boundaries сделаны по production release, не подставлены из RC.

Ссылки на базы: [SITE main](https://github.com/alexalixmanov-del/rubizh/commit/0e7dafa39e632690220d5d93669e571254286388), [SITE pricing](https://github.com/alexalixmanov-del/rubizh/commit/bee58327e859efb618faea3631229de3fd3c1e39), [PIM release](https://github.com/alexalixmanov-del/pim.rubizh/commit/27fb26056563eb1fcf144ffdb2ba9ab264fa9313), [PIM RC](https://github.com/alexalixmanov-del/pim.rubizh/commit/440aa60ee42795ba8bf5167d8121470a5a56aab3).

Ниже SITE означает код базы pricing, если явно не указано main. Git history проверена, наличие этого кода на хостинге **не установлено**. Production DB, HTTP sync, платежи, публикация, массовые операции и DDL не запускались. Это аудит исходников и контрактов, а не новый production E2E, нагрузочный тест или миграционный dry-run реальной БД. Нулевые LOST_* ниже являются будущими критериями допуска, а не результатом выполненной миграции.

В рабочей папке уже были неотслеживаемые `dev/export-model-migration-source.php`, `dev/plan-model-migration.php`, `shop/model-migration.php`, `tests/model-migration.test.mjs`, `docs/MODEL-MIGRATION-20261008.md`. Они не входят в baseline или этот commit; их нельзя считать реализованной миграцией.

## Вывод и блокирующие расхождения

**Автоматическое подключение PIM v3 сейчас недопустимо.** Сайт имеет полезную основу pricing/checkout/security, но работает с PRODUCT → FLAT VARIANTS. Сам PIM release блокирует `/pim/sync`: `app/lib/classification-ui.inc.js:7,10`, экспорт feed содержит `sync_enabled:false`. Объявление capabilities не должно обходить этот предохранитель.

| ID | Приоритет | Доказательство в исходниках | Последствие и обязательное действие |
|---|---|---|---|
| G01 | BLOCKER | `api/index.php:75`, `app/server-contract.md:7` | SITE подтверждает только pricing v1, не contract/order/inventory/category/size v3. Не включать sync до полной реализации и staging проверки |
| G02 | BLOCKER | PIM `simple-ui.inc.js:88–95`, `model-colors-ui.inc.js:57`, `classification-ui.inc.js:269–276`; SITE `api/lib.php:241–251` | Wrapper v3 заменяет весь `variants` через `Object.assign`. Нормализованный вариант содержит `price`, но теряет variant `pricing_policy_version`, `minimum_sale_price`, `kit_price`, `wholesale` из предыдущего payload. С root pricing v1 сайт отвергнет такой SKU. Без root pricing v1 защита скидок не подключится. Нужен реальный экспорт v3 с сохранённым pricing v1; SITE не вычисляет эти поля за PIM |
| G03 | BLOCKER | `shop/canonical-taxonomy.json`, PIM `app/categories/canonical-categories.json`, schema enum | В файле SITE 136 active ID; в PIM 143. SITE-only 42, PIM-only 49, совпадают 94. Разница не сводится к добавлению семи строк. Exact ID set, parents/names и explicit mapping обязательны; сходство названий не даёт права переименовать категорию |
| G04 | BLOCKER | `api/lib.php:156,229`; `shop/catalog-lib.php:18`; `assets/shop-client.2026100803.js` (`Nt`) | Flat variants, текстовый color, legacy availability in/order/out. Structured ownership MODEL/COLOR/SKU, опции без SKU, галереи и полный статусный контракт отсутствуют в исполняемой модели |
| G05 | BLOCKER | `shop/store-lib.php:84–87` | Возраст `products.synced_at` > 48h блокирует checkout. Противоречит warning-only freshness PIM. Удалить возраст как business gate для v3; оставить explicit `expires_at` |
| G06 | BLOCKER | `shop/order.php`; `shop/order-lifecycle.php:10`; `shop/mono-lib.php:15`; `shop/np-fulfillment.php:85` | Каждый заказ создаётся new/pending; оплата доступна только после manager confirmation. Нет immediate payment для подтверждённого IN_STOCK. Manager/invoice не перепроверяют полный свежий MODEL/COLOR/SKU contract |
| G07 | BLOCKER | `api/index.php:47–53` | Full/finalize/all_ids скрывает отсутствующие карточки. Новый контракт допускает только explicit HIDE/UNPUBLISH/hide_ids; отсутствие в экспорте не является скрытием |
| G08 | HIGH | `api/lib.php:403`; `shop/catalog-lib.php:45,71`; `shop/kit-data.php`; `sitemap.php:9` | Нет единого условия zero usable photos; наличие строки photos ≠ доступное изображение. Catalog/product/related/kits/sitemap нужно фильтровать одинаково, не архивируя товар |
| G09 | HIGH | `api/lib.php:206–209`; PIM `model-colors-ui.inc.js:6–14`, `classification-ui.inc.js:273` | Public sanitizer — blacklist. PIM colors содержат `sources` с supplier_id/supplier_sku; publicOnly не удаляет весь sources. SITE blacklist не покрывает supplier_id и provenance целиком. До выдачи v3 нужен whitelist публичного DTO, private storage и тесты утечек |
| G10 | HIGH | `api/lib.php:252–255,285–316` | SKU ownership check полезен, но разрешённого mapping-transfer нет. Замена вариантов/позиционных photos не годится для lossless merge; sync также очищает private fulfillment при hide. Сохранить историю и ссылки, переносить только по подтверждённому mapping |
| G11 | HIGH | `shop/mono-lib.php:51,65,71`; `shop/payment-return.php` | Подписанный webhook защищён; server bank status refresh/reconcile тоже вызывает payment reducer. Возврат браузера сам по себе не paid. Однако заданное правило «webhook — единственный источник online paid» требует запретить paid transition из refresh; bank reconcile оставлять диагностикой, если правило не изменено владельцем |
| G12 | HIGH | `shop/units.php`, `shop/taxonomy.php:91`, `shop/reclassification-v2.php`, `shop/catalog-lib.php:179`, frontend `storeSlot/storeSizeMissing` | SITE повторно определяет категории, размерность, цвет, модель и сезон по тексту. На v3 пути эти механизмы отключить; legacy адаптер не должен менять PIM-данные |
| G13 | HIGH | `shop/order-lifecycle.php:31–35` | Резервы учитываются для pending/failed/cod, но не paid. Нужно доказать отсутствие повторной продажи между оплатой и новым фидом; paid allocation нельзя просто отпускать без учёта расхода. TTL не менять |
| G14 | HIGH | `shop/kit-data.php`, `api/kits.php`, `shop/pricing-policy.php:74` | Exact SKU/qty pricing уже защищены; подбор всё ещё эвристический. PIM kit_validation/allowed_skus/hash ACK не реализованы. Нельзя заявлять kit capability только из-за существования sync_kits |

G02 и G09 — выводы статического анализа ветвей экспортера, не утверждение о содержимом уже переданного production пакета. Текущий catalog DTO возвращает ограниченный набор полей, а product API выдаёт очищенный raw variant JSON; root colors сейчас не выдаются этим DTO. Риск G09 возникает при приёме приватных nested bindings или добавлении colors в публичный ответ без whitelist; факт утечки данных production этим аудитом не установлен. Перед реализацией нужен локальный реальный export pinned PIM и проверка wire payload. PIM на этом этапе не изменяется.

## CURRENT_ARCHITECTURE

```mermaid
flowchart LR
 P[PIM legacy payload] --> S[POST /api/pim/sync]
 S --> D[(products + variants + photos)]
 D --> A[/api/catalog и /api/product/slug]
 D --> R[storefront.php SSR]
 A --> F[shop-client Nt: flat size/color keys]
 R --> F
 F --> C[cart: product_id + SKU + qty]
 C --> Q[checkout-quote.php: current pricing]
 Q --> O[order.php: new/pending + items_json]
 O --> M[npConfirm: manager confirmation]
 M --> I[monoCreate: invoice]
 I --> W[signature webhook / server refresh]
 W --> H[payment_status + receipts + mail]
```

| Область | Реальные routes/files/functions | Хранение/граница |
|---|---|---|
| API routing/auth | `api/.htaccess`, `api/index.php`, `require_pim`, `body`, `cors`, `rubizhHeaders` в `api/lib.php` | Bearer для PIM; публичные reads имеют runtime gate/budget. DB bootstrap способен выполнять миграции, поэтому GET не считать гарантированно read-only |
| PIM status/sync | `api/index.php`: GET `/api/pim/status`, POST `/api/pim/sync`, GET `/api/pim/categories` | meta, sync_log; per-request transaction, category advisory lock; нет batch lifecycle/hash contract v3 |
| Product/SKU writes | `api/lib.php`: `save_product`, `clean_avail`, `unique_slug`, `hide_products` | products / variants; SKU глобально уникален; product hash даёт unchanged, но не заменяет batch idempotency |
| Taxonomy | `shop/taxonomy.php`: `shopTaxonomySyncValidate/SyncProduct/Resolve/Predicate/Categories/Redirect`; `shop/reclassification-v2.php`; `shop/taxonomy-semantic-v2.php` | legacy categories + rubizh_canonical_categories/product_categories/category_aliases/category_decisions; explicit canonical IDs сосуществуют с text reclassification и manual locks |
| Photo ingestion | `/api/pim/photos`, `/api/cron/photos`, `api/lib.php`: `process_photos`, `fetch_to_webp`, `product_photos`; `api/photo-storage.php`, `api/photo-status.php`, `shop/photo-worker.php` | product-scoped photos, local WebP/thumb/cache; fallback supplier URL при отсутствии usable local file |
| Catalog/product | `/api/catalog`, `/api/product/{slug}`, `/api/storefront`; `shop/catalog.php`, `shop/catalog-lib.php`: `shopCatalogBuild`, `shopProduct`, `shopProductsByIds`, `shopVariantRows` | counts по product rows, legacy buyability, текстовые size/color/brand, поиск name/SKU; не DISTINCT model_id |
| Cache | `shop/cache-worker.php`, `api/perf.php`: `shopCatalogVersion/CacheGet/CachePut/Cached`, `shop/kit-data.php`, runtime asset | Текущий cache key: catalog_updated + MAX(photos.updated_at) + hide_unavailable + v5; stale public copy до 5 минут. Добавить contract/taxonomy/media revision и hard gate после hide/zero-photo; existing cache не используется для payment authorization |
| Product UI/cart | `index.html`, `assets/shop-client.2026100803.js`: `Nt`, `storeProductSizeKeys`, `storeVariantChoice`, `storePricingLines` | Flat keyed variants; display size dedup не заменяет выбор конкретного SKU. Cart содержит product/SKU; стабильного color_id нет |
| Checkout/order | `/shop/checkout-quote.php`, `/shop/order.php`, `shop/store-lib.php`: `shopResolvedLines`, `shopCsrf`, `shopLimit`, `shopMayReadOrder` | Серверная текущая цена/принадлежность SKU, qty, reservations, quote revision; checkout request id + scope/payload hash |
| Order items | `shop/order.php`, `auth/account.php`, `shop/np-fulfillment.php`: `npLines` | Исторический снимок в rubizh_customer_orders.items_json; отдельной универсальной таблицы order_items нет. Fulfillment lines не являются полным retail snapshot |
| Pricing/promo | `shop/pricing-policy.php`: `shopMoney`, `shopPricingPolicy/Store/Read/Unit/KitComposition`; `shop/pricing.php`; quote/order endpoints | DECIMAL + integer kopecks; private rubizh_catalog_pricing; server grants для wholesale; нет права вычислять закупку или скидку из названия |
| Kits | `/api/storefront`, `api/kits.php`: `sync_kits`; `shop/kit-data.php`: `shopStorefrontBuild`, `shopKitResolve`; `shop/kit-catalog.php` | meta.site_kits + SKU/qty composition; regex roles/seasons/budget; model-level related compatibility не авторитет PIM |
| Reservations | `shop/order-lifecycle.php`: `shopReserveLines`, `shopReservedQty`, `shopEnsureTiming`, `shopStartPaymentTiming` | rubizh_stock_reservations; numeric stock only; сроки в order_timing |
| Manager/NP | `shop/np-manager.php`, `shop/np-fulfillment.php`: `npConfirm`, `npLocked`, `npAssertReady`, `npCreate`, `npAggregateOrder`; `shop/np-lib.php` | confirmations, fulfillment lines, shipments, audit; shipment transitions меняют legacy order status. Существующие отправители/склады/ТТН сохраняются; наложку не включать |
| MonoPay | `/shop/payment-start.php`, `/shop/payment-return.php`, `/shop/mono-webhook.php`, `shop/mono-lib.php`: `monoCreate/VerifySignature/ValidateEvent/ApplyEvent/Refresh/Reconcile` | invoices, unique references, event hashes; amount/currency validation, signature, order locks, unknown create outcome journal |
| Customer/account | `auth/bootstrap.php`, `auth/account.php`, `auth/identities.php`, `auth/phone.php`, `auth/account-view.php`, `auth/account-ui.js` | accounts/identities/account_orders/customer_orders; guest order сохраняется. OTP proof уже предусмотрен; нельзя выдавать доступ по одному введённому phone |
| Favorites/recommendations | `shop/customer.php`, `shop/store-lib.php`: `shopFavoriteIds`; `shop/catalog-lib.php`: `shopRelated/ModelKey` | favorites product_id; related удаляет похожие модели по name key, не explicit model identity |
| SEO/redirect | root `.htaccess`, `storefront.php`, `sitemap.php`, `feeds/feed.php`, `feeds/google.php`, `feeds/meta.php` | product slug canonical; category aliases 301; подтверждённого product→model redirect registry нет; SEO/feed legacy stock semantics |
| Receipts/mail | `shop/order-lifecycle.php`: `shopReceiptStage/OrderReceipt/QueueBuyerMail/SendBuyerMail`; `shop/customer-ui.php`: `shopCustomerStatus/OrderThumbs`; `auth/mailer.php`, `shop/cache-worker.php` | manager pending / payment pending / paid уже различаются частично; paid title и request language нужно согласовать; account thumbs берутся из current photos, поэтому historical media refs нужно сохранять; jobs не запускались |
| Theme/home | `assets/theme.js/css`, `shop/theme-bootstrap.php`, hero-theme assets, `index.html` | Сохраняются обе темы и баннеры; home goKit + goPicker ещё конкурируют; задача единственного CTA остаётся в плане |
| Schema/runtime | `api/lib.php`: `migrate`; `shop/store-lib.php`: `shopStoreDatabase`; `shop/taxonomy.php`: `shopTaxonomySchema`; `dev/prepare-runtime.php`; `shop/runtime.php` | schema4 в pricing против schema3 main; runtime marker 20261008-v1. Нельзя выпускать новые DDL автоматически в пользовательском запросе |

## PIM_V3_GAP_MATRIX

Полная машинная матрица: [PIM-V3-GAP-MATRIX.json](PIM-V3-GAP-MATRIX.json). Она содержит каждое объявленное свойство schema с required/enum/nullability, дополнительные фактические export fields и поля пользовательского контракта; раздельно фиксирует opaque JSON retention и исполненную семантическую поддержку.

`SUPPORTED` = проверяется и используется по контракту; `PARTIAL` = часть поведения уже есть; `MISSING` = нет исполняемой поддержки; `CONFLICT` = текущий код делает несовместимое действие. Само сохранение неизвестного поля в products.data/variants.data не означает SUPPORTED.

Ключевые группы: model/color ownership MISSING; full availability CONFLICT; warning-only stale CONFLICT; decimal price/SKU identity PARTIAL или SUPPORTED в узкой pricing v1 границе; canonical taxonomy CONFLICT; size options MISSING; public privacy PARTIAL; explicit hide CONFLICT. Schema `colors` пока объявляет только array, не форму items; реальный PIM использует `colors[].id`, а не `colors[].color_id`. Вариант ссылается через `variant.color_id`; публичный DTO может назвать ID иначе, но adapter обязан быть явным и тестируемым.

В schema нет UNPUBLISHED в availability enum. SITE должен хранить publication отдельно и давать публичное состояние UNPUBLISHED из explicit hide, не расширяя supplier availability самостоятельно. Не путать `variants[].availability` (эффективный заказный статус) с `availability_status` (supplier signal).

## CURRENT_DB_SCHEMA

Это восстановленная по коду схема, **не SHOW CREATE TABLE production**.

| Таблица / группа | Ключи и существенные поля | Ограничение |
|---|---|---|
| products | PK id VARCHAR64; unique slug191; name/brand/category_id/category_path; description/attributes/data; visible/hash/synced_at; price_min/max DECIMAL14,2 в schema4 | Product row, нет stable model ownership / publication reason / usable photo readiness |
| variants | PK sku VARCHAR64; product_id; size/color текст; price/kit_price DECIMAL14,2; availability VARCHAR10; lead_time/data/sort | Нет color FK, type-safe enum/permissions/normalized size catalogs; длинные v3 states не помещаются в legacy VARCHAR10 |
| photos | PK id; UNIQUE(product_id,pos); src_url/src_hash; file/thumb/width/height; pending/ok/error/tries | Позиционная product gallery; нет PIM photo ID или relation color→photo |
| categories / canonical | legacy SHA1 id/path/url; canonical VARCHAR64 ID/parent/slug/name/status/sort; product_categories, category_aliases | Сохраняются оба старых identity слоя, locks/audit; текущий ID set не PIM143 |
| rubizh_catalog_pricing | PK sku; product_id; policy_json/revision/updated_at | Приватный floor/approved kit/wholesale; сохранять и проверять ownership при mapping |
| rubizh_catalog_fulfillment / supplier_articles | PK sku; product_id; private supplier_name/supplier_sku | Нельзя экспортировать на storefront; требуется authenticated PIM fulfillment payload |
| meta / sync_log | meta k/v; sync counters/date/mode | Нет durable batch hash/status/result/rollback journal |
| rubizh_customer_orders | PK bigint; external_id/email/order_number; status/payment_status; total DECIMAL12,2/currency; items_json; delivery/tracking/timestamps | История заказов — immutable snapshot, не current catalog join |
| rubizh_order_details / checkout_requests | order_id/contact_json/subtotal/discount/shipping; request_id/scope_hash/payload_hash/order_id | Сохраняются privacy, idempotency и guest ownership |
| rubizh_order_fulfillment_lines | PK(order_id,line_no); product_id/sku/qty/supplier_code/line_amount; sale_unit добавляется миграцией | Частичная fulfillment проекция; не заменяет исторический items_json |
| rubizh_stock_reservations / order_timing | PK(order_id,sku); decimal qty/expires_at; order_id/payment_due/remind_at/paid_at | Только реальные numeric reservations; paid allocation и retention требуют отдельной проверки |
| rubizh_mono_invoices / mono_events | invoice/ref unique; amount bigint kopecks; status/page_url/time; event_hash PK | Существующий payment journal не пересоздавать и не сбрасывать |
| rubizh_np_order_confirmations / order_shipments / np_audit | order/actor availability proof; shipment supplier/tracking/NP ref; audit | Отдельная shipment history, существующие parcel allocations сохраняются |
| Customers/identity | rubizh_customers, rubizh_accounts, customer_identities(provider,subject), account_orders, account_redirects, auth_link_targets | Не переносить клиентские данные в каталог или публичные артефакты |
| Favorites/shared kits/mail/runtime | rubizh_favorites(customer_id,product_id); shared_kits.lines_json; order_mail/buyer_mail/timeline/shop_events; shop_limits | Mapping model identity, job idempotency и outbox нужны без пересоздания аккаунтов |

## TARGET_DB_SCHEMA / LEGACY_MIGRATION

Подробный план: [DB-MIGRATION-PLAN.md](DB-MIGRATION-PLAN.md). Использовать существующие products как model records и существующие variants как реальные SKU. Добавить relations colors/photos, size evidence/options, batch/mapping/history; не создавать второй products catalog и не запускать параллельную бизнес-логику.

Сначала проверить полный explicit mapping PIM и инварианты. Old product rows сохранять как legacy aliases/archives с исходным ID; transfer SKU допускается только в mapping transaction, с переносом приватной ценовой/fulfillment политики. Order items не переписывать и не связывать историческую цену с новой ценой. Неизвестные product/SKU/photo/category связи не угадывать. Mapping UNKNOWN оставляет legacy карточку на legacy чтении до решения; это не второй каталог, а отдельный version flag тех же таблиц.

## API_CHANGES

| Граница | Планируемое изменение |
|---|---|
| `/api/pim/status` | Полностью реализованные capabilities/version/hash/143 exact IDs; false/отсутствие capability до готовности полного пути; authenticated endpoint |
| `/api/pim/sync` | Versioned validated products/models + explicit mappings/hide; durable batch id/hash/replay ACK; transaction/mapping ownership; отсутствие не скрывает; dry-run отдельно от apply |
| Catalog/search/filter | Один model row, EXISTS подходящих SKU/colors, count DISTINCT identity; availability summary только display; canonical filters по PIM, общий usable-photo predicate |
| Product | Структурированные colors/galleries/real SKU/options/size system; price/permissions per selection, safe public whitelist; legacy alias resolver |
| Cart/quote | Exact selection/model/color/SKU/size/qty/revision; request option отдельного типа с null SKU; server resolution; typed conflict response без тихой замены |
| Order/invoice | Повторная проверка текущего PIM contract под lock; immutable snapshots; payment readiness independent от legacy manager status |
| Manager | Authenticated scoped action; fresh resolver + real SKU resolution + current quote/customer agreement; audit/history; повтор команды безопасен |
| Payment/webhook | Existing signature/hash/reference/amount protections; webhook-authoritative online paid, idempotent retries; browser only receipt, no permission bypass |

Не добавлять несуществующие `/api/site/pim/batches` как будто они уже доступны. Если нужен batch route, расширить текущий `/api/pim/*` router по документированному adapter contract. Согласовать фактический PIM transport до первого POST; production publishing в закреплённом PIM намеренно выключен.

## FRONTEND_CHANGES

Каталог: компактные одинаковые category cards, без огромной «Одяг та форма»; баннеры остаются привязаны к explicit category ID, mobile crop/image layout тестируется отдельно. Нельзя присваивать неподтверждённый banner/category mapping по названию.

Карточка: choose color_id → color gallery → реальные размеры/SKU → selected price/availability/permissions. Один подтверждённый размер выбирается автоматически; несколько — требуют выбора; NO_SIZE_REQUIRED не порождает fake OneSize; unknown/model options создают заявку. Одинаковый display размер не должен молча выбирать другой supplier SKU: конфликт выбора возвращается PIM/manager.

Корзина и checkout: immutable selection, понятные причины изменения/недоступности, разные CTA «Оплатити» / «Надіслати заявку». Не обещать наличие по model summary. Receipt различает «Замовлення оплачено», «Заявку отримано», «Замовлення створено — очікує оплати». Нельзя показать paid по query string redirect.

Главная: «Твоя задача. Твій комплект.» и единственный «ОБРАТИ СПОРЯДЖЕННЯ →»; competing picker CTA убрать в отдельном UI commit после согласования плана. Mobile-first 360–430 px, кнопки по центру, достаточный контраст важных подсказок/параметров; палитра #0B0F0C/#171E16/#F1F1E9/#A3AD99/#F5A332. Сохранить light/dark preference и разные hero banners, без CSS inversion.

Account: первый foundation commit не переписывает кабинет. Дальше читает snapshots color/size/payment/delivery/ТТН и permitted pay action. Guest checkout сохраняется; normalized phone связывается только после verified OTP, не по знанию номера. Existing email ownership/identity merge остаются. Future CRM получает устойчивые customer/order IDs, а не новый аккаунт при каждой миграции.

## PRICING_PRESERVATION

1. Review основан на bee5832, поэтому decimal schema4, `shopMoney`, private rubizh_catalog_pricing и серверные grants сохранены.
2. При будущем merge в main использовать именно эту историю, не копировать только UI. Pricing v1 требует variant version и ownership. Новый v3 adapter не переводит SKU к другому product без mapping.
3. Все money calculation в kopecks; qty m² учитывается отдельно; retail/kit/wholesale/promo проверяются сервером. Нет самостоятельных 12%/18%, stacked discount или public minimum floor.
4. Quote revision/PRICE_CHANGED/customer reaccept остаются; смена PIM цены между quote/order/invoice не списывает новую сумму без согласия.
5. Exact kits composition и approved per-SKU prices обязательны, anonymous покупатель не получает wholesale grant.
6. PIM G02 разрешается корректным экспортом цен. Сайт не создаёт minimum_sale_price/kit_price из старого cost или процента.

Предыдущая валидация pricing записана в `docs/SHOP-PRICING-VALIDATION-20261008.md`: 116 tracked tests, без skipped, включая 13 pricing additions. В этом этапе это историческое свидетельство, не новая проверка v3/E2E.

## ORDER_PAYMENT_STATE_MACHINE

Рекомендуемый целевой разрез: `order_state`, `payment_state`, `fulfillment_state` независимо; сохранить legacy status projection для текущего кабинета/NP до их adapter commits.

| Слой | Минимальные целевые состояния из ТЗ | Совместимость с текущим кодом |
|---|---|---|
| ORDER | NEW, WAITING_CONFIRMATION, CONFIRMED, CANCELLED, COMPLETED | new переводится по snapshot/confirmation evidence, не все new считать одинаковыми; shipped/returned/partial states остаются в историческом projection |
| PAYMENT | UNPAID, PAYMENT_PENDING, PAID, PARTIALLY_REFUNDED, REFUNDED | Legacy pending не всегда означает созданный invoice; failed/provider unknown сохраняются как attempt states; cod нельзя автоматически превратить в unpaid card |
| FULFILLMENT | NOT_READY, READY_TO_SHIP, TTN_CREATED, SHIPPED, IN_TRANSIT, DELIVERED | Aggregate нескольких shipments; cancelled/returned parcels сохраняются отдельно, не сбрасываются миграцией |

READY_FOR_PAYMENT / PAYMENT_READY — вычисляемая readiness подтверждённого заказа, а не общий status, подменяющий три слоя. Confirmed exact IN_STOCK получает системное confirmation evidence без обязательного менеджера. Исторические states не переписываются без однозначного documented mapping.

| Выбранная сущность | Submit | Pay сразу | Confirmation |
|---|---:|---:|---:|
| Реальный IN_STOCK SKU, confirmed size/binding/price; QUANTITY >0 или подтверждённый STATUS/FEED_PRESENCE с null quantity | Да | Да | Нет |
| PREORDER с explicit evidence | Да | Нет | Да, срок только если подтверждён поставщиком |
| ORDER_ON_REQUEST | Да | Нет | Да |
| SIZE_CONFIRMATION_REQUIRED / size option без SKU | Да | Нет | Да; сначала resolve real SKU |
| UNKNOWN | Нет | Нет | Не разблокирует checkout само по себе |
| OUT_OF_STOCK / explicit UNPUBLISHED / нет usable photos | Нет | Нет | Не обходить через manager pay action |

Permission booleans берутся из текущей server-stored selection и сверяются с status/binding/price, не из клиента. stale_source/stock age — предупреждения; только explicit expires_at является бизнес-истечением.

READY_FOR_PAYMENT → invoice/pending → signed success → paid; request → WAITING_CONFIRMATION → audited confirm+fresh resolver → READY_FOR_PAYMENT. CANCELLED не превращается обратно в активный заказ от позднего webhook: оплата фиксируется как исключение для reconciliation/refund. Retry invoice не создаёт дубль. Для смешанной корзины предлагается whole-order WAITING_CONFIRMATION / один итоговый invoice; это открытое бизнес-решение, пока не внедрено.

TTL сохранить: существующий срок 2 рабочих дня; reminder +24h; confirmation запускает текущую payment timing и обновляет reservation expiry. Не заменять его новым 15/30 minute TTL. STATUS null не превращать в количество 999 и не создавать quantity reservation. Реальный confirmed numeric stock резервировать атомарно, включая kit components и paid allocations до отражения в источнике.

## SYNC_AND_HIDE_POLICY / SEO_REDIRECT_PLAN

- Сохранять один каталог, подтверждённые SKU, категории/locks/aliases, raw nonpublic evidence отдельно. Version/schema/ownership/pricing validation должна завершиться до публичного переключения.
- Durable batch id + content hash; повтор того же hash возвращает прежний ACK, изменённый payload под тем же ID — conflict. Multi-request batch не показывается частично, finalize атомарен.
- Explicit hide записывает actor/reason/version/history; отсутствие в products/all_ids не меняет publication. Restore не меняет ID и не удаляет redirects/order snapshots.
- Photo readiness не меняет publication: pending/error/zero usable image означает исключение из public read/search/recommendations/kits/sitemap/feeds, а не HIDE.
- Один canonical URL model; old color URL 301 на model URL с explicit color selector. Значение query (color ID или slug) согласовать с фактическим PIM mapping, не вычислять из названия. Не допускать loops/open redirects, не терять разрешённые tracking query; canonical query-free.
- Unmapped legacy URL остаётся действующим или получает честный недоступный state согласно publication, без guessing redirect; historical images/items доступны авторизованной истории.
- JSON-LD/feed не требуют invented numeric stock для STATUS; paid/request eligibility не смешивать с Google advertising policy. Заказный availability != arbitrary product summary.

## TEST_PLAN

Будущие проверки перечислены поэтапно в SITE-INTEGRATION-PLAN. Обязательны unit/schema, isolated DB transaction/concurrency, API private DTO/security, browser/mobile/theme и staging E2E с mock MonoPay/NP/mail.

В этом audit выполнена одна дополнительная **offline проверка экспортера**: в Node VM исполнены реальные `classificationExport` и wrapper `simpleProductPayload` из закреплённого PIM source, зависимости замещены deterministic stubs. Исходный v1 fixture содержал SKU/price/site_price/version/floor/kit/wholesale; после wrapper root version остался 1, а у variant исчезли `pricing_policy_version`, `site_price`, `minimum_sale_price`, `kit_price`, `wholesale`. Assert подтвердил G02 без сети, записей PIM/DB или API calls. Это не production export и не v3 E2E.

Воспроизведение при наличии read-only checkout закреплённого PIM (из каталога этого checkout):

```sh
node --input-type=module <<'JS'
import fs from 'node:fs'; import vm from 'node:vm';
const s=fs.readFileSync('app/lib/classification-ui.inc.js','utf8');
const a=s.indexOf('function classificationExport(');
const b=s.indexOf('\n',s.indexOf('simpleProductPayload=function(a)',a));
const old={sku:'AUDIT-SKU',price:100,site_price:100,pricing_policy_version:1,
 minimum_sale_price:90,kit_price:95,wholesale:[{price:96}]};
const c={classificationReviewMode:()=>false,classificationEnabled:()=>true,
 S:{cfg:{inventory_policy_version:1}},
 mcColors:()=>[{id:'audit-color',variant_skus:['AUDIT-SKU'],photos:[]}],
 simplePalette:()=>({color:'black',camouflage:null}),
 classificationAvailability:()=>({availability:'IN_STOCK',stock:null,payment_allowed:true}),
 simpleSize:()=>({size_normalized:'M'}),calc:()=>({price:100}),classificationOptions:()=>[],
 simpleProductPayload:()=>({id:'AUDIT-MODEL',pricing_policy_version:1,variants:[old]})};
vm.createContext(c); vm.runInContext(s.slice(a,b),c);
const out=c.simpleProductPayload({p:{id:'AUDIT-MODEL',canonical_category_id:'clothing_jackets',
 variants:[{sku:'AUDIT-SKU'}]}});
const missing=['pricing_policy_version','site_price','minimum_sale_price','kit_price','wholesale']
 .filter(k=>!Object.hasOwn(out.variants[0],k));
if(out.pricing_policy_version!==1||missing.length!==5)throw Error('Unexpected wrapper behavior');
console.log({root_version:out.pricing_policy_version,missing,production_export:false});
JS
```

Критические сценарии: status null quantity immediate pay; stale warning не блокирует; expires_at блокирует; quantity zero не preorder; wrong model/color/SKU rejected; size option submits без SKU/reserve/invoice; real one-size/no-size; same-size multi-SKU ambiguity; duplicate batch/hash mismatch/half-failure; explicit hide/restore vs absence; price change/promo/floor; duplicate webhook/unknown create/late paid; parallel last-stock + paid allocation; kit component quantity; zero-photo gate при разных caches; mapping historical carts/orders; ownership OTP; old color 301; 360/390/430 desktop themes.

Нагрузочная цель тестируется отдельно на staging/изолированном профиле хостинга, а не 10k запросов на работающий магазин. Текущие worker/public concurrency gates обеспечивают bounded degradation, не доказывают 10k одновременных покупателей. Общий exclusive pricing/meta lock в checkout может сериализовать заказы: проверить и перейти к согласованным shared revision guards/ordered SKU locks, сохраняя atomic pricing.

## MIGRATION_ROLLBACK_PLAN

Private encrypted backup отдельно от хостинга + проверка восстановления → read-only production inventory/export → mapping/LOST dry-run → owner review → staging migration/mock E2E → owner apply approval → короткое защищённое переключение/verification. См. DB-MIGRATION-PLAN: MySQL DDL не считать transactional rollback; оплаченные новые заказы/webhooks не терять при возврате catalog revision. Полный старый DB restore допустим только до возобновления writes либо с проверенным replay событий и отдельным разрешением.

## FILES_TO_CHANGE

Это будущий список, **изменений кода здесь нет**. Подробные commit scopes и новые имена файлов — в SITE-INTEGRATION-PLAN. Реальные существующие файлы:

- API: `api/index.php`, `api/lib.php`, `api/kits.php`, `api/photo-storage.php`, `api/photo-status.php`.
- Catalog/taxonomy: `shop/catalog.php`, `shop/catalog-lib.php`, `shop/taxonomy.php`, `shop/canonical-taxonomy.json`, `shop/taxonomy-migration.php`, `shop/reclassification-v2.php`, `shop/taxonomy-semantic-v2.php` — v3 bypass, без нового text classifier.
- Store/order: `shop/store-lib.php`, `shop/checkout-quote.php`, `shop/order.php`, `shop/order-lifecycle.php`, `shop/units.php`, `shop/pricing-policy.php`, `shop/pricing.php`.
- Payment/fulfillment: `shop/mono-lib.php`, `shop/mono-webhook.php`, `shop/payment-start.php`, `shop/payment-return.php`, `shop/np-fulfillment.php`, `shop/np-manager.php`.
- Kits/public jobs: `shop/kit-data.php`, `shop/kit-catalog.php`, `shop/customer.php`, `shop/customer-ui.php`, `api/perf.php`, `shop/cache-worker.php`, `shop/photo-worker.php`.
- SSR/SEO: `storefront.php`, `.htaccess`, `sitemap.php`, `feeds/feed.php`, `feeds/google.php`, `feeds/meta.php`.
- UI/account: `index.html`, `assets/shop-client.2026100803.js` (выпуск нового versioned asset), `assets/store-runtime.4b6bbf46ca4c.js`, `assets/catalog-ux.css`, `assets/catalog-redesign.2026100605.css`, `assets/theme.css/js`, `assets/hero-theme.2026100801.js`, `auth/account.php`, `auth/account-view.php`, `auth/account-ui.js`, `auth/identities.php`, `auth/phone.php`.
- Runtime/migrations/tests: `dev/prepare-runtime.php`, `shop/runtime.php`, существующие `tests/pricing-*`, `tests/taxonomy-*`, `tests/catalog-data.test.mjs`, `tests/storefront.test.mjs`, `tests/runtime-*.test.mjs`, `tests/photo-cache.test.mjs`, `tests/kit-catalog-database.test.mjs`, `tests/account-design.test.mjs` и новые contract/mapping/E2E tests.

## OPEN_DECISIONS

1. Утвердить scope первого implementation commit: additive foundation/contract fixtures, без объявленных capabilities и без production sync.
2. Подтвердить business policy смешанной корзины: рекомендовано целиком WAITING_CONFIRMATION и один платёж после подтверждения; альтернативное разбиение — отдельная работа, не включено автоматически.

Webhooks-only paid и неизменный TTL уже заданы ТЗ и не требуют повторного вопроса. Технические G02/G03/G09 закрываются проверенным PIM wire export / explicit mappings / private DTO tests; не перекладывать их на владельца как ручной разбор сотен товаров. Доступ/разрешение на staging и production понадобится лишь на соответствующем будущем этапе.

## Проверка артефактов этого review

- JSON разобран; 68/68 объявленных schema paths присутствуют с правильным required, плюс 82 extension fields: всего 150 уникальных строк.
- Матрица: SUPPORTED 5 / PARTIAL 45 / MISSING 83 / CONFLICT 17. Статусы относятся к описанным границам, не разрешают включить contract v3.
- Все evidence paths существуют именно в закреплённых Git commits; относительные document links, code fences и существующие пути будущих изменений проверены.
- PIM schema enum (без null) совпадает с 143 ID category manifest; parent graph без missing parents/cycles; footwear_loafers отсутствует; footwear_shoes/field_watches/symbols/symbols_flags присутствуют.
- Проверены raw file SHA256, ID-set diff и pricing/main ancestry; offline wrapper fixture подтвердил G02. Future migration metrics остаются null/NOT_RUN.
- В review включены только четыре запрошенных документа. Application/PIM код, ранее неотслеживаемые migration файлы и production не изменены.
