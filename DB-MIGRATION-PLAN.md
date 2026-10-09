# DB migration plan — additive MODEL/COLOR/SKU

Дата: 2026-10-09. Только план. SQL/production sync/DDL не выполнялись. Baseline SITE pricing `bee58327e859efb618faea3631229de3fd3c1e39`, PIM `27fb26056563eb1fcf144ffdb2ba9ab264fa9313`.

## Принцип

Расширить существующие products/variants/photos/orders, не создавать второй каталог. PRODUCTS становится MODEL для v3 rows, варианты остаются реальными SKU. Legacy rows имеют явный contract_version=legacy, не преобразуются сходством имени. Model alias/mapping/history — отношения существующей системы, не независимая новая product база.

Все имена новых таблиц/колонок ниже **предлагаются**, пока не существуют. Точные SQL types/indexes сверить с SHOW CREATE TABLE из read-only export и MySQL/MariaDB version на staging. Не считать DDL transaction-safe: MySQL ALTER может implicit commit и metadata lock. Foundation и data apply — отдельные операции с journal/checkpoints.

## Текущая основа

Источник схемы: `api/lib.php:migrate`, `shop/taxonomy.php:shopTaxonomySchema`, `shop/store-lib.php:shopStoreDatabase`, `auth/account.php:customerDatabase`, `auth/identities.php:identityDatabase`, `shop/order-lifecycle.php:shopLifecycleMigrate`, `shop/mono-lib.php:monoMigrate`, `shop/np-fulfillment.php:npMigrate`.

products.id/variants.sku VARCHAR64, products.slug191 unique. Products prices и variants.price/kit_price DECIMAL14,2 в pricing schema4. Variants.availability VARCHAR10 не подходит для SIZE_CONFIRMATION_REQUIRED/ORDER_ON_REQUEST; сохранять legacy projection в старом поле, полный статус в новом. Price snapshots orders/details DECIMAL12,2, provider amount integer kopecks. Photos UNIQUE(product_id,pos), а не immutable gallery identity. Order items находятся в items_json; это историческая истина.

Existing canonical tables/aliases/decisions/locks, private catalog_pricing/fulfillment/supplier_articles, reservations/invoices/events, identities/customer accounts не пересоздавать.

## TARGET_DB_SCHEMA

