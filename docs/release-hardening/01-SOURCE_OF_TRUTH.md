# 01 — SOURCE OF TRUTH

Состояние на 2026-10-11, фаза A (Discovery). Документ описывает то, что подтверждено чтением кода; всё остальное помечено как «не проверено».

## Репозитории

| | SITE | PIM (READ-ONLY) |
|---|---|---|
| GitHub | alexalixmanov-del/rubizh | alexalixmanov-del/pim.rubizh |
| Локально | /Users/l/Projects/rubizh | /Users/l/Projects/pim.rubizh |
| Исходная ветка | claude/amazing-meitner-e6572n | claude/amazing-meitner-e6572n |
| Проверенный HEAD | 59b46857ea7c58c95212c94a0674d3ed1f934d7a | 21198461f8ebb2eadef6dcd6fb77a50a8a038ea9 |
| CI на этом HEAD | success (GitHub Actions, 2026-10-10 22:36Z) | success (2026-10-10 22:30Z) |
| Рабочая ветка | hardening/site-release-20261011 (локальная, от 59b4685) | — |

## Фактическая архитектура SITE

- **Не Laravel, не фреймворк.** Plain PHP 8.2+ (CI: 8.3), PDO MySQL/MariaDB, Apache + `.htaccess`.
- **Маршрутизация:** `.htaccess` → `storefront.php` для `/product|catalog|kit|categories|porady|offer|privacy`; JSON-эндпоинты — прямые PHP-файлы в `shop/`, `auth/`, `api/`, `api/staff/`.
- **Storefront:** `storefront.php` рендерит SEO-оболочку (title/canonical/JSON-LD/noscript) и `window.RUBIZH_BOOT`, затем отдаёт `index.html` (283 КБ, шаблоны `<x-dc>`), которые рендерит `assets/store-runtime.*.js` поверх React (`assets/react*.js`).
- **Логика витрины:** `assets/shop-client.2026101002.js` (~7100 строк, не минифицирован, правится вручную, версия = имя файла + `?v=` в `index.html`). Сборщика нет.
- **PIM v3 на витрине:** `assets/pim-v3-product.2026101002.js` + `shop/pim-v3-*.php`. Включается только при `cfg('pim_v3_sync')===true` и meta-схеме `2`. **В production выключен.**
- **Тесты:** `node --test tests/*.test.mjs` (Playwright 1.62.1 + изолированный PHP + MariaDB через сокет). CI: `.github/workflows/ci.yml` (+ PHP lint всех `*.php`, + сборка CRM по закреплённому SHA).

## Доменные границы (frozen)

- PIM — каталог и поставщики. SITE — витрина, корзина, оформление, кабинет, домен заказов. CRM — staff-слой поверх заказов SITE, без собственной БД заказов; в production не развёрнута и в этой работе не меняется.
- PIM→SITE sync OFF, AUTOPRICES OFF, PIM v3 не включается, каталоги не сбрасываются, production deploy только по явному подтверждению владельца.

## Модель товара

Целевая модель: `MODEL → COLOR → SIZE → REAL SKU`.

| | Legacy (сейчас в production) | PIM v3 (выключен) |
|---|---|---|
| Распознавание | `products.pim_contract_version<>3` | `pim_contract_version=3` (`shop/pim-v3-read.php:9`) |
| Цвет | текст `variants.color` | `colors[].id` (`clr-<fnv>`), `variant_skus` |
| Фото | `photos(product_id,pos)` — **без цвета** (`api/lib.php:406`) | `rubizh_color_photos` по `color_id` (`shop/pim-v3-sync.php:181`) |
| Фото по цвету в данных | есть в `variants.data.photos` (JSON из PIM), **не используется** (`shop/catalog-lib.php:30-37`) | `colors[].photos` |
| Переключение цвета | `setState({productColor})`, галерея не меняется (`shop-client:7002`) | `storeV3ProductVm` пересчитывает галерею (`pim-v3-product:47-56`) |

PIM legacy-выгрузка: `variants[].photos = v.photos || offer.photos || model photos` (`pim.rubizh/app/lib/simple-ui.inc.js:95`). Последний fallback делает «все фото модели» неотличимыми от фото цвета.

## Деньги и заказы

- Цена и сумма считаются только на сервере (`shop/pricing-policy.php`, копейки). `expected_total` клиента лишь сравнивается (`shop/order.php:38-40`).
- Количество: штуки — целое 1..99, м² — 0.01..10000 (`shop/units.php:9-13`).
- MonoPay: счёт в копейках, `ccy 980`, подпись вебхука X-Sign (ECDSA/SHA-256), защита от повторов по `event_hash`, порядок по `modifiedDate`. Возврат браузера **не** ставит `paid` (`shop/mono-lib.php:62`).
- Статусы заказа: `new → confirmed → processing → partially_shipped/shipped → delivered → completed`; `cancelled`, `returned`. Оплата: `pending|cod → paid → refunded`, `failed`. Отправка: `draft → creating → created|unknown|error → sent → delivered`, `cancelled`.

## Nova Poshta / поставщики

Единственный источник складов отправки — `npOrigins()` в `shop/np-lib.php:8-14`: `m_vin` (НП №1), `ukr_tek` (Хмельницький №8), `armoline` (Чернівці №32), `tactical_belt` (Березань №2), `kiborg` (Вінниця №9, вантажне №36). Реальные ref складов — runtime config `np_origin_refs` (в репозитории его нет, не проверено). ТТН сохраняется только после проверки ответа НП (`^\d{14}$`, `shop/np-fulfillment.php:164,187`).

## Категории и баннеры

- Рабочая таксономия: `shop/canonical-taxonomy.json` версии `20261008-v2`, 136 активных категорий.
- Баннеры: жёстко заданная карта `banners` в `assets/category-directory.2026100802.js` (117 ключей), а также `window.RUBIZH_CATEGORY_ART` и список `Dt` для главной. Колонки в БД нет.
- Журналы сопоставления: `docs/category-banners.json`, `docs/category-banners-numbered-20261008.json`.

## Не проверено в фазе A

Production-хост, бэкапы на хосте, реальные настройки `api/config.php` и `auth/config.php`, sandbox MonoPay, живой API Nova Poshta, браузерное поведение (локальный стенд ещё не поднят, см. 04).
