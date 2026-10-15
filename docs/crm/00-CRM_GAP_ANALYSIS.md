# CRM РУБІЖ — инвентаризация и gap-анализ (этап 4, фаза 0)

Дата: 2026-10-15. База: SITE `rubizh-stage-3-verified` = `6c0b15c`, CRM frontend `b0e2f93` (ветка `work`), PIM `fix/pimc-p1` = `5fd46cb` (только чтение).
Эталон дизайна: макет `lieverifying/usa.mobile/index.html` (автономный React-бандл с синтетикой; эталон UX, не архитектуры).
Исходная регрессия на базе: CRM-файлы 17/17 PASS (`tests/crm-*.test.mjs`, macOS).

Обозначения статуса: **ЕСТЬ** — работает с серверными данными; **ЧАСТИЧНО**; **НЕТ**; **ПРОТИВОРЕЧИТ** — макет нарушает правила A1–A9 / решения владельца.

## 1. Структура CRM

| Слой | Где | Что |
|---|---|---|
| Staff API (SITE) | `api/staff/index.php:1-36` | единый роутер `if/preg_match`, JSON `{ok,data,meta{request_id,csrf}}`, ошибки `{ok:false,error{code,message,details}}` (`:36`) |
| Сессия/вход | `staff/bootstrap.php:11-16`, `staff/auth.php:10-27` | cookie `rubizh_staff` (path `/api/staff`, HttpOnly, Secure при HTTPS, SameSite=Strict), бездействие 1800 с, абсолютно 28800 с, `session_version` для отзыва; bcrypt; лимит неудачных входов `staff-login-failed` 8/900 с по IP+email с PoW-проверкой (R8) |
| Права | `staff/auth.php:4-8,16` + `shop/financial-permissions.php:5-14,32-44` | роли OWNER/MANAGER/LOGISTICS/READ_ONLY; права в таблице `rubizh_staff_permissions` (засев из кода) + проверка домена SITE |
| Чтение | `staff/read.php` | заказы (фильтры/вкладки/поиск/пагинация `:8-34`), DTO заказа с версией sha256 (`:36-44`), клиенты (аккаунты ∪ гостевые контакты `:52-67`), кандидаты SKU (`:68`) |
| Изменения | `staff/operations.php`, `staff/refunds.php` | назначение, подтверждение (`npConfirm`), отмена (`shopCancelOrder`), счёт (`monoCreate`), ручная сверка (`monoReconcile`), заметки, возвраты товара, отправления НП, профили отправителя, денежный возврат (ledger `rubizh_refund_operations`) |
| Отчёты | `staff/reports.php` | период Europe/Kyiv (`:3-5`), выручка по событиям MonoPay (`:6-14`), дашборд (`:18-21`), audit (`:22-28`), списки платежей/отправлений/возвратов (`:29-33`), сотрудники (`:34-36`) |
| Схема | `staff/schema.php:4-34` | 11 таблиц + 4 append-only триггера + 5 индексов, журнал `rubizh_crm_migrations` с hash-контролем дрейфа, `meta.crm_schema=1`, только CLI |
| Мост | `shop/crm-bridge.php` | SITE без файлов CRM работает, пока CRM не включён; частичная выкладка — fail-closed |
| Frontend | `crm.rubizh/src/*.tsx` (6264 строки) | React 19 + Vite 7 + TanStack Query + react-router; тёмная тема по умолчанию; 9 пунктов меню (`src/shell.tsx:53-63`) |
| Сборка/отдача | `vite.config.ts` (`base:/crm/`), `public/.htaccess` | `dist/` копируется в SITE `/crm/`; SPA-fallback; CSP **с `style-src 'unsafe-inline'`**; CI SITE собирает CRM на закреплённом SHA (`.github/workflows/ci.yml:34-38,52-56`) |
| Связь версий | CI SITE: `alexalixmanov-del/crm.rubizh@b0e2f93` | канонический remote CRM = `alexalixmanov-del/crm.rubizh` (копия `lieverifying/crm.rubizh`) |

## 2. Экраны и функции макета

