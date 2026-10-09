# FOUNDATION HARDENING — 2026-10-09

Base: `d0389bc422547f4a987935f7205580c90084d5da`.
Branch: `integration/site-pim-v3-foundation-2026-10-09`.
Scope: один hardening commit, без production/runtime integration и Commit 2/3.

## Изменения

1. Public DTO исключает `stock_quantity`. Exact supplier stock остаётся в private
   input/validator/typed DB foundation; публичные root/color/size/variant структуры
   не содержат quantity или inventory provenance. Разрешённые availability,
   order/payment/confirmation permissions, delivery lead time и dispatch status
   сохранены. Входной `max_order_qty` также не копируется: такой public limit можно
   добавить позже только как отдельную server-derived величину.
2. Order-state catalog: **NEW / WAITING_CONFIRMATION / CONFIRMED / CANCELLED /
   COMPLETED**. `READY_FOR_PAYMENT` исключён из DDL CHECK. Payment readiness —
   derived permission/state-machine result. Future ordinary order может быть
   CONFIRMED + UNPAID + payment_allowed=true; request проходит manager confirmation
   из WAITING_CONFIRMATION в CONFIRMED. Новый state machine/checkout не включён.
3. Wire contract явно **UNCONFIRMED**, ingestion disabled. `models[]` в существующих
   offline fixtures — синтетический test wrapper, не обязательный envelope PIM.
   Не добавлялись переименование `products/models`, adapter или `/pim/sync` v3.

## Exact wire gate

До ingestion получить реальный exact fixture из PIM production-release branch
после исправления G02, с commit/hash и оригинальными:

- top-level versions и envelope `products` или `models`;
- полным model, colors, size_catalogs, size_options и real variants;
- publication fields и inventory/order permissions;
- pricing v1 на каждом SKU;
- public/private boundaries.

Только после этого фиксировать один wire contract. Наличие синтетических fixtures
не подтверждает совместимость фактического release payload. PIM repo не изменялся;
Commit 2/3 не начаты.

## FILES_CHANGED

```text
shop/pim-v3-contract.php
shop/pim-v3-schema.php
tests/pim-v3-foundation.test.mjs
contracts/pim-v3/1/manifest.json
contracts/pim-v3/1/README.md
DB-MIGRATION-PLAN.md
SITE-INTEGRATION-PLAN.md
FOUNDATION-REPORT.md
FOUNDATION-HARDENING-REPORT.md
docs/pim-v3-foundation/hardening-validation-20261009.json
```

10 файлов: 8 обновлённых foundation/tests/docs + 2 новых report/evidence files.
Legacy API/router, pricing v1, checkout, MonoPay/NP/accounts, frontend, runtime
preparation, active taxonomy и pinned schema/category snapshots не менялись.
Pre-existing untracked model-migration files сохранены и не входят в commit.

## DB и проверки

Количество foundation steps = 70, additions не расширялись. SQL изменился только
для `rubizh_customer_orders.pim_order_state`: новая пятизначная CHECK domain.
Тест применяет foundation к свежей isolated fixture DB, проверяет все пять states,
reject READY_FOR_PAYMENT и rollback исходных order rows. DDL journal/replay,
preservation legacy rows/Decimal/private pricing/account ownership/mock Mono/NP,
public GET refusal и existing pricing-only capabilities также проверяются.

Journal hash старой уже созданной fixture schema будет отличаться: CLI намеренно
fail closed, а не выполняет upgrade/repair. В этом commit нет ALTER/drop-CHECK
миграции существующего runtime; production/live DDL не запускался.

Privacy regression проходит для numeric QUANTITY и nullable STATUS/FEED_PRESENCE.
Вложенные canaries проверяются на model/color/size catalog/option/SKU уровнях;
stock, quantity, provenance, supplier bindings/sources, inventory policy/mode/
observation metadata не присутствуют в DTO. Public permissions и decimal prices
сохранены. Supplier quantity в private input не изменён.

Точные актуальные test counts, команды, timings, changed DDL hashes и новые
test names: [hardening-validation-20261009.json](docs/pim-v3-foundation/hardening-validation-20261009.json).
TESTS_PASS = **181/181**, FAIL=0, SKIPPED=0: 172 committed tests (116 existing +
56 foundation/hardening) и 9 ранее созданных untracked workspace tests. Отдельный
focused run: 56/56. Дополнительные 9 tests не входят в hardening commit.
Исторический [validation-20261009.json](docs/pim-v3-foundation/validation-20261009.json)
остаётся evidence исходного d0389bc, не переименован в результат hardening.

Окружение: isolated Unix-socket MariaDB 11.8.6, retained PHP 8.4,
Playwright/system Chromium. Deployment PHP 8.2 и MySQL 8 не запускались.
PHP/JS syntax passed; isolated startup/repeated PDO SELECT 1 passed.

```text
PUBLIC_STOCK_QUANTITY_EXPOSED = false (foundation storefront DTO)
ORDER_STATES = NEW, WAITING_CONFIRMATION, CONFIRMED, CANCELLED, COMPLETED
CAPABILITIES_ADVERTISED = {pricing_policy_version: 1} (existing status)
CONTRACT_VERSION_3_ADVERTISED = false
WIRE_CONTRACT_STATUS = UNCONFIRMED
PIM_V3_SYNC_ENABLED = false
PRODUCTION_WRITES = 0
REAL_PIM_SYNC_CALLS = 0
COMMIT_2_STARTED = false
COMMIT_3_STARTED = false
```
