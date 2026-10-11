# 03 — DEFECT REGISTER

Обновлено 2026-10-11 (пауза сессии). Статусы: **FIXED** — исправлено + regression test зелёный локально; **OPEN** — не исправлено; **DECISION** — нужен ответ владельца; **NO-DEFECT** — проверено, дефекта нет; **PIM** — только предложение, PIM не трогаем.

Все исправления в ветке `hardening/site-release-20261011`. Тесты: `tests/release-hardening.test.mjs`, `tests/color-gallery.test.mjs`, `tests/ui-hardening.test.mjs`.

| ID | Sev | Где | Дефект | Статус | Тест |
|---|---|---|---|---|---|
| D-01 | P0 | `shop/catalog-lib.php`, `api/lib.php`, `shop-client.2026101101.js` | Смена цвета не меняла галерею (legacy фото без владения цветом) | **FIXED**: `color_photos` (строгое подмножество галереи, иначе placeholder), сброс прокрутки, дефолтный цвет с фото, цвет не «перетекает» между товарами, aria-pressed | color-gallery (PHP + desktop + mobile, красный на 59b4685) |
| D-02 | **P0** (повышен) | `shop/order.php`, клиент | COD принимался сервером; клиент по умолчанию отправлял `pay:"cod"`, если покупатель не выбрал способ оплаты | **FIXED**: только `card`/`invoice`; дефолт = карта (если MonoPay) или счёт; COD убран из UI, `customer.php`, NP payload, конфига; исторические COD-заказы сохранены, ТТН им запрещена | release-hardening (3 теста), storefront (переписан) |
| D-03 | P1 | `shop/mono-lib.php`, `mono-worker.php`, `payment-return.php` | `awaiting_webhook` навсегда при потерянном вебхуке | **FIXED**: через 15 мин аутентифицированный status read (reference/amount/ccy) → paid один раз; устаревший non-final не откатывает | release-hardening |
| D-04 | P1 | `shop/order-validation.php` | Пересчёт суммы при открытом счёте → оплата по старой сумме | **FIXED**: `INVOICE_OPEN` | release-hardening |
| D-05 | P1 | `pim-v3-product.2026101101.js` | v3: после смены цвета дорожка галереи на старом слайде | **FIXED** | pim-v3-browser (зелёный) |
| D-25 | **P1** (новый) | `shop/order-validation.php` | Legacy «під замовлення»: менеджер не мог подтвердить (`PAYMENT_NOT_ALLOWED`) → счёт невозможен | **FIXED** для legacy; v3 по-прежнему требует флаг PIM → **DECISION Q-4** | release-hardening |
| D-06 | P2 | `index.html`, `recently-viewed.2026101101.css` | Recently viewed: широкие низкие карточки, crop | **FIXED**: 4:5, contain, фиксированные треки, мобильная карусель | ui-hardening |
| D-07 | P2 | `shop-client` | Recently viewed: порядок, дубли, пустой заголовок, нет сохранения, просмотр по прямой ссылке не учитывался | **FIXED**: localStorage `rubizh.seen`, newest first, учёт в componentDidUpdate, удалённые товары вычищаются | ui-hardening |
| D-08 | P2 | `category-carousel.2026101101.css`, `shop-client` | Нет мобильной карусели категорий; resize-обработчик ставил 4/стр | **FIXED** (≤699px; desktop без изменений) | ui-hardening (360/390/430/desktop), category-directory (обновлён) |
| D-09 | P2 | `assets/category-directory.2026100802.js` | 19 активных категорий без баннера; на Drive нет неиспользованных файлов (все 49 сопоставлены 08.10) | **OPEN / нужны файлы** — список ниже; генерация не выполнялась | — |
| D-10 | P2 | `auth/account.php` | Кабинет показывал ТТН отменённой/возвращённой/некорректной отправки | **FIXED** | release-hardening + браузерный QA кабинета |
| D-11 | P2 | `shop/pricing-policy.php:79` | Kit-цена для произвольной `kit_group` (≥2 шт одного SKU), ограничено ценовым полом | OPEN | — |
| D-12 | — | `shop/mono-lib.php` | Поздняя оплата отменённого заказа | **NO-DEFECT**: флаг `STATE_CONFLICT` (существующий тест) | p0-integration |
| D-13 | P2 | `shop/mono-lib.php` | Повтор после `failure` без деактивации старого счёта | **FIXED**: `invoice/remove` перед новым счётом | release-hardening |
| D-14 | P2 | `shop/pim-v3-sync.php:167` | v3 sync игнорирует `publication_state` (латентно, v3 OFF) | OPEN | — |
| D-15 | P2 | `auth/phone.php`, `auth/index.php` | Глобальные лимиты SMS/email-ссылок → DoS входа | **DECISION** (CAPTCHA/резерв) | — |
| D-16 | P2 | `shop/np-fulfillment.php:22` | Менеджерские действия на клиентской сессии без step-up | **DECISION Q-5** | — |
| D-17 | P2 | `site-qa.2026101101.js/.css` | Переиспользованный `<img>` показывал старое фото до загрузки нового | **FIXED** | color-gallery |
| D-18 | P3 | `shop/order.php` | Дубль заказа из второй вкладки | OPEN | — |
| D-19 | — | `shop/mono-lib.php:73` | `reversed` до `success` | **NO-DEFECT** (порядок вебхуков не гарантирован, покрыто тестом) | p0-integration |
| D-20 | P3 | `shop/mono-webhook.php` | 503 на постоянную ошибку валидации → повторы банка | OPEN | — |
| D-21 | P3 | `shop-client` | v3-превью карточки — фото модели | OPEN | — |
| D-22 | P3 | `assets/` | ~40 мёртвых хешированных файлов | OPEN (удалять после проверки `downloads/`) | — |
| D-23 | P3 | баннеры | 96 баннеров 384×480 при цели 768×960 | OPEN | — |
| D-24 | P3 | `auth/bootstrap.php:11` | `Secure` cookie жёстко → нет сессий на не-TLS стейджинге | OPEN | — |
| D-26 | P3 | `shop-client`, `pim-v3-product` | Мобильная «Оберіть розмір» прокручивала к несуществующему селектору | **FIXED** | color-gallery (красный на старом селекторе) |
| D-27 | P3 | `robots.txt` | Allow для несуществующих путей (`/sizes`, `/delivery`, `/contacts`, `/about`, `/returns`, `/warranty`) | OPEN | — |
| D-28 | P3 | `storefront.php` | Нет JSON-LD `BreadcrumbList` | OPEN | — |
| R-1 | риск | MariaDB ≥ 11.6 | `innodb_snapshot_isolation=ON`: последняя единица → PDOException вместо `SKU_UNAVAILABLE` (локально на MariaDB 13). Проверить версию на хостинге перед обновлением СУБД | OPEN | p0-integration (REPEATABLE READ) |
| PIM-1 | — | `pim.rubizh/app/lib/simple-ui.inc.js:95` | Вариант без своих фото получает всю галерею — SITE трактует как «неизвестно» → placeholder | PIM | — |
| PIM-2 | — | `pim.rubizh/app/lib/final-workflow.inc.js:190` | Модель, потерявшая READY, не скрывается | PIM | — |

