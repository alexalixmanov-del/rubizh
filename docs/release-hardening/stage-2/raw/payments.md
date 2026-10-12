# RAW — PAYMENTS (MonoPay), агент PAY (ecc:code-reviewer), SITE 51c83d8

Слепой проход фазы 1 (без чтения реестра и отчётов этапа 1). Воспроизведение: `scratchpad/audit/tmp-pay/pay.test.mjs` (изолированный fixture, mock MonoPay, подписанные webhook) — PAY-A, PAY-B зелёные (подтверждают описанное поведение).

## PAY-01 — HIGH, CONFIRMED (оплачен + отменён), LIKELY (перепродажа остатка)
- Файлы: `shop/order-lifecycle.php` `shopLifecycleTick` (`shopNoOpenCardInvoice` → `shopCancelOrder`); `shop/store-lib.php:139` `shopNoOpenCardInvoice` (не считает открытым `failure`); `shop/mono-lib.php` `monoApplyEvent` (успех без проверки статуса заказа).
- Сценарий: неудачная попытка карты → подписанный `failure`; счёт в банке ещё оплачиваем (код это признаёт: `monoInvalidateFailed` удаляет его перед новым); на `payment_due` тик не видит «открытого» счёта и отменяет заказ, не удаляя счёт в банке; покупатель платит по старой странице → `success` применяется безусловно.
- Доказательство: PAY-A — после тика `cancelled/failed`, после позднего успеха `cancelled/paid`, `pim_order_state=CANCELLED`, `pim_payment_state=PAID`. `shopReservationTransition(...,'COMMITTED')` переводит RELEASED/EXPIRED в COMMITTED без проверки остатка → двойное занятие последней единицы.
- Влияние: деньги списаны за отменённый заказ без автоматического возврата; возможна перепродажа.
- Исправление: считать `failure`-счёт, не удалённый в банке (и не `expired`), открытым при отмене (или удалять в банке и проверять результат перед отменой); в ветке успеха для отменённого заказа / не-ACTIVE резерва не делать COMMITTED, а помечать для менеджера (возврат / проверка остатка) с записью в аудит.

## PAY-02 — HIGH, CONFIRMED (последствия), LIKELY (триггер)
- Файлы: `shop/mono-lib.php` `monoCreate` (catch → `status='unknown'` при любом исключении, в т.ч. таймаут/5xx, когда счёта в банке может не быть); `monoWorkerRun` выбирает только `created/processing/hold`; `shopNoOpenCardInvoice`, `shopUseInvoice`, `shopCancelOrder`, `shopReservedQty`, `shopLifecycleTick` считают `unknown`/`creating` открытыми; обрыв процесса между вставкой и вызовом банка оставляет `creating`.
- Сценарий: один временный сбой банка при создании счёта → повтор оплаты «Результат створення рахунку потребує звірки», нельзя перейти на ФОП или отменить, дедлайн не отменяет, резерв держится бессрочно; выход только `monoReconcile` (OWNER, нужен invoiceId из кабинета банка — если счёт не создан, его нет).
- Доказательство: PAY-B — счёт `unknown`, срок прошёл: после тика `confirmed/pending`, счёт `unknown`; после трёх прогонов воркера — `unknown`.
- Исправление: путь автоматического разрешения `unknown`/`creating` (поиск по reference или истечение строк без invoice_id через N минут с аудитом); в сверке менеджера — «счёт в банке не создан».

## PAY-03 — MEDIUM, CONFIRMED (существующим тестом)
- `shop/mono-lib.php` `monoApplyEvent` ветка `expired`; счёт создаётся с `validity=>3600`.
- Покупатель закрыл страницу оплаты → через ~1 ч `expired` (webhook или воркер) отменяет заказ и освобождает резерв, хотя квитанция обещает срок оплаты 2 рабочих дня.
- Исправление: на `expired` ставить `payment_status='failed'` (повтор возможен) и отменять только по `payment_due`, либо validity = остаток до `payment_due`.

## PAY-04 — MEDIUM, LIKELY
- `shop/financial-actions.php`: сравнение `expected_updated_at` до `monoRefund`/`monoReconcile`, которые берут `npLocked` сами (CRM `crmRefund` проверяет версию внутри блокировки — верно).
- Окно между проверкой и блокировкой; частично смягчено `refund_status` и перечитыванием `payment_status` под блокировкой.
- Исправление: передавать версию в `monoRefund`/`monoReconcile` и сравнивать после `npOrder` под блокировкой.

## PAY-05 — MEDIUM, LIKELY
- `shop/mono-lib.php` `monoRefund`, `monoWorkerRun`: воркер выбирает счета с `refund_status` processing/unknown, но `monoRefresh` читает только статус счёта → лишь строка аудита `mono_observed_success` каждый цикл; возврат завершается только webhook `reversed`; неудачный/неизвестный возврат навсегда блокирует legacy-возврат.
- Исправление: читать результат отмены в банке для строк возврата; дедуплицировать `mono_observed_*`.

## PAY-06 — LOW, CONFIRMED (статически)
- Остатки наложенного платежа: ветки `payment_method==='cod'` в `assets/shop-client.2026101101.js` (~7115-7129), `shop/order.php:44` (`$pay==='cod'?'cod'` — мёртвый код), подписи в `auth/order-detail.php:3`, `shop/customer-states.php:10`, `auth/email-templates.php:73`. Для новых заказов недостижимо (сервер принимает только `card`/`invoice`), касается исторических строк.

## Проверено, чисто
Наложенный платёж (сервер, ТТН); подпись webhook (ECDSA по сырому телу, ограниченное обновление ключа, 64 КБ, подделка → 403); повтор и порядок (хеш события, monotonic modifiedDate, без отката success/reversed, awaiting_webhook); сумма/валюта/invoiceId (копейки, 980; парковка + pull-сверка без движения денег, дедупликация 60 с, сбой чтения → 200 и аудит); неизвестный invoiceId → 503 намеренно (без строки аудита, только error_log; число повторов банка не проверено); конкурентность (`npLocked`, таймаут → 503); недопустимая оплата (shopPaymentReady, monoCreate, v3 revalidate; единый monoCreate для UI/API/CRM); суммы (`monoMinor` округление безопасно для 2 знаков); права возврата и сверки.

Не полностью проверено агентом: точные сроки резерва для сразу оплачиваемых заказов в legacy-консоли; пути отмены/подтверждения CRM `staff/operations.php`.
