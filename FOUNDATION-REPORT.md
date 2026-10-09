# FOUNDATION REPORT — Commit 1

Дата: 2026-10-09. Ветка: `integration/site-pim-v3-foundation-2026-10-09`.
Scope: **Integration Base + SITE CONTRACT / DB FOUNDATION**, без Commit 2/3.

## Результат и границы

```text
INTEGRATION_BASE_COMMIT = b5b767c52da8b2a1c5343f0e3b8659cf292b6523
FOUNDATION_COMMIT = commit, содержащий этот отчёт (точный SHA выдаётся после git commit)
FILES_CHANGED = 14 новых файлов foundation; 0 изменённых существующих application files
DB_SCHEMA_ADDITIONS = 55 колонок + 11 таблиц (включая journal) + 4 индекса
                     + 1 FK на existing variants и FK внутри новых relations
TESTS_PASS = 177 / 177; FAIL = 0; SKIPPED = 0
CAPABILITIES_ADVERTISED = {pricing_policy_version: 1} — существующее поведение
PRODUCTION_WRITES = 0
PIM_SYNC_ENABLED = false — v3 integration
REAL_PIM_SYNC_CALLS = 0
REAL_PAYMENT_CALLS = 0
REAL_NP_CALLS = 0
```

Existing legacy `/api/pim/sync` остаётся в коде без изменений; его локальные
fixture-тесты не являются реальным PIM sync. Положительная capability
`contract_version=3` не добавлялась. Ни production, ни live DB не открывались.
Ни один deploy/install/apply на хостинг не выполнялся.

## Integration Base / compare

Закреплённый main `0e7dafa39e632690220d5d93669e571254286388` — предок pricing
`bee58327e859efb618faea3631229de3fd3c1e39`. Принятый audit
`858faaffdcaaab62f644ca56fa2339c9e6fb3a5d` — потомок pricing и добавляет только
review-документы. Divergence/conflicts: **0**. Application tree integration base
побайтно соответствует pricing baseline. Все commits main и pricing сохранены.
Отдельный integration-base commit добавляет только
[INTEGRATION-BASE-REPORT.md](INTEGRATION-BASE-REPORT.md), без новой v3 логики.

До начала foundation заново прошли **116/116 tracked tests**, затем отдельно
**9/9 ранее неотслеживаемых workspace tests**. Проверены pricing v1, Decimal,
server-side цены/ownership/atomic rollback, taxonomy, checkout, MonoPay, NP,
account/identity и storefront desktop/mobile regression. Main не перемещался;
изменения находятся в отдельной integration branch.

## FILES_CHANGED

Только эти 14 новых файлов входят в foundation commit:

```text
FOUNDATION-REPORT.md
contracts/pim-v3/1/README.md
contracts/pim-v3/1/manifest.json
contracts/pim-v3/1/category-size-export.schema.json
contracts/pim-v3/1/canonical-categories.json
dev/migrate-pim-v3.php
shop/pim-v3-contract.php
shop/pim-v3-schema.php
tests/pim-v3-foundation.test.mjs
tests/fixtures/pim-v3/1/quantity.json
tests/fixtures/pim-v3/1/status.json
tests/fixtures/pim-v3/1/feed_presence.json
tests/fixtures/pim-v3/1/legacy-mapping.json
docs/pim-v3-foundation/validation-20261009.json
```

Ранее созданные untracked `dev/export-model-migration-source.php`,
`dev/plan-model-migration.php`, `shop/model-migration.php`,
`tests/model-migration.test.mjs`, `docs/MODEL-MIGRATION-20261008.md` сохранены и
не включены в эти commits. Raw backups, данные покупателей и service keys не
включались. Все новые business-data fixtures синтетические.

## SITE CONTRACT

- Pure helpers не читают конфигурацию, не подключаются к БД, не вызывают сеть и
  ничего не мигрируют при include. Ни один существующий runtime handler их не
  подключает. `dev/prepare-runtime.php` и legacy schema4 marker не менялись.
- Pinned schema и PIM143 category tree сохранены byte-for-byte с SHA256 manifest;
  active SITE taxonomy/locks/aliases/banners не менялись. Сохранены, в частности,
  `footwear_shoes`, `field_watches`, `symbols`, `symbols_flags`; новых угадываемых
  aliases/URLs нет.