| Макет | CRM `b0e2f93` | SITE | Статус / решение |
|---|---|---|---|
| Меню 5 групп (ОСНОВНЕ…СИСТЕМА), 14 пунктов, скрытие по правам | 9 плоских пунктов, без групп и фильтра по правам | — | ЧАСТИЧНО → переделать |
| Светлая тема по умолчанию, тёмная запоминается | тёмная по умолчанию (`src/shell.tsx:191`) | — | ПЕРЕДЕЛАТЬ |
| Огляд: KPI, график сравнения, статусы, последние, «Потребує уваги», популярные товары, работа менеджеров | KPI сегодня/очереди (`src/overview.tsx`) | `crmDashboard` | ЧАСТИЧНО: нет периода сравнения, популярных товаров, работы менеджеров, валовой прибыли |
| Замовлення: вкладки со счётчиками, фильтры, колонки, сортировка, пагинация, массовые действия, экспорт, «Зберегти подання» | вкладки без счётчиков, фильтры, сортировка, пагинация, подання в `localStorage` | `crmOrders` | ЧАСТИЧНО: нет счётчиков, колонок, массовых действий, экспорта, серверных подань; мобильных карточек нет (таблица со скроллом) |
| Карточка заказа: товары, «Постачальники та наявність», посылки по поставщикам, покупатель, финансы, быстрые действия, комментарии, история, задачи | состав, оплаты, отправления, заметки, история timeline | действия SITE | ЧАСТИЧНО: нет подтверждения остатка по строке, замены/удаления позиции, задач, передачи в комплектацию, «Завершити», исправления адреса (LOG-06), строк без поставщика (LOG-05) |
| «Створити замовлення» (телефонный) | НЕТ | логика оформления встроена в `shop/order.php:30-60`, не функция | НЕТ → вынести `shopCreateOrder` (A2) |
| «Підтвердити оплату» / ручной перевод в «оплачено» | — | — | ПРОТИВОРЕЧИТ A3 (M-2) → не делать |
| «Післяплата» (в т.ч. текст аналитики) | — | — | ПРОТИВОРЕЧИТ A5 (M-1) → не делать |
| Линейная цепочка статусов | — | — | ПРОТИВОРЕЧИТ (M-3) → машина состояний SITE |
| Клієнти | список/карточка (`src/sections.tsx:115-270`) | `crmCustomers` | ЧАСТИЧНО: нет сегментов, маскирования, аудита просмотра телефона |
| Завдання | НЕТ | НЕТ | НЕТ → новая таблица CRM (своё по A1) |
| Аналітика | «Звіти» (`src/overview.tsx:192`) | `crmReports` | ЧАСТИЧНО: нет валовой прибыли, разрезов, новых/повторных; **себестоимость PIM в SITE не передаётся** (см. §6) |
| Платежі | список/детали/возврат (`src/sections.tsx:273,436`) | `crmList`, `crmRefund` | ЧАСТИЧНО: нет CRM-4.1 «Потребують перевірки», R-C1 (кнопка шлёт `invoice_id` последнего платежа — `src/orders.tsx:605`) |
| Повернення | есть (`src/sections.tsx:311,773`) | `crmReturnCreate/Transition` | ЧАСТИЧНО: денежный возврат без обязательной версии (CRM-4.2), без повторного входа в UI |
| Товари | НЕТ | `variants`/`products` (зеркало PIM) | НЕТ → только чтение |
| Постачальники | НЕТ (профили отправителя в Налаштування) | `rubizh_sender_profiles`, `npOrigins()` | НЕТ → чтение + профиль отправителя (OWNER) |
| Доставка | «Відправлення» (`src/sections.tsx:291,618`) | `npDraft/npCreate/npRefresh/npReconcile` | ЧАСТИЧНО: нет разбора ТТН R6 (есть только в SITE-форме `npResolveUnknown`), нет cron-трекинга с lock в CRM-контуре |
| Співробітники | в Налаштування (`src/sections.tsx:1102-1309`) | `crmStaffSave` | ЧАСТИЧНО: нет приглашения по ссылке, принудительного выхода, повторного входа (CRM-SEC-FRESH-01), TOTP |
| Активність | «Журнал дій» (`src/sections.tsx:996`) | `crmAuditRows` | ЧАСТИЧНО: MANAGER видит всё кроме финансов, а не «свои заказы» |
| Сповіщення | поповер «Потребують уваги» | НЕТ | НЕТ → таблица уведомлений CRM |
| Налаштування | сотрудники + отправители | — | ЧАСТИЧНО: нет личных настроек, сессий, порогов, флагов |
| ⌘K | есть (`src/shell.tsx:437`) | `/search` | ЧАСТИЧНО: нет SKU-поиска отдельно, нет учёта прав для клиентов |
| Демо-режим, DEMO-PAY/DEMO-NP | — | — | только в макете; в сборке не должно быть (тест) |

