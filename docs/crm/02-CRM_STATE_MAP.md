# CRM РУБІЖ — карта состояний (этап 4)

Источник — фактические значения SITE (новых состояний нет). Проекция считается на сервере (`staff/status.php`, `crmDisplayStatus`) и одна для списка, карточки, мобильной карточки и экспорта; тест `tests/crm-stage4-status.test.mjs`. Три статуса показываются раздельно, как в кабинете покупателя.

## 1. Заказ

| SITE (`status` / v3 `pim_order_state`) | CRM | Код |
|---|---|---|
| v3 `NEW` | нове | `NEW` |
| `new` (legacy) или v3 `WAITING_CONFIRMATION` | очікує підтвердження менеджера | `WAITING_CONFIRMATION` |
| `confirmed` / v3 `CONFIRMED` | підтверджене | `CONFIRMED` |
| `processing` | у комплектації | `PACKING` |
| `partially_shipped`, `shipped`, `delivered`, `partially_returned`, `returned` (не завершён) | передане на доставку | `HANDED_TO_DELIVERY` |
| `completed` / v3 `COMPLETED` | завершене | `COMPLETED` |
| `cancelled` / v3 `CANCELLED` | скасоване | `CANCELLED` |

## 2. Оплата

| SITE (`payment_status`, счета `rubizh_mono_invoices`, ledger возвратов, `rubizh_order_timing`) | CRM | Код |
|---|---|---|
| не оплачен, счёта нет, заказ ещё не подтверждён/не готов к оплате | ще не виставлено | `NOT_ISSUED` |
| открытый счёт (`creating/created/processing/hold/awaiting_webhook`) или способ `invoice` (рахунок ФОП) до `payment_due` | очікує оплати | `AWAITING` |
| `paid`, нет успешных возвратов | оплачено | `PAID` |
| последний счёт `failure`, до `payment_due` | неуспішно | `FAILED` |
| последний счёт `expired`, до `payment_due` | рахунок прострочено (можна оплатити повторно до `payment_due`) | `EXPIRED_RETRY` |
| успешные возвраты < оплачено | повернено частково | `PARTIALLY_REFUNDED` |
| возвраты = оплачено / `refunded` | повернено | `REFUNDED` |
| счёт/возврат `unknown`, спорное событие MonoPay не разобрано (CRM-4.1), конфликт проекции, `invoice` после `payment_due` (D-51 «потребує звірки виписки») | потребує перевірки | `NEEDS_REVIEW` |

## 3. Доставка

| SITE (`rubizh_order_shipments.status`) | CRM | Код |
|---|---|---|
| нет живых посылок | не створено | `NONE` |
| только `draft`/`creating`/`created` (ТТН есть, НП ещё не приняла) | готується | `PREPARING` |
| хотя бы одна `sent` | відправлено (посилка N із M) | `SENT` |
| все `delivered` и все строки распределены | доставлено | `DELIVERED` |
| хотя бы одна `returned` | повернення | `RETURNING` |
| `unknown`, `error`, `manual` (R6: ТТН с неизвестным результатом) | потребує розбору | `NEEDS_REVIEW` |

## 4. Действия и роли

Право → роли — [03-RBAC_MATRIX](03-RBAC_MATRIX.md). Всё через SITE, версия заказа (409), Idempotency-Key, audit. «Свой» для MANAGER = назначен на него или не назначен.

| Действие | Доступно в состоянии | Роли |
|---|---|---|
| Взяти в роботу / призначити | любое кроме `COMPLETED`/`CANCELLED`; переназначение чужого — причина | OWNER, MANAGER |
| Підтвердити залишок по рядку | заказ `WAITING_CONFIRMATION`/`CONFIRMED`, не отправлен | OWNER, MANAGER |
| Немає в наявності → замінити (согласие клиента, новая проверка цены) / прибрати позицію (пересчёт сервером) | до оплаты, строка не в посылке | OWNER, MANAGER |
| Підтвердити замовлення / предзаказ v3 | `WAITING_CONFIRMATION`; при изменении цены — блок `PRICE_CHANGED` | OWNER, MANAGER |
| Надіслати / скопіювати посилання на оплату | `CONFIRMED`/`PACKING`, оплата `NOT_ISSUED`/`AWAITING`/`FAILED`/`EXPIRED_RETRY` до `payment_due` (R5, один открытый счёт) | OWNER, MANAGER |
| Скасувати (причина) | до оплаты, без живых посылок | OWNER, MANAGER |
| Позначити проблему / зняти | любое | OWNER, MANAGER, WAREHOUSE |
| Передати в комплектацію | `CONFIRMED` + `PAID` | OWNER, MANAGER |
| Створити відправлення / ТТН | `PAID`/`PARTIALLY_REFUNDED`, наличие подтверждено | OWNER, MANAGER, WAREHOUSE |
| Видалити ТТН до передачі | посылка `draft`/`error` до `sent` | OWNER, MANAGER, WAREHOUSE |
| Розбір ТТН з невідомим результатом (R6) | посылка `unknown`/`creating` | OWNER (step-up) |
| Підтвердити доставку вручну (M-4) | посылка `sent`/`manual` | OWNER (step-up, причина) |
| Завершити | все посылки доставлены, `PAID`/`PARTIALLY_REFUNDED`/`REFUNDED` | OWNER, MANAGER |
| Запит повернення | `PAID`/`PARTIALLY_REFUNDED` | OWNER, MANAGER, SUPPORT |
| Розгляд повернення (схвалити/відхилити) | `REQUESTED` | OWNER, MANAGER |
| Товар отримано | `APPROVED`/`IN_TRANSIT` | OWNER, MANAGER, WAREHOUSE |
| Повернення коштів (повне/часткове ≤ оплачено − повернено) | `PAID`/`PARTIALLY_REFUNDED` | OWNER (step-up, версия — CRM-4.2) |
| Перевірити в банку зараз / Позначити розглянутим (CRM-4.1) | есть спорное событие | OWNER |
| Ручна звірка: рахунок у банку не створено (R-C1) / прив’язати invoice_id | счёт `creating`/`unknown` | OWNER (step-up) |
| Прийняти оплату за рахунком ФОП (D-51) | способ `invoice`, не оплачен, до окончательной отмены | OWNER, ACCOUNTANT (step-up) |
| Виправити адресу доставки (LOG-06) | до создания ТТН | OWNER, MANAGER |
| Призначити постачальника рядку (LOG-05) | строка без поставщика, нет живых посылок | OWNER, MANAGER, WAREHOUSE |
| Коментар | любое | OWNER, MANAGER, WAREHOUSE, SUPPORT |
| Задача | любое | все роли |