- Schema validator обрабатывает все используемые pinned draft-07 keywords,
  включая `if/then`, `allOf`, `contains`, `not`, enum/null/required/type/unique,
  различает JSON objects/lists и отвергает неизвестные schema keywords. Это
  ограниченный pinned interpreter, не универсальная JSON Schema библиотека.
- Extension проверяет explicit MODEL identity, colors using `id`, composite
  ownership, реальные SKU, photo/color membership, scoped size options/catalogs,
  версии и сохранённые per-SKU pricing v1. Нет grouping по названиям, fake SKU,
  assignment неизвестных фото, преобразования null stock в 0 или округления цен.
- `shopMoney`, `shopPricingPolicy`, private floors/approved kit/wholesale остаются
  существующей pricing v1 authority. Потерянные exporter G02 поля не заменяются
  fallback-ценами. Unknown floor отключает скидки, а не восстанавливается.
- Public DTO whitelist удаляет вложенные sources/bindings/provenance/evidence,
  private floors/procurement/key fields и не копирует произвольные JSON objects.
  Это только сериализатор foundation, не production read/checkout authorization.
- Explicit mapping validator требует owned targets и evidence references,
  сохраняет UNKNOWN target=null; URL остаётся только проверяемыми данными.
  Evidence references ещё не доказывают authenticity/SAFE_AUTO. Фактическая
  reconciliation, redirects и SKU transfers не выполнялись.

Полная спецификация ограничений и расширения:
[contracts/pim-v3/1/README.md](contracts/pim-v3/1/README.md).

## DB_SCHEMA_ADDITIONS

Existing `products` остаётся MODEL storage; `variants` — real SKU storage;
`photos` и `rubizh_customer_orders` сохраняют идентичность. Второго каталога нет.

| Existing table | Additions | Defaults / compatibility |
|---|---|---|
| products | 13 колонок: contract/model identity, publication/reason/revision, usable media count/revision; classification/category/size/order/inventory/pricing versions | publication=LEGACY; остальные NULL; visible, category, slug, data и цены неизменны |
| variants | 35 колонок: optional variant/color identity; raw/display/normalized/system/status/confidence sizes; binding; effective availability; nullable Decimal quantity; observation/source age/warning/expiry; inventory/price/dispatch/permission flags и revision/active | все NULL; legacy SKU PK/price/kit_price/availability/JSON неизменны; новые flags не используются checkout |
| photos | 2 optional PIM photo/media revision columns | NULL; existing IDs/files/src/pos unchanged |
| rubizh_customer_orders | 5 optional order/fulfillment/contract/catalog/confirmation fields | NULL; items_json, amount, payment_status и ownership unchanged |

Новые таблицы:

```text
rubizh_product_colors          PK(product_id,color_id), inactive by default
rubizh_model_photos            model-scoped/unassigned gallery, assignment UNKNOWN
rubizh_color_photos            composite model/color/photo relations
rubizh_size_catalogs           MODEL/COLOR scope + allowed sizes JSON (not stock)
rubizh_size_options            null SKU/stock; request-only fixed permissions
rubizh_pim_batches             version/hash/status foundation, no ingestion handler
rubizh_pim_batch_chunks        private payload staging, no route/outbox/worker
rubizh_pim_legacy_mappings     explicit old product/variant/SKU/photo/URL references
rubizh_pim_history             appendable audit structures, no applied operations
rubizh_order_request_selections original null-SKU request + optional owned resolution
rubizh_pim_foundation_journal  explicit isolated DDL step/hash/checkpoint records
```

4 indexes: unique optional model identity; composite SKU owner; optional per-model
variant identity; model/color/active selection. Composite FK on existing variants
enforces color ownership; new relation FKs constrain model/color/SKU/order targets.
Enforced CHECK constraints protect typed states/enums/versions/booleans, nonnegative
quantities and option null-SKU/null-stock/request-only permissions.

`pimV3SchemaPlan()` содержит **70 additive steps**, journal CREATE отдельно.
Нет DROP/TRUNCATE/DELETE/MODIFY/RENAME/backfill/hide/redirect в migration plan.
Existing DECIMAL(14,2) price columns/private pricing storage не меняются.

## Isolated migration / runtime safety

