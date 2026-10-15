# CRM РУБІЖ — архитектура (этап 4)

Основа: [00-CRM_GAP_ANALYSIS](00-CRM_GAP_ANALYSIS.md). Принципы A1–A9 ТЗ этапа 4 обязательны; ниже — как они реализованы.

## Компоненты

```mermaid
flowchart LR
  B[Браузер сотрудника] -->|/crm/ static, CSP без unsafe-inline| CRM[crm.rubizh dist]
  B -->|/api/staff/* JSON, cookie rubizh_staff| R[staff/router.php]
  R -->|контракт| C[(contracts/crm/crm-api.json)]
  R --> AUTH[staff/auth.php, staff/security.php]
  R --> H[staff/* обработчики]
  H -->|те же функции, что у сайта| DOM[shop/* домен SITE]
  DOM --> DB[(MariaDB SITE)]
  H --> OWN[(таблицы CRM: задачи, уведомления, подання, сессии, TOTP, приглашения)]
  DOM --> AD[staff/adapters.php live/mock/off]
  AD --> MONO[MonoPay] & NP[Нова пошта] & SMS[TurboSMS] & MAIL[SMTP]
  CRON[shop/automation-worker.sh → staff/worker.php] --> DOM
```

## Решения

1. **Размещение**: `/crm/` на домене магазина сохраняется (gap-анализ не выявил причин менять). Отдельная cookie `rubizh_staff` (Secure, HttpOnly, SameSite=Strict, path `/api/staff`), отдельный API `/api/staff/*`, `Cache-Control: no-store`, `X-Robots-Tag: noindex`.
2. **Контракт-первым**: `contracts/crm/crm-api.json` — единственный источник маршрутов: метод, путь, право, step-up, обязательная версия заказа, идемпотентность, JSON Schema запроса и ответа. Роутер `staff/router.php` исполняет его; RBAC-матрица ([03](03-RBAC_MATRIX.md)) и API ([04](04-CRM_API.md)) генерируются из него (`dev/crm-contract-docs.mjs`); типы TS генерируются в `crm.rubizh/src/contract.gen.ts`; contract-тесты сверяют ответы со схемами.
3. **Изменяющее действие (A7)**: `роль/право → step-up (если указан) → expected_version (409 STALE_ORDER) → Idempotency-Key (заголовок, 32 hex, на попытку) → npLocked + транзакция → audit (кто, роль, что, было/стало, причина, IP-хеш, request_id)`. Ключ идемпотентности хранится в `rubizh_crm_idempotency` с хешем тела: повтор того же ключа с тем же телом → сохранённый ответ; иное тело → 409 `IDEMPOTENCY_CONFLICT`; после 5xx клиент обязан выдать новый ключ на новую осознанную попытку (M-11).
4. **Бизнес-логика только в SITE (A2)**: CRM-обработчики вызывают функции `shop/*`. Недостающие функции добавляются в SITE и используются обоими каналами: `shopCreateOrder` (оформление сайта и телефонный заказ), `shopConfirmLine`, `shopReplaceLine`, `shopRemoveLine`, `shopTransferToPacking`, `shopCompleteOrder`, `shopUpdateDelivery`, `shopAssignLineSupplier`, `npManualDeliver`, `shopAcceptInvoicePayment` (D-51).
5. **Деньги (A3, A8)**: «оплачено» — только `monoApplyEvent` (подписанный webhook / подтверждённое банком чтение) или `shopAcceptInvoicePayment` для оплаты по счёту ФОП (выписка банка, OWNER/ACCOUNTANT, step-up). Кнопки «зарахувати оплату» для карты нет. Суммы в API — целые копейки (`*_minor`), валюта 980; время — UTC ISO-8601, отображение Europe/Kyiv.
6. **Доставка (A4)**: статусы — только `npRefresh`/cron по ответу НП; исключения — `npManualDeliver` (OWNER, step-up, причина, пометка `manual` в истории) и `npResolveUnknown` (R6).
7. **Без наложенного платежа (A5)**: `npSaveProperties` никогда не содержит `BackwardDeliveryData`/`AfterpaymentOnGoodsCost` (проверка перед вызовом НП, тест); тексты/API/данные проверяются поиском по сборке.
8. **Права на сервере (A6)**: каждый маршрут контракта имеет право; MANAGER меняет только свои и неназначенные заказы (`crmOrderScope`), чужие — только просмотр/переназначение с причиной; WAREHOUSE не получает финансовых полей (`crmRedact`); ответы списков фильтруются по роли.
9. **Адаптеры (A9)**: `crmFeature(name)` → `live` (флаг ВКЛ), `mock` (staging + mock-транспорт), `off` (production без флага → 409 `FEATURE_NOT_CONNECTED` «Функція ще не підключена»). Флаги по умолчанию ВЫКЛ: `crm_enabled`, `crm_refund_live`, `crm_np_ttn_live`, `crm_np_tracking_live`, `crm_sms_live`, `crm_email_live` (CONFIG.md).
10. **Своё у CRM (A1)**: `rubizh_crm_tasks`, `rubizh_crm_notifications`, `rubizh_crm_saved_views`, `rubizh_staff_sessions`, `rubizh_staff_totp`, `rubizh_staff_invites`, `rubizh_crm_idempotency`, `rubizh_crm_settings`, `rubizh_crm_payment_reviews`; комментарии и audit — существующие append-only таблицы.
11. **Лимиты (R8/PL-1)**: неудачные входы — ключ IP+аккаунт, без вечной блокировки; API — ключ сессии сотрудника (не IP), поэтому офис за одним IP не блокирует коллег; тестовый стенд использует отдельные адреса/сессии, production-правила не ослабляются.
12. **Фронтенд**: React 19 + Vite 7; маршруты разделены code-splitting по разделам; токены макета в CSS-переменных; светлая тема по умолчанию; production-сборка без inline-стилей и скриптов (CSP без `unsafe-inline`); демо-данных в сборке нет.