| Объект | Предлагаемое расширение / тип данных | Ключи/правила |
|---|---|---|
| products | `contract_version`, `pim_model_id`, `publication_state/reason`, `pim_revision`, `usable_photo_count`, `media_revision`; existing name/brand/description/attributes/price summary | Existing id остаётся primary identity; для v3 preferred id=model_id. Если IDs различаются — unique explicit pim_model_id mapping. Visible compatibility projection; не удалять старые id |
| variants | `pim_variant_id` nullable, `color_id` nullable, `size_system`, `size_normalized` nullable, `size_status`, `source_binding_status`, `effective_availability` VARCHAR32, `order_submission_allowed`, `payment_allowed`, `requires_order_confirmation`, `stock_quantity` nullable DECIMAL, `stock_status`, `availability_status/source/confirmation`, `inventory_mode`, policy version/id, `expires_at` nullable, `pim_revision`, `active` | PK sku сохраняется. INDEX(product_id,color_id,active); exact product/color ownership validated under transaction. No invented variant/SKU if optional variant_id отсутствует: SKU remains identity |
| variants metadata | Existing private/versioned JSON или typed fields: confidence, observation/source time, data age, stale_source, warning_hours, dispatch/price_ready, lead times, binding/size required flags | Warnings не authorization TTL. Unix timestamp/null wire строго конвертировать UTC без превращения imported_at в observed_at. Checked raw evidence private; public DTO whitelist |
| `rubizh_product_colors` NEW | model product_id + PIM color_id, color, camouflage, sort/default selection, revision/active | **Composite PK(product_id,color_id)**. PIM clr hash не глобально уникален: black у двух моделей может иметь одинаковый ID. Не делать color_id одиночным PK |
| photos (existing) | Сохранить IDs/files/src hashes. Optional `pim_photo_id`, immutable generation/revision, active association/readiness | Не перезаписывать историческую relation только из-за нового pos. New gallery refs append/reconcile; old photo generation сохраняется до retention approval |
| `rubizh_color_photos` NEW | product_id/color_id/photo_id, sort/revision/assignment_state | Composite ownership refs. NULL/unassigned gallery хранится отдельно как model scope, без assignment по color name. Shared bytes допустимы, ownership explicit |
| `rubizh_size_catalogs` NEW | product_id/catalog_id, scope MODEL/COLOR, color_id nullable, size_system, allowed_sizes JSON, revision | Composite identity; это assortment evidence, не stock. Список уже нормализован PIM; диапазон на сайте не расширять |
| `rubizh_size_options` NEW | product_id/option_id, scope/color_id nullable, size/system, revision/active; null SKU/stock contract | Options не строки variants; no supplier_sku/fake quantities. Submit-only, confirmation required. MODEL option не размножать по цветам |
| rubizh_canonical_categories (existing) | PIM143 identity/parent/name + explicit site slug/banner/alias metadata | Authority PIM. До применения explicit old-ID mapping сверяется с locks; deprecated SITE IDs остаются aliases/history, не активными PIM categories |
| rubizh_product_categories / decisions (existing) | Authority/version/source = PIM on v3 records; preserve manual locks/audit/legacy path/filter aliases | Legacy text evaluator не вызывается для v3. Conflict PIM vs protected lock → NEEDS_DECISION до apply, не silent overwrite |
| `rubizh_pim_batches` NEW | batch_id, content_hash, contract versions, expected category hash, status/revision/summary/error, timestamps | Unique batch_id; same hash replay, mismatch reject; explicit phases RECEIVED/VALIDATED/COMMITTED/REJECTED. ACK stable only after commit |
| Private batch staging/journal NEW | request chunks/hash, validated payload, rollback before images, entity counters, mapping proof references | Временное private staging одной синхронизации, не публичный второй catalog. TTL/retention на payload/log отдельно, не на inventory |
| `rubizh_pim_legacy_mappings` NEW | legacy product/SKU/variant/URL/photo ID → product model/color/SKU, status CONFIRMED/UNKNOWN, source revision/proof reference | Старый compound variant identity не терять. Unique source mapping; targets ownership проверены. Нет fuzzy matching |
| `rubizh_product_redirects` NEW | exact legacy path → stable model target + permitted color selector, mapping revision/active | Unique source path, local approved target only, no cycles. Не переписывает order items, stores old IDs separately |
| rubizh_catalog_pricing (existing) | Per-SKU pricing v1 + current product ownership/revision | Preserve floor/approved kit/wholesale, private. Transfer только explicit mapping transaction вместе с SKU; no policy copy to unrelated SKU |
| rubizh_catalog_fulfillment / supplier_articles (existing) | Explicit real supplier binding/proof private; active/current pointer отдельно от historical records | Не терять по hide/absence; order snapshots own supplier info. Public blacklist заменяется whitelist DTO |
| rubizh_customer_orders (existing) | Add `order_state`, `fulfillment_state`, `contract_version`, validated catalog/pricing revision, confirmation revision if needed; preserve payment_status | Existing order ID/number/email/items_json/total unchanged. Compatibility status projection для текущих views/NP until migrated |
| Order items | Extend future items_json: model_id/color_id/SKU/variant_id/size system/raw/normalized, quantity/unit, price kopecks, permissions/request state snapshots, display name/image | Existing items_json не переписывать. Optional normalized child table позже только с версионированным projection/backfill без замены source-of-truth |
| Order request selection NEW | Snapshot null-SKU option with model/color/option/size + resolution/audit, linked order line | Не резервируется/не оплачивается до real-SKU resolution. Resolution сохраняет исходную request history и customer agreement |
| Reservations/allocation | Existing stock_reservations + durable paid allocation ledger or explicit consumed state linked SKU/observation revision | Numeric confirmed only, ordered locks. Pending→paid не даёт другим заказам повторно использовать тот же stock до отражения расхода в supplier source |
| Payment/NP/account tables | Existing invoice/event/confirmation/fulfillment/account/favorite keys; optional current-model pointer/projection | Не reset event/reference/idempotency; customer/customer_order IDs сохраняются. Favorite mapping только explicit, historical product alias retain |

