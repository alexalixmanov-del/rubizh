# RAW — LOGISTICS (Nova Poshta), агент LOG (general-purpose), SITE 51c83d8

Все вызовы НП — через `RUBIZH_NP_TESTS` + `np_test_transport`. Воспроизведение: `scratchpad/audit/tmp-LOG/log-repro.test.mjs` (LOG-A, LOG-B, LOG-C — зелёные, т.е. дефекты воспроизводятся).

## LOG-01 — HIGH, CONFIRMED — сбой или лимит API НП полностью блокирует оформление
`shop/order.php:34` → `shop/np-lib.php:115-118` (`npValidateDelivery` → `npCity`/`npWarehouse` → `npCached` → `npApiCallOnce`); ошибки `order.php:59`; клиент `assets/shop-client.2026101101.js:6294-6295,6335`. Ручной режим — только без ключа. При ключе таймаут/5xx/битое тело → `NpUnknownResult`, 429 → `NpRateLimited` → заказ не сохраняется, 400 `CHECKOUT_FAILED` с текстом для ТТН («НП не підтвердила результат. Потрібна звірка, повторний випуск заблоковано.») или английским «Too many requests». Клиент при 503 справочника требует refs. LOG-C: 0 заказов. Нарушает правило «ошибки НП не ломают заказ». Исправление: при `NpUnknownResult`/`NpRateLimited` сохранять заказ с `np_delivery={manual:true, unverified_refs…}` и требовать перепроверку менеджером в `npAssertReady`; `NpNotFound` и неверные refs — ошибки покупателя; в клиенте — свободный ввод при 503.

## LOG-02 — HIGH, CONFIRMED — ТТН с неизвестным результатом без совпадения в НП — тупик
`shop/np-fulfillment.php:186` (нет совпадения → остаётся `unknown`), `:192` (отмена только `draft`/`error`), `:44-48` (`npRemaining` считает `unknown` распределённым), `:153`. Сверка с пустым `getDocumentList` → «Немає однозначного збігу у НП. Повтор заблоковано.»; отмена CRM → 409; новый черновик → «Кількість перевищує нерозподілений залишок»; привязать ТТН из кабинета НП нельзя. Оплаченный заказ не отгрузить без правки БД. Исправление: действие OWNER (повторный вход, аудит) «разрешить unknown»: (а) «в НП не создана» → `cancelled` после сверки старше N ч с 0 совпадений; (б) «привязать существующую ТТН» — 14 цифр, проверка через НП → `created`.

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