## 3. Серверные функции SITE, используемые CRM

| Функция | Файл | Право | Версия заказа | Audit |
|---|---|---|---|---|
| `npConfirm` (подтверждение, предзаказ v3 через `pimV3ConfirmRequests`) | `shop/np-fulfillment.php:83-118` | `order.confirm` | CRM-хеш под `npLocked` (`monoCrmVersionChecked` `shop/mono-lib.php:195`) | `npAudit`, `shopOrderAudit` (ручная сверка) |
| `shopValidateOrder` / `shopAcceptOrderQuote` | `shop/order-validation.php:17` | — / OWNER | — | цена: `PRICE_CHANGED` + `quote_hash` |
| `monoCreate` (счёт, R5: без конфликтующих счетов) | `shop/mono-lib.php:21-38` | `payment.invoice.create` | — (вызов под CRM-версией) | `shopOrderAudit payment.invoice.create` |
| `monoReconcile` (ручная сверка по invoice_id) | `shop/mono-lib.php:210-217` | `payment.manual_reconcile` + step-up | CRM-хеш | да |
| `monoReconcileNotCreated` (R-C1: попытка без id → failure) | `shop/mono-lib.php:167-175` | `payment.manual_reconcile` + step-up | да | да — **CRM не вызывает** |
| `monoParkedReconcile`/`MonoEventRejected` (спорные события) | `shop/mono-lib.php:62-88` | система | — | `rubizh_np_audit` `mono_event_rejected`, `mono_parked_reconcile` — **CRM не показывает** (CRM-4.1) |
| `crmRefund` (частичный/полный возврат по ledger) | `staff/refunds.php:10-27` | `payment.refund.execute` + step-up | **необязательна** (`$version=null`, CRM-4.2) | да |
| `monoRefund` (полный, SITE-форма) | `shop/mono-lib.php:203-209` | то же | `updated_at` | да |
| `shopCancelOrder` | `shop/store-lib.php:171-176` | `order.cancel` (CRM) | CRM-хеш | `npAudit customer_cancelled` (ARCH-12: записывается как отмена покупателем) |
| `npDraft/npCreate/npRefresh/npReconcile/npCancelDraft` | `shop/np-fulfillment.php:72,163,264,235,246` | `shipment.manage` | CRM-хеш | `npAudit` |
| `npResolveUnknown` (R6) | `shop/np-fulfillment.php:204-234` | OWNER + step-up | — | да — **CRM не вызывает** |
| `shopReservationTransition/shopReserveLines` (R4) | `shop/reservations.php` | система | — | `reservation.*` |
| `crmSenderSave`, `crmStaffSave` | `staff/operations.php:38`, `staff/reports.php:34` | `settings.manage`, `staff.manage` | `version`/`session_version` | да; **без step-up** (CRM-SEC-FRESH-01) |

Неочевидное: `crmOrderAction('confirm')` передаёт `availability_confirmed` целиком на заказ (нет подтверждения по строке, M-12); черновик посылки выставляет «наличие подтверждено» правом `shipment.manage` (ARCH-08).

## 4. Роли и аутентификация сотрудников

- Роли в SITE: OWNER, MANAGER, LOGISTICS, READ_ONLY (`shop/financial-permissions.php:5-14`, `staff/auth.php:4-8`). Целевые (ТЗ §8): OWNER, MANAGER, WAREHOUSE, SUPPORT, ACCOUNTANT → миграция: LOGISTICS→WAREHOUSE, READ_ONLY→SUPPORT, новая ACCOUNTANT; legacy-значения `cfg('staff_roles')` принимаются как алиасы.
- Пароль bcrypt cost 12, ≥ 12 символов только при создании сотрудником (`staff/reports.php:35`); слабые пароли не проверяются; TOTP нет; резервных кодов нет.
- Сессия: регенерация ID при входе (`staff/auth.php:27`), бездействие 30 мин, абсолютно 8 ч (ТЗ: 12 ч), «выйти везде» = `session_version+1` только через редактирование сотрудника; список сессий нет.
- Step-up: только деньги (`shop/financial-permissions.php:38-43`, 900 с); ТЗ требует также ручную доставку, разбор ТТН, сотрудников, реквизиты/поставщиков/отправителей, полный экспорт.
- Лимиты: неудачные входы — IP+email, без вечной блокировки (R8 соблюдён); общий лимит API 240/мин на `session_id|IP` (`api/staff/index.php:8`) — ключ уже сессионный, офис за одним IP не делит лимит между сотрудниками.
- Сессия покупателя не даёт доступа: разные cookie и `crmActor` читает только `staff_id` (тест `crm-security`).