Не все поля обязаны получить отдельную колонку: фильтруемые/авторизующие/locked поля — typed/indexed; display/evidence JSON с строгим validator. Supplier private raw хранится отдельно от public model JSON. Numeric null, boolean false и absent — разные значения. Required absent -> reject; не превращать missing signal в stock=0.

Минимальные target states: order NEW/WAITING_CONFIRMATION/CONFIRMED/CANCELLED/COMPLETED; payment UNPAID/PAYMENT_PENDING/PAID/PARTIALLY_REFUNDED/REFUNDED; fulfillment NOT_READY/READY_TO_SHIP/TTN_CREATED/SHIPPED/IN_TRANSIT/DELIVERED. Payment readiness — derived permission, не объединённый status. Provider failed/unknown и частичные возвраты/parcel states остаются в существующих журналах; legacy mapping не теряет эти факты.

Для photos existing UNIQUE(product_id,pos) нельзя поверх старых позиций заменять URL и считать историю сохранённой. Минимальный additive вариант: новые asset rows получают свободные технические pos, а display sort живёт в versioned model/color relations; все gallery readers для v3 читают relations. Legacy позиции/files сохраняются. Альтернативный переход к immutable global media identity требует отдельного review/index migration, не входит скрытно в foundation. Historical media refs берутся из snapshot/retained manifest, а не current product gallery.

## Publications/photos

PIM availability enum не содержит UNPUBLISHED. Publication state отдельно ACTIVE/HIDDEN/ARCHIVED с explicit reason/revision. Public eligibility = permitted publication + resolved identity/category + >=1 usable allowed photo + valid read contract. Payment additionally checks selected SKU state/permissions/price. View readiness не заменяет publication.

Usable photo = validated allowed source downloaded/decoded to a usable local asset with valid relation/readiness; URL syntax или photos row недостаточно. Если используется подтверждённый внешний CDN asset, нужен отдельно проверяемый readiness contract. Missing/error local file исключает публичный model; worker исправляет → media revision/count/caches обновляются. HIDE не вызывается. UNKNOWN photo-color связь хранится и не распределяется по цветам догадкой.

## PRECHECK / read-only export

Перед любой будущей миграцией получить закрытый консистентный snapshot: all products including hidden, variants including site-only, every photo row/ref/file manifest, prices/policies, inventory nullable metadata, taxonomy/locks/aliases/banners, orders/items, account ownership, favorites/shared carts, invoice/events, reservations/fulfillment/shipments. Customer export/backup не публиковать в GitHub. DB calls через явное read-only соединение, не `db()` с auto-migrate.

Зафиксировать PIM pinned SHA, schema/file hashes, actual export hash, actual SITE deploy SHA/hash assets/DB version, inventory timestamp, category manifest/hash. Проверить длины IDs/SKU/slugs, collations/case uniqueness, orphan/duplicate bindings, color composite keys, required/null/enum, private field containment. Неподдерживаемый формат не обрезать VARCHAR/substr и не менять IDs автоматически.

## MAPPING / dry-run

