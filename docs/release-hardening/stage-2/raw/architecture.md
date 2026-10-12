# RAW — ARCHITECTURE, агент ARCH (ecc:architect), SITE 51c83d8, PIM 21198461

Только статическое чтение (у агента не было Bash), без воспроизведения.

## ARCH-01 — HIGH, LIKELY — заказ, оплаченный сразу при оформлении, нельзя отгрузить через консоли SITE
`shop/pim-v3-checkout.php:76-79` (Q-7 и полностью оплачиваемый v3 → `confirmed` при оформлении), `shop/order.php:42-52` (строка `rubizh_np_order_confirmations` не пишется), `shop/np-fulfillment.php:91` (`npConfirm` отказывает оплаченному: «Замовлення оплачене або закрите»), `:112` (`npAssertReady` требует `availability_confirmed=1`). Покупатель оплатил → менеджер не может подтвердить наличие → «Спочатку підтвердьте наявність і комплектацію» при создании ТТН. Единственный обход — черновик CRM (`staff/operations.php:47`), CRM в production не развёрнута. Нет теста Q-7 → отгрузка. Исправление: в `npConfirm` разрешить подтверждение комплектации оплаченного заказа (только `availability_confirmed`, без пересчёта и сроков, с аудитом) или писать строку подтверждения системой при `payment_now`; тест «Q-7 → оплачено → черновик → ТТН».

## ARCH-02 — HIGH, LIKELY — legacy-синхронизацию PIM нельзя выключить на стороне SITE
`api/index.php:27-72` (legacy отклоняется только после включения v3, `:37`), `api/lib.php:232-338` (`save_product`), `:340` (`hide_products`), `api/index.php:46` (`hide_unavailable`), `:58` (`sync_kits`). Любой с `pim_key` (ключ лежит в браузерной конфигурации PIM; legacy `sitePublish` ещё есть в `rubizh_pim.html:8658`) может менять цены, наличие, остаток, скрывать товары, переключать `hide_unavailable`, заменять готовые комплекты; legacy `in` + числовой остаток сразу ведёт на оплату Q-7. Правило «PIM→SITE sync OFF» сервером не обеспечено. Исправление: `cfg('pim_legacy_sync')===true` (по умолчанию false), иначе 409 `LEGACY_SYNC_DISABLED`.

## ARCH-03 — MEDIUM, SUSPECTED — выключение `pim_v3_sync` — не откат
`shop/pim-v3-sync.php:22` (флаг читает только приём); витрина и оформление — по `meta.pim_v3_schema='2'` (`pim-v3-read.php:6-8`, `pim-v3-checkout.php:7-8`, `catalog-lib.php:38`); legacy `save_product` (`api/lib.php:300-317`) удаляет и пересоздаёт варианты без `pim_*`. Legacy-пакет с id модели v3 → модель без активных вариантов; `hide_products` может скрыть v3. Исправление: отклонять legacy-записи для `pim_contract_version=3`.

## ARCH-04 — HIGH, LIKELY — legacy-консоль менеджера обходит проверку версии заказа (правило Q-5)
`shop/np-manager.php:22-27` (`mono_reconcile`, `mono_refund`, `confirm` без версии), `shop/order-confirm.php:9`; в `financial-actions.php:15-19` и CRM `staff/operations.php:14` проверка есть. Старая вкладка владельца → возврат/сверка/повторное подтверждение по устаревшим данным (повторное подтверждение перезапускает срок оплаты). Исправление: скрытое `expected_updated_at` в формах консоли и в контракте `order-confirm.php`, сравнение под `npLocked`.

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