## 5. Фактические машины состояний (SITE)

- **Заказ (legacy `status`)**: `new` → `confirmed` (npConfirm) → `processing` → `partially_shipped`/`shipped` → `delivered` (npAggregateOrder) → `completed`; `cancelled` (shopCancelOrder, только до оплаты и без живых посылок); `returned`/`partially_returned` (по посылкам). v3: `pim_order_state` NEW/WAITING_CONFIRMATION/CONFIRMED/CANCELLED/COMPLETED (`shop/pim-v3-schema.php:5`); COMPLETED ставится автоматически при DELIVERED+paid (`shop/np-fulfillment.php:293`). Ручного «Завершити» нет. «У комплектації» как отдельного состояния нет.
- **Оплата**: `pending` → `paid` (только подписанный webhook или подтверждённое банком чтение после 15 мин, `shop/mono-lib.php:126,183`) → `refunded`; `failed`; `cod` — только исторические. v3: UNPAID/PAYMENT_PENDING/PAID/PARTIALLY_REFUNDED/REFUNDED. Счёт `rubizh_mono_invoices.status`: creating/unknown/created/processing/hold/awaiting_webhook/success/failure/expired/reversed. Срок оплаты `rubizh_order_timing.payment_due` (2 рабочих дня), автоотмена в срок (`shop/order-lifecycle.php:55-59`; для `invoice` — D-51).
- **Доставка (посылка)**: draft → creating → created → sent → delivered; error; unknown (R6); manual; returned; cancelled (`npTrackingTransition` — только вперёд, `shop/np-fulfillment.php:253-262`). Проекция v3: NOT_READY/READY_TO_SHIP/TTN_CREATED/IN_TRANSIT/DELIVERED.
- **Предзаказ v3**: строки `requires_order_confirmation`/`SIZE_OPTION` → WAITING_CONFIRMATION → `pimV3ConfirmRequests` (повторная проверка SKU/цены/наличия, `PRICE_CHANGED` → одобрение OWNER с причиной).
- **Резерв**: ACTIVE → COMMITTED (оплата) → RELEASED/EXPIRED (`shop/reservations.php:7-21`).
- **Возврат товара**: REQUESTED → APPROVED/REJECTED → IN_TRANSIT → RECEIVED → REFUND_PENDING → CLOSED (`staff/operations.php:29`); денежный возврат — отдельная операция ledger; закрытие с деньгами требует распределения по успешным операциям.

## 6. Что CRM хранит у себя / должна читать

| Данные | Сейчас | Решение |
|---|---|---|
| Сохранённые подання | `localStorage` браузера | своё CRM (A1) → таблица `rubizh_crm_saved_views` |
| Тема | `localStorage` | допустимо (настройка UI), дублируется в профиле |
| Задачи, уведомления | нет | своё CRM → таблицы |
| Комментарии | `rubizh_internal_notes` | своё CRM — ок |
| Профили отправителя | `rubizh_sender_profiles` + конфиг `np_staff_origin` (два источника, LOG-04) | единый источник — профили (LOG-04) |
| Товары/цены/остатки | не хранит | чтение зеркала PIM в SITE (`variants`, `products`) |
| Себестоимость | нет | **в SITE отсутствует**: PIM считает `payout`, но не передаёт; SITE вырезает `cost/supplier_payout` (`api/lib.php:211`). PIM менять запрещено → OWNER DECISION OD-4.1 |
| Клиенты | чтение `rubizh_accounts` ∪ гостевые контакты | ок |

Итог: каркас (сессия, CSRF, версия заказа, ledger возвратов, audit append-only, мост) годен и сохраняется. Нужны: новая ролевая модель и вход (TOTP, step-up, сессии, приглашения), ~25 новых серверных действий через SITE, свои таблицы CRM (задачи, уведомления, подання, приглашения, TOTP, сессии, просмотры), фронтенд по макету с мобильными карточками, контракт API, RBAC-матрица из таблицы маршрутов. План — `docs/release-hardening/04-ECC_IMPLEMENTATION_PLAN.md` раздел «Stage 4 — CRM».