## D-09: категории без баннера (рабочая таксономия 20261008-v2)

`helmets_accessories`, `communications_radios`, `pouches_panels`, `load_bearing_systems`, `load_bearing_components`, `medical_hemostatics`, `medical_bandages`, `medical_kits`, `medical_shears`, `medical_occlusive`, `medical_other`, `electronics_monoculars`, `electronics_accessories`, `lighting_headlamps`, `power_accessories`, `weapon_accessories_bipods`, `eye_protection_masks`, `eye_protection_accessories`, `tools_accessories`.

Drive-папка (49 PNG: `1.png`…`42.png` + 7 UUID) полностью использована в `docs/category-banners*.json`; однозначных кандидатов для этих 19 нет. Нужны новые файлы или разрешение на генерацию.

## Открытые вопросы владельцу

- **Q-4** v3 «під замовлення»: разрешить подтверждению менеджера открывать оплату без флага PIM (как в legacy) или ждать `payment_allowed` от PIM?
- **Q-5** step-up для менеджерских денежных действий / перенос в CRM.
- **Q-6** D-15: CAPTCHA или резерв лимита SMS для существующих аккаунтов.
- **Q-7** Legacy-товары «в наличии» сейчас тоже идут через подтверждение менеджера (статус `new`). Правило «в наличии → сразу MonoPay» выполняется только в v3. Менять legacy? Риск: в legacy остатки часто неподтверждены.