1. Включить в знаменатели **все** исходные SKU/variants/photos/prices/stock/categories/orders/items, в том числе site-only/hidden/unknown.
2. Identity resolution только explicit PIM mapping. Existing SKU → same SKU если заявлено сохраняемым; replacement старого SKU лишь с explicit variant mapping и историческим alias, без подмены ранее оплаченных items.
3. Для legacy multi-color products подтвердить target model, color, galleries и each real SKU. Color ID scoped to MODEL. Similar name/бренд/категория сами по себе не merge proof.
4. SITE categories/banners/locks сопоставить PIM143 по утверждённому ID mapping. Не автоматически заменить clothing_costumes→clothing_suits только потому, что названия похожи. PIM canonical list — authority; старые IDs сохраняются в aliases/history. Сохранить footwear_shoes, field_watches, symbols/symbols_flags; footwear_loafers не добавлять.
5. Перемещения SKU включают private pricing/supplier policy и текущие cart/favorite refs; order snapshots immutable. Photos сохранять по stable identity/src hash + explicit scope, no loss via positional overwrite.
6. UNKNOWN/NEEDS_MAPPING остаются неизменными legacy rows; export exclusion не скрывает. Conflict mapping блокирует apply соответствующего batch; нет «безопасного большинства» с silent errors.
7. Сформировать private action journal: before/after refs, mapped owners, create/update/archive/redirect/restore reasons, conflicts, manifest hashes. Dry-run не записывает business tables и не вызывает sync.

## Conservation report

| Metric | Как доказывать ноль потерь |
|---|---|
| LOST_SKU | Каждая старая SKU identity существует или имеет confirmed reversible alias к реальному target SKU; unmatched не исключается из отчёта |
| LOST_VARIANTS | Каждый legacy variant ID + owner сохраняется в variant/mapping/history; не путать dedup модели с удалением variant |
| LOST_PHOTOS | Каждая photo row/source/file/ref присутствует в новой relation или preserved unassigned/history; bytes/hash verified; no fake color assignment |
| LOST_PRICES | Original precise decimal values и private policy snapshots сохранены; intentional new PIM prices видны отдельным diff, не маскируют удаление старых цен |
| LOST_STOCK | Quantity/null/status/source/observation/expiry сохранены с provenance; новый PIM сигнал отдельный semantic diff, не null→0 |
| LOST_CANONICAL_CATEGORIES | Все исходные canonical identities/relations/locks/aliases preserved либо explicit mapped+history; taxonomy migration не стирает старые refs |
| LOST_ORDERS | Set/hash старых order IDs/numbers/state/payment/total/ownership сохранён |
| LOST_ORDER_ITEMS | Order snapshots line counts и hashes/name/SKU/qty/size/color/prices/customer facts не изменились |

Сводка также включает MODELS_BEFORE/AFTER, SKU_BEFORE/AFTER, AUTO_CONFIRMED_MERGES, NEEDS_DECISION, SITE_ONLY_UNRESOLVED, MULTI_SUPPLIER_CONFLICTS, hidden/restored/redirect counts. Counts alone не доказательство: reconciliation по IDs/values/hashes. Все эти значения пока **NOT_RUN**, а не 0. Никакого обещания уменьшить спорные случаи до заданного числа без доказательств.

## Staged migration execution (только после approval)

1. Restore-tested encrypted full backup вне хостинга, private media manifest и config secret backup отдельно. Не public Google Drive banners. RPO/RTO измерить rehearsal, не придумывать.
2. Выполнить additive foundation CLI на isolated/staging DB. Journal each DDL; backward compatible defaults; rollout feature disabled. Public GET bootstrap не запускает ALTER. Не DROP/TRUNCATE/mass DELETE, no destructive automatic cleanup.
3. Validate actual export/mapping/pricing payload → durable staged batch. Unsupported versions/143 hash/missing prices/orphan color/SKU conflict ⇒ REJECTED, production неизменён.
4. На staging атомарно finalize existing catalog; append gallery/history/mappings и protected ownership transfer; exact hidden_ids только explicit commands. Pricing/meta/catalog revision invalidates caches after commit, не до него. Photo jobs вне transaction.
5. Validate per-entity invariants, private data leakage, mock pay/request flows, rollback, load. Owner review signed report прежде production approval.
6. Для production выбрать короткое окно catalog/checkout write gate, workers paused/drained по безопасному регламенту; вебхуки принять в durable journal или согласованно retry, не терять. DDL отдельно подготовлен заранее. Catalog finalization/ownership transfer одной bounded транзакцией; concurrency limits заранее измерены.
7. Проверить manifest/counts/selected mappings/current photo readiness/price/locks/aliases/receipts/authorization, clear/warm versioned public cache, включить feature и capabilities только готовых функций. Публикация и bulk apply требуют явного owner approval.
8. Открыть writes после verification; сохранить batch/history/backup и мониторинг. Не запускать реальный тестовый платёж или ТТН в verification.

