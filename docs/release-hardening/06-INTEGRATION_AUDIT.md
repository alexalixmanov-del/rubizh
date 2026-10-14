# 06 — INTEGRATION AUDIT

PIM, MonoPay, Nova Poshta, CRM boundaries, order domain. Ветка `hardening/site-release-20261011`. PIM прочитан на `2119846`, не изменялся.

## PIM → SITE

| Тема | Legacy (production, v3 OFF) | PIM v3 (выключен) | Статус |
|---|---|---|---|
| MODEL → COLOR → SIZE → SKU | товар = модель; цвет — текст `variants.color`; SKU реальные | `colors[].id`, `variant_skus`, size options без SKU = запрос | совместимо |
| Фото цвета | PIM шлёт `variants[].photos`; SITE теперь строит `color_photos` (строгое подмножество галереи), иначе placeholder | `rubizh_color_photos`, без заимствования | **исправлено** (D-01) |
| Fallback PIM «вся галерея» | трактуется как «владение неизвестно» → placeholder | — | PIM-1 (предложение) |
| Под заказ | `availability='order'` → подтверждение менеджером → счёт | `payment_allowed=false` до флага PIM | legacy **исправлено** (D-25); v3 — вопрос владельцу |
| Stock=0 ≠ preorder | `availability` из PIM, не из нуля остатка | `pim_effective_availability` | без изменений |
| Публикация/архив | `visible`, архив не удаляет | `publication_state` игнорируется sync | D-14 (латентно) |
| Модель, потерявшая READY | — | не скрывается | PIM-2 (предложение) |

## MonoPay

Источник: документация monobank acquiring (`api.monobank.ua/docs/acquiring.html`): вебхуки не гарантируют порядок, `expired` не присылается вебхуком, `invoice/remove` деактивирует счёт без оплаты.

| Сценарий | Было | Стало | Тест |
|---|---|---|---|
| Возврат браузера с `success` | `awaiting_webhook`, не `paid` | без изменений (правильно) | release-hardening |
| Вебхук потерян | `awaiting_webhook` навсегда, резерв висит | через 15 мин аутентифицированный `invoice/status` (reference+amount+ccy) → `paid` один раз, аудит `mono_status_confirmed` | release-hardening |
| Устаревшее чтение `processing` после `success` | откатывало счёт | игнорируется | release-hardening |
| Повтор после `failure` | новый счёт, старый не деактивирован | `invoice/remove` старого; отказ банка → новый счёт не создаётся | release-hardening |
| Пересчёт суммы при открытом счёте | разрешён → оплата по старой сумме | `INVOICE_OPEN` | release-hardening |
| Повторные/переупорядоченные вебхуки | `event_hash`, `modifiedDate` | без изменений | p0-integration |
| Поздняя оплата отменённого заказа | `paid` + флаг `STATE_CONFLICT` | без изменений | p0-integration |
| Live платежи | — | **не проверялись** (только mock) | — |

## Nova Poshta / ТТН

- Склады отправки — `npOrigins()` (`shop/np-lib.php`); реальные `np_origin_refs` — приватный конфиг хоста, **не проверены**.
- Наложенный платёж удалён из payload (`AfterpaymentOnGoodsCost`); исторический COD-заказ не получает ТТН.
- Кабинет показывает только 14-значную ТТН живой отправки (D-10), как письма и уведомления поставщикам.
- Создание ТТН защищено от дублей (`RB-<key>`, UNIQUE, `unknown` блокирует повтор) — без изменений.
- Live API НП **не вызывался**.

## CRM boundary

CRM-код не менялся. Изменения в общем домене заказов (`shopAcceptOrderQuote`, `monoCreate`, `order-validation`) проверены CRM-тестами: `crm-domain`, `crm-security`, `crm-confirmation`, `crm-shipping`, `crm-browser` (CRM frontend собран локально из закреплённого `b0e2f93`) — зелёные. `crm-migration` локально не воспроизводится (так же падает на исходном `59b4685`; в CI зелёный).

## Статусы заказа (после исправлений)

- Order: `new → confirmed → processing → partially_shipped|shipped → delivered → completed`; `cancelled`, `returned`.
- Payment: `pending → paid → refunded`; `failed → pending` (повтор с деактивацией старого счёта). `cod` — только исторические заказы.
- Invoice: `creating → created|unknown → processing|hold → success|failure|expired|reversed`; `awaiting_webhook → success` (подписанный вебхук или подтверждение после grace).
- Shipment: `draft → creating → created|unknown|error → sent → delivered`; `cancelled`, `returned`.
