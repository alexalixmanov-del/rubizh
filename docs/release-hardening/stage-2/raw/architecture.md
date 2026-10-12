# RAW — ARCHITECTURE, агент ARCH (ecc:architect), SITE 51c83d8, PIM 21198461

Только статическое чтение (у агента не было Bash), без воспроизведения.

## ARCH-01 — HIGH — детали в закрытом хранилище

Исходная находка требует независимого воспроизведения на закреплённом SHA.

## ARCH-02 — HIGH — детали в закрытом хранилище

Исходная находка требует независимого воспроизведения на закреплённом SHA.

## ARCH-03 — MEDIUM, SUSPECTED — выключение `pim_v3_sync` — не откат
`shop/pim-v3-sync.php:22` (флаг читает только приём); витрина и оформление — по `meta.pim_v3_schema='2'` (`pim-v3-read.php:6-8`, `pim-v3-checkout.php:7-8`, `catalog-lib.php:38`); legacy `save_product` (`api/lib.php:300-317`) удаляет и пересоздаёт варианты без `pim_*`. Legacy-пакет с id модели v3 → модель без активных вариантов; `hide_products` может скрыть v3. Исправление: отклонять legacy-записи для `pim_contract_version=3`.

## ARCH-04 — HIGH — детали в закрытом хранилище

Исходная находка требует независимого воспроизведения на закреплённом SHA.

## ARCH-05 — MEDIUM, LIKELY — две реализации возврата с разными условиями
`shop/mono-lib.php:133-138` (legacy: требует `paid`, только полный) vs `staff/refunds.php:4-24` (CRM: частичный, `crmRefundState` пишет `paid` при частичном — может перезаписать `refunded` от `mono-lib.php:95`). Исправление: `monoRefund` — обёртка над журналом CRM; `crmRefundState` не понижает `refunded`.

## ARCH-06 — MEDIUM, LIKELY — проекция состояния заказа считается в нескольких местах и расходится
`shop/order-state.php:9-12`, `staff/read.php:15-24`, `shop/order-lifecycle.php:10`, `shop/customer-states.php:5-11` (legacy `new` без строк подтверждения; представление «оплата»; «SHIPPED» vs `IN_TRANSIT`/`TTN_CREATED`). Исправление: одна проекция + тест сопоставления.

## ARCH-07 — MEDIUM, LIKELY — legacy и v3 по-разному решают для заказов «счёт ФОП»
`shop/pim-v3-checkout.php:76-79`: v3 при полностью оплачиваемых строках и `invoice` → `CONFIRMED` без менеджера (срок 2 рабочих дня, письмо, возможна автоотмена); legacy — менеджер. Исправление: в v3 `$payment!=='card'` → `WAITING_CONFIRMATION`.

## ARCH-08 — LOW — черновик CRM ставит «наличие подтверждено» правом `shipment.manage` (`staff/operations.php:45-47`).
## ARCH-09 — LOW — ручная блокировка категории на SITE молча перекрывает категорию PIM (`shop/pim-v3-sync.php:221-228`).
## ARCH-10 — LOW — включение mock MonoPay частично зависит от Host (`shop/mono-lib.php:3`).
## ARCH-11 — LOW — клиент дублирует расчёт цен; мёртвый промокод «РУБІЖ10» (`assets/shop-client.2026101101.js:4074,5560-5563`); 19 старых бандлов в `assets/`.
## ARCH-12 — LOW — отмена из CRM записывается как отмена покупателем (`staff/operations.php:16` → `shopCancelOrder`).

## PIM (владелец PIM)
- **ARCH-P1 — LOW** — `PRODUCTION_SYNC_ENABLED`/`PRODUCTION_AUTOPRICES_ENABLED` (`app/lib/production-ui.inc.js:3`) не блокируют публикацию; `app/server-contract.md:3` устарел.

## Проверено, чисто
SITE не пишет в PIM (кроме ARCH-09); у CRM нет своей БД заказов, она вызывает доменные функции SITE (исключения ARCH-05, ARCH-06); единый `monoCreate` с повторной проверкой цены и готовности; подтверждение предзаказа через `npConfirm` во всех консолях; владение SKU во всех резолверах и синхронизациях; серверные флаги (`np_ttn_enabled`, `mono_activation_confirmed`, `pim_v3_sync`, staging); AUTOPRICES в SITE отсутствует.


## Coordinator disposition (2026-10-12)

Исходный raw относится к pinned baseline; это приложение не меняет независимый исходный вывод. ARCH-01, ARCH-04 исправлены regression-first и проверены; commits/tests/current status см. единый03 и checkpoint. Остальные redacted HIGH остаются приватными до исправления.