## OWNER DECISION (временно приняты обратимые варианты)

| ID | Вопрос | Временное решение | Рекомендация |
|---|---|---|---|
| OD-4.1 | Себестоимость для валовой прибыли: PIM считает `payout`, но в SITE её не передаёт (`api/lib.php:211` вырезает); PIM менять запрещено | Формула реализована и протестирована; источник — приватная таблица SITE `rubizh_crm_sku_costs`, наполняется только будущим контрактом PIM; пока пусто — KPI «Валовий прибуток» показывает «Немає даних собівартості від PIM» | Добавить в контракт PIM v3 приватное поле `supplier_payout_minor` на этапе 5 |
| OD-4.2 | Роли: в SITE LOGISTICS/READ_ONLY | Миграция LOGISTICS→WAREHOUSE, READ_ONLY→SUPPORT, новая ACCOUNTANT; старые значения в конфиге — алиасы | Принять |
| OD-4.3 | «У комплектації» | Фактический статус SITE `processing` (не новый) | Принять |
| OD-4.4 | Абсолютное время сессии | 12 ч (ТЗ), было 8 ч | Принять |
| OD-4.5 | Телефонный заказ и аккаунт | Привязка к аккаунту только после SMS-входа покупателя с тем же номером (таблица `rubizh_phone_order_claims`) | Принять |
| OD-4.6 | D-54 (оптовая заявка) получен обрезанным после «номер» | Реализована часть до обрыва; номер заявки, уведомления и экран CRM — по аналогии с заказами | Подтвердить остаток требований |
| OD-4.7 | Пороги сегментов клиентов, автозадач | Настройки OWNER со значениями по умолчанию: VIP ≥ 3 оплаченных заказа или ≥ 20 000 ₴; автозадача — заказ без подтверждения > 30 мин, посылка без ТТН > 24 ч | Подтвердить значения |
