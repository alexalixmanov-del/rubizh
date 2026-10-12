# RAW — LOGISTICS (Nova Poshta), агент LOG (general-purpose), SITE 51c83d8

Все вызовы НП — через `RUBIZH_NP_TESTS` + `np_test_transport`. Воспроизведение: `scratchpad/audit/tmp-LOG/log-repro.test.mjs` (LOG-A, LOG-B, LOG-C — зелёные, т.е. дефекты воспроизводятся).

## LOG-01 — HIGH — детали в закрытом хранилище

Исходная находка требует независимого воспроизведения на закреплённом SHA.

## LOG-02 — HIGH — детали в закрытом хранилище

Исходная находка требует независимого воспроизведения на закреплённом SHA.

## LOG-03 — MEDIUM, CONFIRMED — состояния отправки не монотонны; удалённая в НП ТТН оставляет заказ «отправлен»
`shop/np-fulfillment.php:194-195`, `:202`, `:207-219`. Коды 101/104/106/111/112/12 → `manual`; код 1 после `sent` → `created`; код 2 → `cancelled`, агрегация выходит рано — заказ остаётся `shipped`/`TTN_CREATED`, строки снова нераспределены, поставщик не уведомлён; `returned` не меняет `pim_fulfillment_state`. LOG-A: 5 → `sent/IN_TRANSIT`; 101 → `manual/TTN_CREATED`; 1 → `created`; 2 → `cancelled/shipped`. Исправление: 101/104/111/112/12 → `sent`, 106 → `delivered`; только вперёд; `cancelled` после `sent` → `manual` + аудит; без живых отправлений — `confirmed`/READY_TO_SHIP + аудит; уведомление поставщику.

## LOG-04 — MEDIUM, LIKELY — два источника точек отправки и отправителя
`staff/operations.php:42` (`rubizh_sender_profiles`) vs `shop/np-manager.php:33` (config), `staff/schema.php:31` (засев один раз). Исправление: единственный источник — профили.

## LOG-05 — MEDIUM, LIKELY — строки без поставщика в оплаченном заказе нельзя исправить
`shop/pim-v3-checkout.php:68`, `np-fulfillment.php:59,91`, `order-validation.php:97`. Исправление: действие `shipment.manage` с аудитом для строк без кода при отсутствии живых отправлений.

## LOG-06 — MEDIUM, LIKELY — CRM не может исправить/проверить адрес доставки
`shop/np-manager.php:40-46` (только legacy), `np-fulfillment.php:122,158`; `npAssertReady:122` принимает ручной адрес. Исправление: CRM `/orders/{id}/delivery`; явный отказ для `manual`/без `city_ref`.

## LOG-07 — LOW, LIKELY — legacy-черновик без оплаты; черновик у отменённого по истечению заказа; «повтор заблоковано» при сбое чтения до `creating` (`np-manager.php:28-31`, `mono-lib.php:97`, `npCreate:158`).

## LOG-08 — LOW, LIKELY — агрегация отправки игнорирует последующий возврат денег (`np-fulfillment.php:206-214`) — флаг `SHIPMENT_REVIEW_REQUIRED`.

## Проверено, чисто
Фиктивные ТТН не доходят до покупателя и поставщика; распределение строк/количеств/стоимости; идемпотентность `operation_key` + маркер `RB-<key>`; проверка точки и отправителя перед созданием; серверная проверка города/отделения при оформлении (ручной режим без ключа работает); отмена покупателем блокируется после черновика; отмена по истечению не трогает оплаченный; COMPLETED только доставлен + оплачен.


## Coordinator disposition (2026-10-12)

Исходный raw относится к pinned baseline; это приложение не меняет независимый исходный вывод. LOG-01 исправлены regression-first и проверены; commits/tests/current status см. единый03 и checkpoint. Остальные redacted HIGH остаются приватными до исправления.
