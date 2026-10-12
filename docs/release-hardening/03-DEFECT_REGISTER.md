# 03 — DEFECT REGISTER

Обновлено 2026-10-11 (сессия 2: P2/P3, QA, ADDENDUM №2, независимое ревью). Статусы: **FIXED** — исправлено + regression test зелёный локально; **OPEN** — не исправлено; **DECISION** — нужен ответ владельца; **NO-DEFECT** — проверено, дефекта нет; **PIM** — только предложение, PIM не трогаем.

Все исправления в ветке `hardening/site-release-20261011`. Тесты: `tests/release-hardening.test.mjs`, `tests/color-gallery.test.mjs`, `tests/ui-hardening.test.mjs`, `tests/seo-hardening.test.mjs`, добавления в `tests/pim-v3-sync.test.mjs`, `tests/pim-v3-browser.test.mjs`.

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
| D-09 | P2 | `assets/category-directory.2026100802.js` | 19 активных категорий без баннера; на Drive (перепроверено 11.10) те же 49 файлов, все сопоставлены | **OPEN / нужны файлы** — перечень и промпты: `11-BANNER_PROMPTS.md`; генерация не выполнялась | — |
| D-10 | P2 | `auth/account.php` | Кабинет показывал ТТН отменённой/возвращённой/некорректной отправки | **FIXED** | release-hardening + браузерный QA кабинета |
| D-11 | P2 | `shop/pricing-policy.php:79` | Kit-цена для произвольной `kit_group` (≥2 шт одного SKU), ограничено ценовым полом PIM | **FIXED stage-2**: K1–K6 утверждены владельцем 2026-10-11; `ee207fa` + исправления объяснения лишних единиц и канонического v3 слота | kit-rules, q8-kit-ui (unit/browser/HTTP/CRM), 10 § Stage 2 |
| D-12 | — | `shop/mono-lib.php` | Поздняя оплата отменённого заказа | **NO-DEFECT**: флаг `STATE_CONFLICT` (существующий тест) | p0-integration |
| D-13 | P2 | `shop/mono-lib.php` | Повтор после `failure` без деактивации старого счёта | **FIXED**: `invoice/remove` перед новым счётом | release-hardening |
| D-14 | P2 | `shop/pim-v3-sync.php` | v3 sync игнорировал `publication_state` (латентно, v3 OFF) | **FIXED**: `HIDDEN`/`ARCHIVED` → `visible=0` с состоянием и причиной `PIM_PUBLICATION_STATE`; `ACTIVE` возвращает | pim-v3-sync (красный на старом коде) |
| D-15 | P2 | `auth/phone.php`, `auth/index.php` | Глобальные лимиты SMS/email-ссылок → DoS входа | **DECISION** (CAPTCHA/резерв) | — |
| D-16 | P2 | `shop/np-fulfillment.php:22` | Менеджерские действия на клиентской сессии без step-up | **DECISION Q-5** | — |
| D-17 | P2 | `site-qa.2026101101.js/.css` | Переиспользованный `<img>` показывал старое фото до загрузки нового | **FIXED** | color-gallery |
| D-18 | P3 | `shop-client` | Дубль заказа из второй вкладки (ключ идемпотентности был случайным на вкладку) | **FIXED**: общий ключ в `localStorage` `rubizh.orderKey` (хеш оформления без PII, TTL 15 мин); сервер отвечает существующим заказом. Ограничение: тот же состав+контакт в течение 15 мин после успеха покажет прежний заказ | release-hardening (2 вкладки, красный: 2 заказа) |
| D-19 | — | `shop/mono-lib.php:73` | `reversed` до `success` | **NO-DEFECT** (порядок вебхуков не гарантирован, покрыто тестом) | p0-integration |
| D-20 | P3 | `shop/mono-webhook.php`, `mono-lib.php` | 503 на постоянную ошибку валидации → повторы банка | **FIXED**: подписанный вебхук с несовпадением суммы/валюты/статуса → 200 + аудит `mono_event_rejected`, деньги не меняются; неизвестный счёт/ошибка БД — по-прежнему 503 | release-hardening |
| D-21 | P3 | `shop-client`, `pim-v3-product` | Карточка каталога показывала gallery[0], а не цвет, с которого открывается товар (v3 **и legacy**; перезапись в `storeImage`) | **FIXED**: `storeCardCover` — фото цвета по умолчанию (v3 `cardPhoto`, legacy `colorPhotos`), иначе прежнее | pim-v3-browser, color-gallery (красные на старом коде) |
| D-22 | P3 | `assets/` | 40 файлов без ссылок (7,6 МБ); 2 из них — текущие production (`shop-client.2026101002.js`, `pim-v3-product.2026101002.js`) — оставить для отката | **DECISION Q-9**: удаление 38 файлов из git заблокировано автоматическим классификатором (необратимое локальное удаление) — нужно разрешение владельца; deploy не удаляет файлы на сервере, production не затронут | — |
| D-23 | P3 | баннеры | 96 баннеров 384×480 при цели 768×960 | OPEN | — |
| D-24 | — | `auth/bootstrap.php:17` | `Secure` cookie жёстко → нет сессий на не-TLS стейджинге | **NO-DEFECT (by design)**: ослаблять cookie production ради http-стенда нельзя; стейджинг — только TLS. QA-копия ослабляет флаг локально (WebKit не хранит Secure по http) | — |
| D-26 | P3 | `shop-client`, `pim-v3-product` | Мобильная «Оберіть розмір» прокручивала к несуществующему селектору | **FIXED** | color-gallery (красный на старом селекторе) |
| D-27 | P3 | `robots.txt` | Allow для несуществующих путей; `/categories` был закрыт для AI-агентов | **FIXED** | seo-hardening |
| D-28 | P3 | `storefront.php` | Нет JSON-LD `BreadcrumbList` | **FIXED**: товар и категория (главная → каталог → предки → текущая) | seo-hardening |
| D-29 | P2 (a11y) | `index.html` | Лента фото товара прокручивается, но недоступна с клавиатуры (axe `scrollable-region-focusable`) | **FIXED**: `tabindex=0`, `role=region`, `aria-label="Фото товару"` | a11y-hardening |
| D-30 | P3 (a11y) | `index.html` | Карточка совета: безымянная `role=button` вокруг фото с вложенным интерактивом (axe `nested-interactive`) | **FIXED**: фото кликабельно мышью, клавиатура — через ссылку-заголовок | a11y-hardening |
| D-31 | P3 (a11y) | `index.html` | `aria-label` на `div` без роли в слотах комплекта (axe `aria-prohibited-attr`) | **FIXED**: `role=group` | a11y-hardening |
| D-32 | P3 (a11y) | `storefront.php` | Серверная 404: ссылка цвета браузера по умолчанию на тёмном фоне (контраст 2.07) | **FIXED**: `#F2A33C` | a11y-hardening |
| D-33 | P2 (a11y) | `index.html` | «Перейти до вмісту» без цели на странице товара и в «Порадах» (WCAG 2.4.1; Lighthouse `skip-link`) | **FIXED**: `#main-content` на всех видах | a11y-hardening |
| D-34 | P3 | `index.html` | (а) **FIXED** (ADDENDUM A-4, фокус в поле); (б),(в) — в рамках шапки. Исходно: «Шукати» с пустым запросом ничего не делает и не ставит фокус в поле; (б) `aria-label` не содержит видимый текст: «Кошик» vs «Кошик 0», логотип (WCAG 2.5.3); (в) цели < 24 px: хлебные крошки, «Налаштування cookie» (WCAG 2.5.8) | OPEN — шапка/поиск входят в будущее ТЗ главной; предлагаю решить там | — |
| D-35 | P3 | `auth/index.php:193` | Ошибка загрузки кабинета перехватывается без записи в лог (диагностика вслепую) | OPEN (наблюдаемость; без изменения поведения) | — |
| D-36 | P3 | `shop/customer-states.php` | Новый заказ до подтверждения менеджером показывал «Оплата: Очікує оплати», хотя оплата ещё недоступна | **FIXED**: «Оплата після підтвердження» | addendum-account |
| D-37 | P2 | `shop-client` (поиск) | Пробелы вокруг запроса из URL давали 0 результатов | **FIXED** (ADDENDUM C-4) | addendum-catalog |
| D-38 | P3 | `shop-client` (каталог) | При пустом поиске одновременно показывались два противоречивых пустых состояния | **FIXED** (ADDENDUM C-4) | addendum-catalog |
| D-39 | P3 | `shop-client` (повтор заказа) | Повтор заказа добавлял второй строкой SKU, уже лежащий в корзине | **FIXED** (ADDENDUM P-6) | addendum-account |
| RV-1 | P2 | `shop-client` `storeOrderKey` | Независимое ревью: после успешного заказа ключ жил 15 мин → осознанная повторная покупка возвращала старый заказ | **FIXED**: ключ освобождает только вкладка, оформившая заказ (или открытая позже); устаревшая вкладка по-прежнему получает тот же заказ | release-hardening |
| RV-2 | P3 | `shop/mono-lib.php` `monoWorkerRun` | Независимое ревью: зависшие `awaiting_webhook` могли вытеснять новые счета из очереди воркера | **FIXED**: отдельная очередь с собственным лимитом | release-hardening |
| RV-3 | P3 | `shop-client` `storeCardCover` | Независимое ревью: карточка legacy могла взять фото другого цвета, если у цвета по умолчанию нет своих | **FIXED**: фото не заимствуется | color-gallery |
| RV-4 | P2 | `shop/mono-lib.php` `monoInvalidateFailed` | Независимое ревью (открытый вопрос): отказ банка в `invoice/remove` навсегда блокировал повторную оплату | **FIXED** по статусу банка: `expired` → повтор; иначе блок + аудит `mono_invoice_remove_refused` для менеджера. **Требует проверки на sandbox monobank** (реальная реакция `remove` на `failure`) | release-hardening |
| D-40 | P3 | `shop/np-directory.php` | Ошибки ввода (длинный запрос, неверный тип доставки, неверный город) отдавались как 503 «Довідник тимчасово недоступний» и шли к провайдеру | **FIXED**: 400 с причиной до вызова НП; сбои НП — 503 | release-hardening |
| D-15 | P2 | `auth/phone.php` | Глобальный лимит SMS позволял чужим исчерпать вход для всех | **FIXED (Q-6)**: 30% дневного бюджета — для номеров существующих клиентов; лимиты на адрес, бюджет неверных кодов, проверка при подозрительной активности | sms-protection |
| RV-5 | P2 | `auth/phone.php` | Ревью Q-6: неверные коды с чужого адреса блокировали SMS-вход владельца номера на сутки | **FIXED**: бюджет неверных кодов считается по (номер, адрес) | sms-protection |
| RV-6 | P3 | `auth/phone.php` | Ревью Q-6: в диапазоне 60–70% проверка различала клиента и чужой номер | **FIXED**: проверка одинакова для всех; **принятый остаточный риск** — выше 70% резерв по замыслу D-15 различает номера клиентов (известно владельцу) | sms-protection |
| RV-7 | P3 | `shop/np-directory.php` | Ревью: неизвестный, но корректный `city_ref` отдавался как 503 | **FIXED**: `NpNotFound` → 400 | release-hardening |
| RV-8 | — | `auth/phone.php`, `login.js` | Ревью: proof-of-work — сдерживающий фактор, а не защита | принято: защищают жёсткие лимиты; проверка лишь удорожает автоматизацию | — |
| RV-9 | P3 | тесты | Ревью: часть тестов запускает PHP с полным окружением | принято с защитой: ключи провайдеров не в оболочке; `run-testing.sh` отказывается запускать наборы тестов; fixture убирает ключи | — |
| Q-7 | P1 | `shop/pim-v3-checkout.php` `pimV3OrderDecision`, client | Legacy-товар с подтверждённым остатком шёл через менеджера; решение владельца: подтверждённое наличие → сразу MonoPay | **DONE** (`d7554bf`; переход в MonoPay сразу после оформления — `cd58e3b`): карта + каждая строка `in` с числовым остатком → `confirmed`, резерв, клиент сразу вызывает `payment-start` и уходит на страницу оплаты; неизвестный остаток, ФОП, смешанный заказ → менеджер, ссылки на оплату нет | q7-payment-readiness, order-idempotency, mono-webhook-contract |
| Q-5 | P1 | `shop/financial-permissions.php`, `financial-actions.php` | Денежные действия менеджера без повторного входа и без проверки версии заказа | **DONE** (`c90192d`, `17f9c67`): RBAC на сервере; возврат/ручная сверка/переопределение цены — вход ≤ 15 мин; возврат и сверка обязаны передать версию заказа (409 `STATE_REQUIRED`/`STATE_CHANGED`); аудит кто/что/когда/до/после; CSRF | q5-manager-rbac, p0-integration |
| Q-4 | P1 | `shop/order-validation.php`, `shop/customer-ui.php` | v3 PREORDER/ORDER_ON_REQUEST нельзя было подтвердить (PAYMENT_NOT_ALLOWED даже после менеджера) | **DONE** (`f69bb0d`): подтверждение менеджера разблокирует строки `requires_order_confirmation`; счёт — только при `pim_order_state=CONFIRMED` и повторной проверке SKU/цены; устаревшая цена → отказ; покупатель видит «Очікує підтвердження менеджера» | q4-v3-preorder |
| D-41 | P2 | `shop/settings.php` | Страница настроек владельца на GET отвечала 500 (`rubizhSeller()` не подключён) — дефект до этапа 1, найден тестом Q-5 | **FIXED** (`17f9c67`): подключён `api/seller.php` | q5-manager-rbac |
| RV-10 | P2 | `shop/settings.php` | Ревью этапа 1 (M1): через 15 мин после входа страница настроек отвечала общим «Увійдіть із підтвердженим email менеджера» | **FIXED** (`cd58e3b`, решение владельца): страница меняет реквизиты ФОП (IBAN, банк, МФО, ЄДРПОУ банку), контакты поставщиков и долю пожертвування → повторный вход сохранён; на 403 показывается причина «підтвердьте вхід» | q5-manager-rbac |
| RV-11 | P2 | `shop/financial-actions.php` | Ревью этапа 1 (M2): проверка версии заказа была необязательной — устаревший возврат проходил | **FIXED**: обязательна для возврата и ручной сверки (роль проверяется первой) | q5-manager-rbac |
| RV-12 | P3 | `auth/phone.php` | Ревью этапа 1 (L1): при > 70% бюджета текст отказа различал новый номер и номер клиента | **FIXED**: один текст для всех (закрывает и остаток RV-6) | sms-protection |
| RV-13 | P3 | `auth/phone.php` | Ревью этапа 1 (L2): proof-of-work до 24 бит мог «заморозить» телефон | **FIXED**: максимум 20 бит | sms-protection |
| RV-14 | P3 | `shop/mono-lib.php` | Ревью этапа 1 (L3): подписанный webhook с неизвестным статусом только паркуется (200) | **FIXED** (`cd58e3b`, решение владельца): при парковке сайт сам читает статус счёта (`invoice/status`, в тестах mock) и пишет ответ банка или ошибку чтения в аудит `mono_parked_reconcile`; деньги не меняет. Показ менеджеру — задача CRM этапа 4 (04) | mono-webhook-contract |
| IDOR | — | заказы покупателя | Проверка A↔B: статус, повтор, оплата, страница оплаты/отмена, скрин пожертвования, кабинет | нарушений нет | idor-orders |
| RV-15 | P2 | `shop-client` идемпотентность заказа | Требование владельца: ключ на каждую попытку оформления, а не окно по содержимому корзины (было: общий ключ для одинакового оформления на 15 мин во всех вкладках) | **FIXED** (`cd58e3b`): случайный ключ на попытку (sessionStorage вкладки); двойной клик, сетевой повтор и повтор после перезагрузки вкладки → тот же заказ; после успеха попытка закрыта → осознанная повторная покупка = новый заказ; устаревшая вкладка с уже оформленной корзиной (id экземпляра корзины) отправляет ключ того заказа (D-18 сохранён) | order-idempotency, release-hardening |
| PERF-1 | P2 | витрина (mobile) | Mobile Lighthouse 49–58 (замер без сжатия). Главная причина низкой цифры — отсутствие сжатия у локального `php -S`; production отдаёт brotli (проверено одним запросом заголовков). На production-подобном сервере (brotli + кеш по .htaccess), медианы 3 прогонов: до — главная 73, каталог 72, товар 76, комплект 74; после объединения 14 CSS в один файл (`cd58e3b`) — 74 / 73 / 75 / 74 (в пределах разброса). 80 недостижимо без смены архитектуры: LCP 4.9–6.4 с — заголовок/изображения рисует ~200 КБ (brotli) JS на клиенте (React + `shop-client` 474 КБ без минификации) | **OPEN → аудит этапа 2**: серверный рендер первого экрана / разделение и минификация `shop-client`; адаптивные размеры баннеров категорий и `kit-photo` (по Q-9/баннерам — отдельное решение) | lh-prod (scratch) |
| RV-16 | P3 | `shop-client` `submitOrder` | Ревью `3327862` (LOW): дайджест оформленной корзины берётся из фактически отправленной корзины `t`; в тестовом сценарии `t` и состояние страницы совпадают, поэтому тест не падает без этой правки | **accepted** (владелец): исправление верно по построению, отдельный тест не требуется | — |
| RV-17 | P2 | `shop-client` тест устаревшей вкладки; `shop/mono-mock.php` | Ревью `e59a693`: тест устаревшей вкладки перезагружал вкладку и не проверял исправление; проверка «одно чтение из банка» проходила бы и при упавшем втором чтении | **FIXED** (`3327862`): правка корзины во второй вкладке без перезагрузки + неизменённая вкладка даёт тот же заказ (тест падает без исправления); mock считает реальные чтения статуса и умеет имитировать сбой банка — сбой оставляет ответ webhook 200 и пишется в аудит | order-idempotency, mono-webhook-contract |
| R-1 | риск | MariaDB ≥ 11.6 | `innodb_snapshot_isolation=ON`: последняя единица → PDOException вместо `SKU_UNAVAILABLE` (локально на MariaDB 13). Проверить версию на хостинге перед обновлением СУБД | OPEN | p0-integration (REPEATABLE READ) |
| PIM-1 | — | `pim.rubizh/app/lib/simple-ui.inc.js:95` | Вариант без своих фото получает всю галерею — SITE трактует как «неизвестно» → placeholder | PIM | — |
| PIM-2 | — | `pim.rubizh/app/lib/final-workflow.inc.js:190` | Модель, потерявшая READY, не скрывается | PIM | — |