Не удерживать DB transaction на внешний HTTP/MonoPay/download изображений/SMTP. Lock order общий у sync/checkout/manager/invoice: catalog revision guard → owners/SKUs sorted → reservations/order. Проверить lock graph до implementation; existing exclusive meta pricing lock нужно оптимизировать измерением без потери serialization against catalog writes. Retried deadlock не создает duplicate order/invoice.

## Rollback без потери новых заказов

До открытия writes: switch feature off, revert catalog batch по journal/backup на staging-проверенном механизме, подтвердить old catalog+pricing; DDL оставляется additive. Не DROP новых relations только ради rollback. Restore full DB здесь тоже отдельная операция, не универсальная кнопка.

После открытия writes: полный возврат старой DB уничтожит новые заказы/paid webhooks/аккаунты и недопустим. Freeze catalog apply/checkout по incidents policy, принять/журналировать provider events, rollback только catalog pointers/relations/pricing revisions с сохранением новых order/payment/account writes. Alias/model IDs, на которые уже ссылаются новые snapshots, сохраняются. Если old reader не умеет новый snapshot, использовать compatibility receipt adapter, не переписывать заказ назад.

Оплаченный invoice amount/history immutable. Existing paid allocations/reservations учитываются при возврате stock revision; не «восстанавливать» остаток поверх новых оплаченных заказов. Более новая валидная supplier observation не откатывается без explicit reconciliation. Показать оператору concrete diff/incident report.

Disaster recovery full DB restore требует отдельного подтверждения, restore point плюс replay новых заказов/payment/provider events/identity writes и reconciliation сумм/stock. Секреты/клиентские данные не прикладывать к публичному review commit. Отдельный storage/provider выбор не выполняется этой миграцией.

## TTL / stock и accounts

Существующий payment срок = 2 рабочих дня, reminder +24h, confirmation обновляет срок/reservation expiry. Не менять без owner approval. Warning threshold 36h PIM и current SITE checkout age48h не являются TTL резерва; v3 не блокируется возрастом наблюдения. Только supplier expires_at даёт business expiration.

STATUS/FEED_PRESENCE IN_STOCK с quantity=null допускает оплату при confirmed permissions/price, но не количество для количественного резерва. Для QUANTITY reservations атомарны и распространяются на kit components; paid allocation сохраняется до подтверждённого учёта расхода. Не создавать stock из observed/imported timestamp или наличия карточки.

Customer IDs/verified identities/account_orders/order ownership/phone proof сохранять. Unknown order email/phone не связывается автоматически к любому введённому номеру. Guest order secure ownership retained. First foundation не rewrites кабинет; future CRM интегрируется через те же customer/order IDs. Offsite backup должен сохранять аккаунты, не лишь public catalog.

## Gate перед implementation и перед apply

Первое решение — утвердить foundation scope; code changes после него. Перед apply дополнительно real PIM wire/pricing + full mappings + read-only actual SITE snapshot + dry-run/LOST report + staging mock E2E/rollback/security/perf + production backup proof и отдельное разрешение владельца. Этот документ не является разрешением на миграцию.
