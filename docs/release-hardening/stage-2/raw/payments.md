# RAW — PAYMENTS (MonoPay), агент PAY (ecc:code-reviewer), SITE 51c83d8

Слепой проход фазы 1 (без чтения реестра и отчётов этапа 1). Воспроизведение: `scratchpad/audit/tmp-pay/pay.test.mjs` (изолированный fixture, mock MonoPay, подписанные webhook) — PAY-A, PAY-B зелёные (подтверждают описанное поведение).

## PAY-01 — HIGH — детали в закрытом хранилище

Исходная находка требует независимого воспроизведения на закреплённом SHA.

## PAY-02 — HIGH — детали в закрытом хранилище

Исходная находка требует независимого воспроизведения на закреплённом SHA.

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


## Coordinator disposition (2026-10-12)

Исходный raw относится к pinned baseline; это приложение не меняет независимый исходный вывод. PAY-01 исправлены regression-first и проверены; commits/tests/current status см. единый03 и checkpoint. Остальные redacted HIGH остаются приватными до исправления.