## D-09: категории без баннера (рабочая таксономия 20261008-v2)

`helmets_accessories`, `communications_radios`, `pouches_panels`, `load_bearing_systems`, `load_bearing_components`, `medical_hemostatics`, `medical_bandages`, `medical_kits`, `medical_shears`, `medical_occlusive`, `medical_other`, `electronics_monoculars`, `electronics_accessories`, `lighting_headlamps`, `power_accessories`, `weapon_accessories_bipods`, `eye_protection_masks`, `eye_protection_accessories`, `tools_accessories`.

Drive-папка (49 PNG: `1.png`…`42.png` + 7 UUID) полностью использована в `docs/category-banners*.json`; однозначных кандидатов для этих 19 нет. Нужны новые файлы или разрешение на генерацию.

## Открытые вопросы владельцу

Q-4…Q-7 решены владельцем и реализованы на этапе 1 (см. строки Q-4, Q-5, Q-6/D-15, Q-7). Q-8 — утверждённые K1–K6 реализованы и проверены на этапе 2 (10-KIT_RULES_PROPOSAL.md). Q-9 — assets не удаляются.


## Глобальный этап 2 — единая консолидация (2026-10-12)

База SITE — `rubizh-stage-1-verified` → `51c83d808228a26328081b02211b4e3605353755`, PIM — `21198461f8ebb2eadef6dcd6fb77a50a8a038ea9`; main не используется. Полная Linux база: **351/351 PASS, 0 FAIL, 0 SKIP**. Первые 9 WIP raw сохранены как исходные свидетельства, ещё 4 направления независимо прочитали только pinned snapshots/01/00. Q8 и чужие выводы слепым аудиторам не передавались. Старые строки D/RV выше — история этапа1; Stage2-статусы определяет этот раздел.