- `dev/migrate-pim-v3.php` — CLI-only; HTTP GET получает 404.
- Требует explicit `--isolated`, fixture-prefixed DB, Unix socket matching
  `RUBIZH_TEST_MYSQL_SOCKET`; credentials только root/empty на isolated local socket.
  Нет live config, host/remote DSN, production schema argument или создания DB.
- `--plan` по умолчанию читает metadata и возвращает writes=0. `--apply` проверяет
  prepared schema4/runtime, legacy types/collations и поддерживаемые CHECK constraints.
- Advisory lock исключает параллельную миграцию одной fixture DB. SQL hash и
  object hash journal защищают replay от drift; существующий unjournaled object
  не считается автоматически подтверждённым. Непрерывность после interrupted
  DDL требует review; MySQL DDL не называется atomic transaction.
- Изолированный apply → replay (0 новых steps) проверен. Baseline rows/prices/
  photos/order snapshots/customer identities/ownership/mock Mono events и NP
  shipments остались равны исходным. Новые legacy поля NULL/LEGACY.
- После apply legacy bootstrap выполнялся через PDO, который бросает exception
  на CREATE/ALTER/DROP: request-time DDL не потребовался. Реальный локальный
  `/api/pim/status` остался `{pricing_policy_version:1}`.
- Неверный цвет/SKU owner, invalid enum/boolean/negative stock, fake option SKU,
  payment for a request option, schema drift и production-named CLI target
  отвергнуты тестами.

## TESTS_PASS / evidence

| Запуск | Passed | Failed / skipped |
|---|---:|---:|
| Integration base, весь existing tracked regression до foundation | 116 | 0 / 0 |
| Дополнительные ранее созданные workspace model-migration tests | 9 | 0 / 0 |
| После foundation, весь workspace regression | 177 | 0 / 0 |
| Финальный отдельный foundation validation | 52 | 0 / 0 |

177 = **168 воспроизводимых tests из нового commit** (116 existing + 52 new)
+ 9 pre-existing untracked workspace tests. Они не выдаются за committed тесты.
New tests включают QUANTITY/STATUS/FEED_PRESENCE, все request/unknown/out-of-stock
states, price-not-ready, ONE_SIZE/NO_SIZE_REQUIRED, stale warning, schema negative
fixtures, pricing floors/Decimals, ownership/case conflicts, public privacy canaries,
explicit mapping, additive isolated DB/replay/drift/HTTP refusal. Полный список
test names, команды, timings, counts и hashes DDL:
[validation-20261009.json](docs/pim-v3-foundation/validation-20261009.json).

PHP syntax трёх новых helpers/CLI и JS syntax нового test file прошли.
Окружение: retained PHP **8.4**, MariaDB **11.8.6**, Playwright/system Chromium.
Production PHP 8.2 и MySQL 8 здесь не запускались; их staging verification остаётся
перед будущим deployment. DB изолирована Unix socket, TCP отключён. Stop/restart
и повторный PDO SELECT 1 прошли. Полный fresh-task restore среды ещё не сертифицирован.

Reproduce committed suite (после запуска изолированной test DB):

```sh
RUBIZH_TEST_MYSQL_SOCKET=/workspace/test-runtime/mariadb/mysql.sock \
node --test --test-concurrency=1 $(git ls-files 'tests/*.test.mjs')
```

Команда workspace suite использует `tests/*.test.mjs`; pre-existing untracked tests
нужны только для повторения общего count177. Без socket DB-тесты будут skipped;
это не заменяет результат приведённого запуска с нулём skips.

## Mixed cart и следующий gate

Решение владельца сохранено в manifest и pure policy helper: если хотя бы одна
позиция требует PREORDER / ORDER_ON_REQUEST / SIZE_CONFIRMATION_REQUIRED /
manager confirmation, весь заказ WAITING_CONFIRMATION, затем **один общий платёж**
после подтверждения; automatic split=false. Foundation это решение фиксирует,
но не меняет текущие checkout, immediate-payment, MonoPay или manager flows.

Никакие actual catalog merge/LOST_* итоги этим этапом не подтверждаются: foundation
не заменяет полный реальный export/mapping/dry-run. PIM exporter pricing G02,
future negotiated sync/readiness, protected publication/media gates и production
schema/runtime checks ещё нужны на следующих этапах. **Commit 2/3 не начаты.**
Применение к production и дальнейшая реализация требуют следующей проверки владельца.
