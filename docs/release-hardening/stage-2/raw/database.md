# RAW — DATABASE, агент DB (ecc:database-reviewer), SITE 51c83d8

MariaDB 11.4.13, STRICT_TRANS_TABLES, REPEATABLE-READ, utf8mb4_general_ci. Скрипты: `scratchpad/audit/tmp-db/` (`setup.sql`, `gap.sh`). Fixture-тесты PHP не запускались; DB-01 воспроизведён на уровне SQL.

## DB-01 — HIGH — детали в закрытом хранилище

Исходная находка требует независимого воспроизведения на закреплённом SHA.

## DB-02 — HIGH — детали в закрытом хранилище

Исходная находка требует независимого воспроизведения на закреплённом SHA.

## DB-03 — HIGH — детали в закрытом хранилище

Исходная находка требует независимого воспроизведения на закреплённом SHA.

## DB-04 — MEDIUM, LIKELY — ленивая DDL создаёт `rubizh_stock_reservations` без `status/committed_at/released_at`
`shop/order-lifecycle.php:21` vs `shop/order-p0-schema.php:7-9` (только CLI) vs `shop/reservations.php:17,23,31`. На БД без `meta.runtime_schema` и без P0 первый веб-запрос создаёт старую таблицу → каждое оформление и переход оплаты падает «Unknown column» (503). `prepare-runtime.php:7` отказывает в P0 при наличии заказов; CRM-миграцию не вызывает ни один установщик. Исправление: колонки в ленивом CREATE или fail-closed в `/health.php` и оформлении без `meta.order_p0_schema='1'`; установщики всегда вызывают prepare-runtime и миграцию CRM.

## DB-05 — MEDIUM (LOW при текущем объёме), LIKELY — запросы тика жизненного цикла и воркера оплат без индексов
`order-lifecycle.php:~51` (LEFT JOIN timing … `t.order_id IS NULL AND o.status IN …`), `:~52` (`OR` по двум колонкам — индекс `payment_due` не используется), `mono-lib.php:129-130` (`status IN …`, `ORDER BY RAND()`, есть только `INDEX(order_id)`); у `rubizh_customer_orders` только `INDEX(email,created_at)`; индексы CRM — только после миграции CRM; список CRM `staff/read.php:10` — `LIKE '%…%'` по JSON, `COUNT(*)`, OFFSET до 100000. Исправление: `KEY(status,payment_status,created_at)`, `KEY(status,updated_at)` на `rubizh_mono_invoices`; разделить ветки `OR`; убрать `ORDER BY RAND()`; миграция CRM в установщике.

## DB-06 — LOW, LIKELY — `SELECT p.*` для карточек каталога тянет MEDIUMTEXT
`shop/catalog-lib.php:155`, `api/index.php:163`; поиск `LOWER(p.name) LIKE '%w%'` (полный проход), OFFSET. Исправление: только колонки карточки.

## DB-07 — LOW, SUSPECTED — `modified_at` банка хранится как VARCHAR(40)
`shop/mono-lib.php:6,73,90,91`, `order-lifecycle.php:35` (`ORDER BY modified_at` по строке). Разные форматы смещения сортируются неверно (влияет на `paid_at` для пожертвования); строка > 40 символов в strict-режиме → PDOException. Только при валидной подписи банка. Исправление: нормализовать в UTC DATETIME.

## Проверено, чисто
Транзакция создания заказа (`order.php:41-58`: откат на всех путях, идемпотентность `GET_LOCK`, внешние вызовы вне транзакции, единый порядок блокировок meta → products → variants); последняя единица одного SKU (сериализуется `FOR UPDATE` по variants); оформление/истечение/оплата/освобождение (`npLocked`, порядок блокировок, отказ в отмене при открытом счёте); MonoPay (`creating` фиксируется до внешнего вызова, `monoApplyEvent` блокирует строку счёта); время (всё UTC, рабочие дни через Europe/Kyiv с учётом DST, OTP — epoch); collation (единственное смешение `utf8mb4_bin` ↔ default работает, индекс используется); миграции (версионированы, аддитивны, повторяемы; отката БД нет — пробел, не дефект); `shopLimit` (корректный upsert).