CONFIRMED-RAW означает подтверждение в исходном raw, а не повторную сертификацию координатором. CANDIDATE/UNCONFIRMED не считаются доказанными дефектами или PASS. PARTIAL не закрывает исходную строку. OWNER DECISION/PIM OWNER DECISION остаются открытыми. Поздние исправления требуют финальных тестов/review на замороженном SHA. Приватные HIGH не публикуются повторно; public raw — безопасное уведомление, оригиналы сохранены в ignored private/. Нового параллельного реестра нет.

| ID | Severity | Stage2 status | Confidence / validation | Сводка | Evidence / commit |
|---|---|---|---|---|---|
| A11Y-01 | MEDIUM | FIXED | CANDIDATE | светлая тема: кольцо фокуса `--accent` #f0a144 на #f3f2eb ≈ 1,9:1 (нужно ≥ 3:1) — `assets/head-bundle.2026101201.css:241,218,230`, `index.html:30 | `475a7bb` |
| A11Y-02 | MEDIUM | PARTIAL / OPEN | CONFIRMED-RAW | размеры, доставка, оплата, фильтры комплекта (`div role=button`) передают выбор только цветом, без `aria-pressed`/`aria-checked`/`radiogroup` — ` | [raw/accessibility.md](stage-2/raw/accessibility.md) |
| A11Y-03 | MEDIUM | OPEN | CONFIRMED-RAW | иконочные кнопки без доступного имени: ✕ (`index.html:452,723,1166,1344,1408,1986,2023`), ‹ › (`:792-793`), − + (`:867-869,1012-1014`), удалить ( | [raw/accessibility.md](stage-2/raw/accessibility.md) |
| A11Y-04 | MEDIUM | UNCONFIRMED | CANDIDATE | граница полей ввода ≈ 1,5:1 (тёмная), ≈ 1,3:1 (светлая) — `head-bundle.2026101201.css:217-219,229`, `index.html:1028-1036,1053,1066,1139`, `auth/ | [raw/accessibility.md](stage-2/raw/accessibility.md) |
| A11Y-05 | LOW | UNCONFIRMED | CANDIDATE | текст распроданного размера: тёмная ≈ 3,1:1, светлая ≈ 1,3:1 (`shop-client.2026101101.js:4869-4872`, `head-bundle…css:187`). Исправление: `--mute | [raw/accessibility.md](stage-2/raw/accessibility.md) |
| A11Y-06 | MEDIUM | PARTIAL / OPEN | CONFIRMED-RAW | ошибка «Оберіть розмір» без `role=alert`/`aria-live` (`index.html:848-851`, `shop-client…js:7084-7087`). Исправление: `role="alert"` или перенос  | [raw/accessibility.md](stage-2/raw/accessibility.md) |
| A11Y-07 | LOW | OPEN | CONFIRMED-RAW | поля оформления: placeholder вместо видимой подписи; у city/address/comment/building/flat/promo/track/notifyEmail/invoiceEmail нет `aria-label`/` | [raw/accessibility.md](stage-2/raw/accessibility.md) |
| A11Y-08 | LOW | UNCONFIRMED | CANDIDATE | поиск без семантики combobox; `role=option` не активируется Enter (`index.html:99,135`, `shop-client…js:3423-3435,1604-1610`); подсказки НП — кно | [raw/accessibility.md](stage-2/raw/accessibility.md) |
| A11Y-09 | LOW | FIXED | CANDIDATE | мобильная панель фильтров без `role=dialog aria-modal` (`index.html:448`); фон не `inert`; Esc закрывает все слои сразу. | `475a7bb` |
| A11Y-10 | LOW | FIXED | CANDIDATE | возврат фокуса теряется при перерисовке открывшего элемента (`shop-client…js:1138-1142`). | `475a7bb` |
| A11Y-11 | LOW | UNCONFIRMED | CANDIDATE | мелкий текст 8–11 px (`head-bundle…css:246,251`, `auth/login-refresh.css:44,49,50`); ссылки-кнопки без min-height. | [raw/accessibility.md](stage-2/raw/accessibility.md) |
| A11Y-12 | LOW | UNCONFIRMED | CANDIDATE | нет живой области для итога/количества корзины (`index.html:1003-1015`). | [raw/accessibility.md](stage-2/raw/accessibility.md) |
| ARCH-01 | HIGH | FIXED | CANDIDATE | детали в закрытом хранилище | `336ddd2` |
| ARCH-02 | HIGH | OWNER DECISION | private | Детали приватны до исправления | [raw/architecture.md](stage-2/raw/architecture.md) |
| ARCH-03 | MEDIUM | OWNER DECISION | CANDIDATE | выключение `pim_v3_sync` — не откат | [raw/architecture.md](stage-2/raw/architecture.md) |
| ARCH-04 | HIGH | FIXED | CANDIDATE | детали в закрытом хранилище | `d5384a8` |
| ARCH-05 | MEDIUM | OWNER DECISION | CANDIDATE | две реализации возврата с разными условиями | [raw/architecture.md](stage-2/raw/architecture.md) |
| ARCH-06 | MEDIUM | OWNER DECISION | CANDIDATE | проекция состояния заказа считается в нескольких местах и расходится | [raw/architecture.md](stage-2/raw/architecture.md) |
| ARCH-07 | MEDIUM | OWNER DECISION | CANDIDATE | legacy и v3 по-разному решают для заказов «счёт ФОП» | [raw/architecture.md](stage-2/raw/architecture.md) |
| ARCH-08 | LOW | UNCONFIRMED | CANDIDATE | черновик CRM ставит «наличие подтверждено» правом `shipment.manage` (`staff/operations.php:45-47`). | [raw/architecture.md](stage-2/raw/architecture.md) |
| ARCH-09 | LOW | UNCONFIRMED | CANDIDATE | ручная блокировка категории на SITE молча перекрывает категорию PIM (`shop/pim-v3-sync.php:221-228`). | [raw/architecture.md](stage-2/raw/architecture.md) |
| ARCH-10 | LOW | UNCONFIRMED | CANDIDATE | включение mock MonoPay частично зависит от Host (`shop/mono-lib.php:3`). | [raw/architecture.md](stage-2/raw/architecture.md) |
| ARCH-11 | LOW | UNCONFIRMED | CANDIDATE | клиент дублирует расчёт цен; мёртвый промокод «РУБІЖ10» (`assets/shop-client.2026101101.js:4074,5560-5563`); 19 старых бандлов в `assets/`. | [raw/architecture.md](stage-2/raw/architecture.md) |
| ARCH-12 | LOW | UNCONFIRMED | CANDIDATE | отмена из CRM записывается как отмена покупателем (`staff/operations.php:16` → `shopCancelOrder`). | [raw/architecture.md](stage-2/raw/architecture.md) |
| ARCH-P1 | LOW | PIM OWNER DECISION | CANDIDATE | `PRODUCTION_SYNC_ENABLED`/`PRODUCTION_AUTOPRICES_ENABLED` (`app/lib/production-ui.inc.js:3`) не блокируют публикацию; `app/server-contract.md:3`  | [raw/architecture.md](stage-2/raw/architecture.md) |
| DB-01 | HIGH | UNCONFIRMED end-to-end | private | Детали приватны до исправления | [raw/database.md](stage-2/raw/database.md) |
| DB-02 | HIGH | OWNER DECISION | private | Детали приватны до исправления | [raw/database.md](stage-2/raw/database.md) |
| DB-03 | HIGH | OWNER DECISION | private | Детали приватны до исправления | [raw/database.md](stage-2/raw/database.md) |
| DB-04 | MEDIUM | UNCONFIRMED | CANDIDATE | ленивая DDL создаёт `rubizh_stock_reservations` без `status/committed_at/released_at` | [raw/database.md](stage-2/raw/database.md) |
| DB-05 | MEDIUM | UNCONFIRMED | CANDIDATE | запросы тика жизненного цикла и воркера оплат без индексов | [raw/database.md](stage-2/raw/database.md) |
| DB-06 | MEDIUM | UNCONFIRMED | CANDIDATE | `SELECT p.*` для карточек каталога тянет MEDIUMTEXT | [raw/database.md](stage-2/raw/database.md) |
| DB-07 | LOW | UNCONFIRMED | CANDIDATE | `modified_at` банка хранится как VARCHAR(40) | [raw/database.md](stage-2/raw/database.md) |
| FE-01 | MEDIUM | FIXED | red/green | Украинское сообщение при native fetch TypeError | `f791657` |
| FE-02 | MEDIUM | OPEN | CONFIRMED | Клиент допускает количество выше серверного предела | private synthetic browser evidence |
| FE-03 | MEDIUM | OPEN | CONFIRMED | Потеря commerce bundle оставляет техническое сообщение и неактивную витрину | private synthetic browser evidence |
| FPAY-01 | HIGH | FIXED | red/green | Предоставленные bank refund amount/extRef должны совпадать с запросом | `7e8b3c0` |
| FPAY-02 | HIGH | FIXED | red/green + independent review | Неполные cancelList facts не устанавливают полный возврат | `d041484` |
| FPAY-03 | MEDIUM | UNCONFIRMED / provider decision | code CONFIRMED, provider unverified | cancelList на invoice success: требуется подтверждение provider contract | final payment review private |
| LOG-01 | HIGH | FIXED | CANDIDATE | детали в закрытом хранилище | `b690451` |
| LOG-02 | HIGH | OWNER DECISION | private | Детали приватны до исправления | [raw/logistics.md](stage-2/raw/logistics.md) |
| LOG-03 | MEDIUM | OPEN | CONFIRMED-RAW | состояния отправки не монотонны; удалённая в НП ТТН оставляет заказ «отправлен» | [raw/logistics.md](stage-2/raw/logistics.md) |
| LOG-04 | MEDIUM | OWNER DECISION | CANDIDATE | два источника точек отправки и отправителя | [raw/logistics.md](stage-2/raw/logistics.md) |
| LOG-05 | MEDIUM | OWNER DECISION | CANDIDATE | строки без поставщика в оплаченном заказе нельзя исправить | [raw/logistics.md](stage-2/raw/logistics.md) |
| LOG-06 | MEDIUM | OWNER DECISION | CANDIDATE | CRM не может исправить/проверить адрес доставки | [raw/logistics.md](stage-2/raw/logistics.md) |
| LOG-07 | LOW | UNCONFIRMED | CANDIDATE | legacy-черновик без оплаты; черновик у отменённого по истечению заказа; «повтор заблоковано» при сбое чтения до `creating` (`np-manager.php:28-31 | [raw/logistics.md](stage-2/raw/logistics.md) |
| LOG-08 | LOW | UNCONFIRMED | CANDIDATE | агрегация отправки игнорирует последующий возврат денег (`np-fulfillment.php:206-214`) — флаг `SHIPMENT_REVIEW_REQUIRED`. | [raw/logistics.md](stage-2/raw/logistics.md) |
| PAY-01 | HIGH | FIXED | CANDIDATE | детали в закрытом хранилище | `4439b1d` |
| PAY-02 | HIGH | OWNER DECISION | private | Детали приватны до исправления | [raw/payments.md](stage-2/raw/payments.md) |
| PAY-03 | MEDIUM | OPEN | CONFIRMED-RAW | MEDIUM, CONFIRMED (существующим тестом) | [raw/payments.md](stage-2/raw/payments.md) |
| PAY-04 | MEDIUM | UNCONFIRMED | CANDIDATE | MEDIUM, LIKELY | [raw/payments.md](stage-2/raw/payments.md) |
| PAY-05 | MEDIUM | UNCONFIRMED | CANDIDATE | MEDIUM, LIKELY | [raw/payments.md](stage-2/raw/payments.md) |
| PAY-06 | LOW | OPEN | CONFIRMED-RAW | LOW, CONFIRMED (статически) | [raw/payments.md](stage-2/raw/payments.md) |
| PERF-01 | MEDIUM | OWNER DECISION | CANDIDATE | First visible storefront depends on runtime compilation (MEDIUM, high confidence) | [raw/performance.md](stage-2/raw/performance.md) |
| PERF-02 | MEDIUM | OWNER DECISION | CANDIDATE | Cold catalogs still perform broad JSON/REGEXP/facet work before HTML (MEDIUM, high confidence on code/local evidence; production magnitude unveri | [raw/performance.md](stage-2/raw/performance.md) |
| PERF-03 | MEDIUM | OWNER DECISION | CANDIDATE | Blocking CSS includes duplicate template styles and below-screen rules (MEDIUM, high confidence) | [raw/performance.md](stage-2/raw/performance.md) |
| PHP-01 | MEDIUM | CRM OWNER DECISION | CONFIRMED-RAW | CRM API отдаёт внутренние сообщения PHP и пути сервера, с неверным статусом | [raw/php-backend.md](stage-2/raw/php-backend.md) |
| PHP-02 | LOW | UNCONFIRMED | CANDIDATE | sitemap отдаёт обрезанный XML при ошибке посреди потока | [raw/php-backend.md](stage-2/raw/php-backend.md) |
| PHP-03 | LOW | OPEN | CONFIRMED-RAW | sitemap пишет в лог `$e->getMessage()` (PDO-сообщение может содержать SQL) | [raw/php-backend.md](stage-2/raw/php-backend.md) |
| PIMC-01 | MEDIUM | OWNER DECISION | CONFIRMED-RAW | устаревший остаток в v3 никогда не перестаёт быть оплачиваемым; IN_STOCK по статусу без количества — без лимита и резерва. `shop/pim-v3-checkout. | [raw/pim-contracts.md](stage-2/raw/pim-contracts.md) |
| PIMC-02 | MEDIUM | OPEN | CONFIRMED-RAW | явно истёкшее наблюдение поставщика показывается «В наявності» везде, кроме оформления: `shop/units.php:46` (`shopBuyableSql` v3 без `pim_expires | [raw/pim-contracts.md](stage-2/raw/pim-contracts.md) |
| PIMC-03 | MEDIUM | OPEN | CONFIRMED-RAW | повтор заказа и общие комплекты превращают запрос размера в неверный размер: `shop/repeat-order.php:4`; клиент `storeRepeatOrder`/`storeOpenKit`  | [raw/pim-contracts.md](stage-2/raw/pim-contracts.md) |
| PIMC-04 | MEDIUM | OPEN | CONFIRMED-RAW | пол цены выше цены принимается молча: `shop/pricing-policy.php:25-26` (пол отбрасывается, розница принимается; kit/опт при нарушении отклоняются) | [raw/pim-contracts.md](stage-2/raw/pim-contracts.md) |
| PIMC-05 | MEDIUM | OPEN | CONFIRMED-RAW | legacy «неизвестный остаток» показывается и принимается как наличие: `shop/units.php:42,57`, `catalog-lib.php:55-56` (`in`, `stock:null` → «В ная | [raw/pim-contracts.md](stage-2/raw/pim-contracts.md) |
| PIMC-06 | MEDIUM | UNCONFIRMED | CANDIDATE | фото не выбранного цвета в корзине, кабинете и фидах: строка корзины `photo: s?.photoData?.[0]?.thumb//s?.photos?.[0]`; `shop/customer-ui.php:49- | [raw/pim-contracts.md](stage-2/raw/pim-contracts.md) |
| PIMC-07 | LOW | OPEN | CONFIRMED-RAW | `expires_at` 1000.0 проходит схему, но сохраняется как «не истекает»: `pim-v3-contract.php:29` vs `pim-v3-sync.php:195` (`is_int`). | [raw/pim-contracts.md](stage-2/raw/pim-contracts.md) |
| PIMC-08 | LOW | OPEN | CONFIRMED-RAW | типы приводятся вместо отказа: цена строкой, `wire.schema.json` нигде не применяется; `size_display:""` → `variants.size=''` (`pim-v3-sync.php:19 | [raw/pim-contracts.md](stage-2/raw/pim-contracts.md) |
| PIMC-09 | LOW | UNCONFIRMED | CANDIDATE | legacy-оформление не требует пригодного фото (`store-lib.php:90`). | [raw/pim-contracts.md](stage-2/raw/pim-contracts.md) |
| PIMC-10 | LOW | OWNER DECISION | CANDIDATE | фиды фактически пусты (PIM legacy `ads_allowed:false`; v3 без `ads_allowed`); логика фида только legacy. Вопрос владельцу: фиды выключены намерен | [raw/pim-contracts.md](stage-2/raw/pim-contracts.md) |
| PIMC-11 | LOW | OPEN | CONFIRMED-RAW | legacy-синхронизация после отката v3 отклоняет весь пакет (400 `SYNC_FAILED`, вероятно FK `pim_color_owner` при `DELETE FROM variants`, `api/lib. | [raw/pim-contracts.md](stage-2/raw/pim-contracts.md) |
| PIMC-12 | MEDIUM | FIXED | red/green | Валидация элементов корневых MODEL photos | `63450c5` |
| PIMC-13 | MEDIUM | FIXED | red/green | Строго UAH в envelope до записи staged chunk | `78f639f` |
| PIMC-C1 | LOW | PIM OWNER DECISION | CONFIRMED | Manifest hash точной wire fixture | proposals/PIMC-C1.patch |
| PIMC-P1 | HIGH | PIM OWNER DECISION | private | Детали приватны до исправления | [raw/pim-contracts.md](stage-2/raw/pim-contracts.md) |
| PIMC-P2 | MEDIUM | PIM OWNER DECISION | CANDIDATE | устаревший остаток не понижается (часть PIMC-01): `classification-ui.inc.js:190`, `final-workflow.inc.js:153,242`. | [raw/pim-contracts.md](stage-2/raw/pim-contracts.md) |
| PIMC-P3 | MEDIUM | PIM OWNER DECISION | CONFIRMED | Broken-photo evidence для color galleries | proposals/PIMC-P3.patch |
| PIMC-P4 | MEDIUM | PIM OWNER DECISION | CONFIRMED | Request-only size assortment ограничен своим COLOR | proposals/PIMC-P4.patch |
| QA-01 | LOW | FIXED / Linux green; macOS not rerun | CANDIDATE | `dev/deploy-update.sh:39` использует `realpath -m` (в BSD нет `-m`); также `find -printf` (`:18`), `sha256sum` (`:9`). Решение: сделать скрипт пе | [raw/qa.md](stage-2/raw/qa.md) |
| QA-02 | LOW | FIXED / Linux green; macOS not rerun | CANDIDATE | `dev/deploy-update.sh:39` использует `realpath -m` (в BSD нет `-m`); также `find -printf` (`:18`), `sha256sum` (`:9`). Решение: сделать скрипт пе | [raw/qa.md](stage-2/raw/qa.md) |
| QA-03 | LOW | FIXED / Linux green; macOS not rerun | CANDIDATE | `shop/automation-worker.sh:9` `command -v flock // exit 2`; на macOS нет `flock`; тест не проверяет код выхода и падает с вводящим в заблуждение  | [raw/qa.md](stage-2/raw/qa.md) |
| QA-04 | LOW | FIXED / Linux green; macOS not rerun | CANDIDATE | `tests/helpers/mysql-snapshot.php:5` требует путь `/tmp/` (на macOS `mkdtemp` даёт `/var/folders/…`), молча `exit(1)`; затем `git show d5e93f9` т | [raw/qa.md](stage-2/raw/qa.md) |
| QA-05 | MEDIUM | FIXED / Linux green; macOS not rerun | CANDIDATE | 8.2, тесты — `php8.4`; production — PHP 8.2; ни один CI-прогон не проверяет 8.2 (кроме `php -l` при деплое). Исправление: матрица CI с `php-versi | [raw/qa.md](stage-2/raw/qa.md) |
| QA-06 | MEDIUM | FIXED / Linux green; macOS not rerun | CANDIDATE | CSRF/Origin публичных эндпоинтов магазина (`shop/store-lib.php:58-60`) не тестируется: удаление строки 59/60 оставит набор зелёным. Исправление:  | [raw/qa.md](stage-2/raw/qa.md) |
| QA-07 | MEDIUM | FIXED / Linux green; macOS not rerun | CONFIRMED-RAW | срок оплаты в рабочих днях (`shop/order-lifecycle.php:4-8` `shopWorkdayDeadline`: Europe/Kyiv, выходные, `bank_holidays`, переходы DST 2026-03-29 | [raw/qa.md](stage-2/raw/qa.md) |
| QA-08 | MEDIUM | UNCONFIRMED | CANDIDATE | только через фейковый php); `supplier-notifications.php` (`supplierSendPending:36`, `supplierAcknowledge:48`, `supplierLate:51`) не тестируется в | [raw/qa.md](stage-2/raw/qa.md) |
| QA-09 | MEDIUM | UNCONFIRMED | CANDIDATE | НП: `shop/np-print.php`, `np-check.php` без тестов; `npCancelDraft` (`np-fulfillment.php:190`), `npReconcile:174`, `npRefresh:198` без поведенчес | [raw/qa.md](stage-2/raw/qa.md) |
| QA-10 | MEDIUM | UNCONFIRMED | CANDIDATE | PIM: тест на побайтное равенство экспорта фикстуре. | [raw/qa.md](stage-2/raw/qa.md) |
| QA-11 | MEDIUM | OPEN | CONFIRMED-RAW | `automation.test.mjs:84-89` проверяет фейковый интерпретатор; «нет перекрытия» опирается на sleep 0.2 с. | [raw/qa.md](stage-2/raw/qa.md) |
| QA-12 | MEDIUM | FIXED | CANDIDATE | отрицательные проверки после фиксированного sleep: `order-idempotency.test.mjs:36` (300 мс), `:42`, `:47` (1500 мс), `cart-reminder-ui.test.mjs:2 | [raw/qa.md](stage-2/raw/qa.md) |
| QA-13 | LOW | UNCONFIRMED | CANDIDATE | `pricing-policy.test.mjs`: проверки в PHP `check()`; диагностика слабая. | [raw/qa.md](stage-2/raw/qa.md) |
| QA-14 | LOW | UNCONFIRMED | CANDIDATE | проверки по тексту исходников (`site-qa`, `release-hardening`, `runtime-security`, `pim-v3-foundation`). | [raw/qa.md](stage-2/raw/qa.md) |
| QA-15 | LOW | UNCONFIRMED | CANDIDATE | тихие skip без `RUBIZH_TEST_MYSQL_SOCKET`; в CI проверять `skipped 0`. | [raw/qa.md](stage-2/raw/qa.md) |
| QA-16 | MEDIUM | OPEN | CONFIRMED-RAW | оставить счётчик запросов и EXPLAIN, время ослабить. | [raw/qa.md](stage-2/raw/qa.md) |
| QA-17 | LOW | UNCONFIRMED | CANDIDATE | гонка свободного порта `tests/helpers/site-fixture.mjs:17`. | [raw/qa.md](stage-2/raw/qa.md) |
| QA-18 | LOW | UNCONFIRMED | CANDIDATE | ~40 фиксированных `waitForTimeout` в браузерных тестах. | [raw/qa.md](stage-2/raw/qa.md) |
| QA-19 | LOW | UNCONFIRMED | CANDIDATE | арифметика с реальными часами. | [raw/qa.md](stage-2/raw/qa.md) |
| RELEASE-OPS-01 | HIGH | FIXED | CANDIDATE | Installer deploys an older artifact than the audited source | `d744e55` |
| RELEASE-OPS-02 | HIGH | FIXED | CANDIDATE | New reservation code becomes live before its mandatory schema migration | `2c6fbf6` |
| RELEASE-OPS-03 | MEDIUM | FIXED | red/green | HTTP smoke требует 200 и ограничен timeout | `254f08d` |
| REV-Q8-01 | MEDIUM | FIXED | red current / baseline control + independent review | Reminder recovery сохраняет полные qty и kit_units, цены пересчитаны | `e7de3ea` |
| REV-Q8-02 | MEDIUM | FIXED | red/green + independent review | Явный retail intent сохранён внутри квалифицирующей kit group | `e7de3ea` |
| SEC-01 | HIGH | FIXED | CANDIDATE | детали в закрытом хранилище | `56acdcb` |
| SEC-02 | MEDIUM | OPEN | CONFIRMED-RAW | SMS-вход раскрывает, зарегистрирован ли номер | [raw/security.md](stage-2/raw/security.md) |
| SEC-03 | MEDIUM | OWNER DECISION | CANDIDATE | дешёвый отказ во входе (email-ссылка, SMS) | [raw/security.md](stage-2/raw/security.md) |
| SEC-04 | MEDIUM | UNCONFIRMED | CANDIDATE | неподтверждённый email гостевого заказа импортируется в аккаунт и получает письма | [raw/security.md](stage-2/raw/security.md) |
| SEC-05 | MEDIUM / conditional HIGH | OWNER DECISION | private | Детали приватны до исправления | [raw/security.md](stage-2/raw/security.md) |
| SEC-06 | MEDIUM | OWNER DECISION | CANDIDATE | слабости лимитов: IPv6, переполнение корзин, fail-closed 503 | [raw/security.md](stage-2/raw/security.md) |
| SEC-07 | MEDIUM | OWNER DECISION | CANDIDATE | блокировка входа сотрудника CRM посторонним | [raw/security.md](stage-2/raw/security.md) |
| SEC-08 | MEDIUM | OWNER DECISION | CANDIDATE | пробелы HTTPS-редиректа и HSTS | [raw/security.md](stage-2/raw/security.md) |
| SEC-09 | MEDIUM | OWNER DECISION | CANDIDATE | служебные и релизные файлы в дереве и не закрыты | [raw/security.md](stage-2/raw/security.md) |
| SEC-10 | LOW | OPEN | CONFIRMED-RAW | секреты в query string, неограниченный подбор ключей | [raw/security.md](stage-2/raw/security.md) |
| SEC-11 | LOW | OPEN | CONFIRMED-RAW | изменение состояния по GET в `shop/cart-return.php:10-12` | [raw/security.md](stage-2/raw/security.md) |
| SEC-12 | MEDIUM | OWNER DECISION | CANDIDATE | время жизни сессии не задано; доступ гостя к заказу только через сессию | [raw/security.md](stage-2/raw/security.md) |
| SEC-13 | LOW | UNCONFIRMED | CANDIDATE | CSP: `'unsafe-eval'`, `style-src 'unsafe-inline'`, `img-src https:` (`shop/runtime.php:38-42`) — остаточный риск при XSS (XSS не найден). | [raw/security.md](stage-2/raw/security.md) |
| SEC-14 | LOW | UNCONFIRMED | CANDIDATE | LOW / INFO | [raw/security.md](stage-2/raw/security.md) |
| SEC-15 | HIGH | FIXED | 1 red / 9 green | Legacy manager допускается только по proven email identity | `8235cf1` |
| SEO-01 | MEDIUM | FIXED | CANDIDATE | Hydration reasserts InStock without known stock (MEDIUM, high confidence) | `c06753a` |
| SEO-02 | MEDIUM | FIXED | CANDIDATE | Client replaces richer Product schema with an image-less model offer (MEDIUM, high confidence) | `c06753a` |
| SEO-03 | MEDIUM | FIXED | CANDIDATE | Two meta descriptions on non-home storefront responses (MEDIUM, high confidence) | `c06753a` |
| SEO-04 | MEDIUM | FIXED | CANDIDATE | SPA product inherits catalog noindex and breadcrumbs (MEDIUM, high confidence) | `c06753a` |
| SEO-05 | LOW | FIXED | CANDIDATE | Out-of-range pagination canonical disagrees after hydration (LOW, high confidence) | `c06753a` |
| SP-1 | HIGH | FIXED | red/green | Противоречивые/дублированные cancelList facts паркуются до изменения ledger | `c1c3498` |
| SP-2 | HIGH | FIXED | red/green | SITE refund/reconcile проверяют prepared version под lock | `ce8b8e8` |
| SP-3 | HIGH | FIXED | red/green | Diagnostic observations сериализованы и не откатывают terminal evidence | `415a08b` |

| CRM-FE-01 | MEDIUM | CRM OWNER DECISION | CANDIDATE / observed safe409 | Rapid mutation/refetch может требовать явного обновления перед invoice; приложение CRM не менялось | proposals/CRM-SUMMARY.md |

| A11Y-13 | MEDIUM | FIXED | browser red/green + independent changes review | Desktop/mobile modal focus, Tab boundary, inert background, Escape and nested opener restoration | `475a7bb` / a11y-hardening |

Дубликаты/общая причина: ARCH-04 ↔ SP-2 (finance forms; confirmation доводится отдельно); ARCH-05 ↔ FPAY-01/02 (SITE guarded, CRM proposal only); SEC-03/06 ↔ D-15 (limiter); A11Y-11 ↔ D-34 (targets); PERF-01 ↔ PERF-1 этапа1; ARCH-11 kit pricing ↔ D-11/Q8. Уверенность по неразрешённым HIGH и полные первичные доказательства сохранены приватно; статическое предположение не приравнивается к production-факту. Безусловное освобождение неизвестной оплаты или COMMITTED запаса не является безопасным исправлением.

Q8: `git merge-base --is-ancestor rubizh-stage-1-verified ee207fa` — PASS. K1–K6 и regression-first доказательства приведены в 10-KIT_RULES_PROPOSAL. D-11 закрывается реализацией ee207fa +52bfc2c и финальным recovery исправлением REV-Q8-01; ee207fa не использован слепыми аудиторами.

Без изменений PIM/CRM source, без включения sync/AUTOPRICES, без live payment/SMS/TTN и без удаления Q9 assets. Цены и thresholds не заменены SITE значениями. Итог quality/CI/SHA и решение этапа фиксируются в STAGE_CHECKPOINT.


QA-12: CI PHP8.2 reproduced an order-retry timeout; fixed1500ms sleeps replaced by requestfailed/error/button readiness and session response. CRM browser stress reproduced STALE_ORDER during rapid mutation/refetch; test now performs a real user refresh and waits current order response before invoicing. Commit92f5baf; targeted3/3 PASS, independent QA review retained all order/key/money assertions and proved six CI guard controls. This does not claim a CRM application fix; rapid no-refresh handling remains CRM-FE-01 (MEDIUM, CANDIDATE / owner review).

QA-12 additional correction: `1fcca31` observes HTTP200/networkidle before existing light-theme assertions; all21 route/width cases,8000ms locator bound,4.5 contrast and no-overflow assertions retained. Independent scoped review accepted exact file bytes; targeted1/1 PASS. Full final outcome is recorded below in checkpoint, not inferred from this targeted run.

| QA-20 | MEDIUM | OWNER DECISION | CONFIRMED / Git object + API visibility | Унаследованные unredacted raw присутствуют в публичной Git history; current redaction не удаляет историю. Rewrite/force-push запрещён владельцем и не выполнен | Исторический2a338da; privacy metadata retained locally |
