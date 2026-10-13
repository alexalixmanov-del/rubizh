# 05 — BROWSER QA MATRIX

Дата: 2026-10-11. Ветка `hardening/site-release-20261011`. Стенд: изолированная копия SITE (PHP 8.2 + MariaDB 11.4, legacy-каталог как в production, канонические категории, маршруты production `.htaccess`), синтетические товары (`tests/.staging/qa-fixture.mjs`). Production, PIM, CRM не затрагивались; реальных платежей и ТТН нет (MonoPay — mock).

Инструменты (повторяемые): `tests/.staging/qa-matrix.mjs` (витрина + покупка), `tests/.staging/qa-cabinet.mjs` (кабинет), `tests/.staging/qa-audit.mjs` (кнопки/ссылки, axe, Lighthouse → 07). Скриншоты и JSON — во временной папке сессии, в репозиторий не коммитятся (могут содержать тестовые номера заказов).

## 1. Витрина: 3 движка × 12 ширин × 15 страниц = 540 загрузок

Движки: Chromium (Chrome for Testing), WebKit (Safari), Firefox — Playwright 1.62.1. Ширины: 320, 360, 375, 390, 414, 430, 768, 820, 1024, 1280, 1440, 1920. Для < 768 в Chromium/WebKit — мобильная эмуляция (touch).

| Страница | URL | Статус | Overflow | Битые фото | JS-ошибки | `<title>` |
|---|---|---|---|---|---|---|
| Главная | `/` | 200 ×36 | 0 | 0 | 0 | РУБІЖ — тактичний одяг та спорядження |
| Каталог | `/catalog` | 200 ×36 | 0 | 0 | 0 | Каталог тактичного спорядження — РУБІЖ |
| Категория | `/catalog/odiah-ta-forma` | 200 ×36 | 0 | 0 | 0 | Одяг та форма — купити в РУБІЖ |
| Подкатегория | `/catalog/odiah-ta-forma/kurtky` | 200 ×36 | 0 | 0 | 0 | Куртки — купити в РУБІЖ |
| Все категории | `/categories` | 200 ×36 | 0 | 0 | 0 | Усі категорії — РУБІЖ |
| Поиск | `/catalog?q=Куртка` | 200 ×36 | 0 | 0 | 0 | каталог (noindex при фильтрах) |
| Пустой поиск | `/catalog?q=zzz…` | 200 ×36 | 0 | 0 | 0 | каталог |
| Товар | `/product/qa-jacket` | 200 ×36 | 0 | 0 | 0 | Куртка QA Softshell — РУБІЖ |
| Товар под заказ | `/product/qa-pouch` | 200 ×36 | 0 | 0 | 0 | товар |
| Нет товара | `/product/qa-missing` | **404** ×36 | 0 | 0 | 404 ресурса (ожидаемо) | Не знайдено — РУБІЖ |
| Оферта | `/offer` | 200 ×36 | 0 | 0 | 0 | Публічна оферта — РУБІЖ |
| Конфиденциальность | `/privacy` | 200 ×36 | 0 | 0 | 0 | Політика конфіденційності — РУБІЖ |
| Поради | `/porady` | 200 ×36 | 0 | 0 | 0 | Поради — РУБІЖ |
| Комплект | `/kit` | 200 ×36 | 0 | 0 | 0 | Зібрати комплект — РУБІЖ |
| Вход | `/auth/` | 200 ×36 | 0 | 0 | 0 | Вхід — РУБІЖ |

Ссылки без `href`/`#`: 0 на всех страницах. Изображения без `alt`: 0.

Наложенный платёж: 0 упоминаний на всех страницах, кроме оферты, где текст прямо говорит «Післяплати немає» (проверено, корректно).

## 2. Покупка: товар → цвет → размер → корзина → оформление → заказ

Куртка, цвет «Чорний» (галерея переключается только на фото чёрного), размер XL, корзина, форма (имя, телефон, город, отделение), «Підтвердити замовлення».

| Движок | 390 | 768 | 1280 |
|---|---|---|---|
| Chromium | заказ создан | заказ создан | заказ создан |
| WebKit | заказ создан | заказ создан | заказ создан |
| Firefox | заказ создан | заказ создан | заказ создан |

В каждом случае:
- галерея после выбора цвета — только фото этого цвета;
- в корзине SKU `J-B-XL`, ровно как выбрано;
- способы оплаты: «Оплата карткою» и «Оплата на рахунок ФОП»; наложенного платежа нет;
- заказ в БД: `status=new`, `payment_status=pending`, сумма 1250.00, 9 заказов на 9 оформлений (без дублей);
- страница «Замовлення отримано — очікуйте підтвердження», без overflow.

Перехода в MonoPay нет: legacy-товар «в наличии» по текущим правилам идёт через подтверждение менеджера (**Q-7**). Цепочка «подтверждение → счёт MonoPay → webhook → paid» покрыта серверными тестами (`release-hardening`, `p0-integration`, `pim-v3-checkout`).

## 3. Кабинет (`qa-cabinet`): Chromium/WebKit/Firefox × 360/390/768/1280 — 12/12

- Свои заказы видны.
- Чужой заказ — 404 (IDOR нет).
- Отменённая ТТН скрыта.
- Профиль, доставка и избранное — 200, без overflow.

## 4. Что найдено и исправлено в ходе QA

| Находка | Итог |
|---|---|
| Карточка каталога показывала фото другого цвета, а не того, с которого открывается товар (D-21, legacy и v3) | FIXED, регрессионные тесты |
| Повторное оформление из второй вкладки создавало второй заказ (D-18) | FIXED, браузерный тест на 2 вкладки |
| WebKit не сохраняет `Secure`-cookie по `http://127.0.0.1` → «Оновіть сторінку» | только тестовый стенд (production — HTTPS); QA-копия ослабляет флаг локально; D-24 — by design |
| Остаток тестового SKU исчерпался после 4 заказов → «Недостатньо товару на складі» | корректное резервирование; тестовый остаток увеличен |

## 5. Не покрыто этим прогоном

- Реальные iOS Safari / Android Chrome на устройствах (только эмуляция движков).
- Live MonoPay и Nova Poshta (только mock).
- Настоящие фото каталога (синтетические 1×1 PNG): визуальная проверка галерей на реальном контенте — на стейджинге с копией каталога.

## 6. ADDENDUM №2 — изменённые экраны (`qa-addendum`, 2026-10-11)

Chromium + WebKit × 360, 390, 430, 768, 1024, 1280, 1440 px × 10 экранов = **140 загрузок, 0 проблем** (JS-ошибки, горизонтальный overflow, HTTP ≥ 400, экран ошибки при статусе 200 — проверяются автоматически). Снимки (360/390/768/1280/1440) просмотрены вручную по ключевым экранам.

| Экран | Что проверено | Итог |
|---|---|---|
| Hero главной | одна CTA «Обрати спорядження», размер, обе темы | OK |
| Блок конструктора на главной | главная CTA «Зібрати комплект», вторичная «Допомогти з вибором» | OK |
| Футер «Ми в соцмережах» | 0/1/2 ссылки, 44×44, фокус, небезопасные ссылки не выводятся | OK |
| Инструкция конструктора | 4 шага, «Почати збір»/«Пропустити», Esc, фокус, без блокировки прокрутки | OK |
| Выбор в конструкторе | «Не обрано / Обрано: N товар», предупреждение о несовпадении размера | OK |
| Итог конструктора | «Вартість товарів → Знижка (если есть) → Разом», без нулевой «вигоди» | OK |
| Каталог с фильтрами | мобильная панель «Фільтри / Показати N товарів / Скинути» | OK |
| Пустой поиск | одно объяснение + «Увесь каталог» | OK |
| Кабинет | карточка: N товарів, оплата, доставка | OK |
| Страница заказа | три статуса, «Посилка N із M», «Оплата після підтвердження» | OK |

Найдено и исправлено при QA: вводящая в заблуждение «Оплата: Очікує оплати» до подтверждения менеджером (D-36). Ложная тревога инструмента (несуществующий формат ID клиента) исправлена в инструменте; инструмент теперь распознаёт экран ошибки при статусе 200.

Повторный прогон на текущем коде: витрина 540/540 + покупка 9/9 (3 движка), кабинет 12/12 (3 движка × 4 ширины).


## Глобальный этап2 — воспроизводимая полная матрица (2026-10-12)

Первый завершённый post-fix прогон на56acdcb: Chromium/Firefox/WebKit ×360/390/430/768/1024/1280/1440; **315 route loads +21 purchase flows**, без horizontal overflow/broken images/runtime JS failures. Chromium/WebKit записали ожидаемые resource404 console сообщения на synthetic product-404; они отдельно классифицированы как проверенный HTTP404, не замаскированы как отсутствие console сообщений. ADDENDUM экраны210/210, кабинет21/21 (own/foreign list/detail/profile/delivery/favorites; foreign404/no leak). Это локальные синтетические данные; Secure cookie изменён только в generated HTTP fixture, production code сохранён. MonoPay navigation локально перехвачена stub; никаких provider/production transactions.

После последних money/version/recovery исправлений матрица повторяется на application tree `0feae19e009bc29b73c1fb6d959cf2d2c3202821`, идентичном final code1fcca31 (поздние изменения только QA/CI): `MAIN MATRIX PASS:315/315 +21/21; ADDENDUM210/210, CABINET21/21 PASS`. Полный UI smoke относится к текущему legacy storefront с v3 activation OFF; PIMv3 contract/checkout/CRM suites дополняют его, но не заменяют live интеграционный gate этапа6.

Permanent CI proposal: отдельный browser job с pinned Playwright1.62.1 и cached verified engines, изолированный fixture/DB на каждый engine; перечисленные7 widths обязательны. Проверять expected HTTP status, JS/runtime errors, overflow, rendered images, checkout totals, variant color/size, normal/N-unit kits, saved/shared/reminder recovery, accountA/B, loading/empty/error/retry, light/dark theme и modal keyboard boundaries. Runner должен assert summary, не считать exit0 JSON writer достаточным. Budget/summary/console classifications и screenshots сохранять с точным SHA. Реальные устройства/assistive tech и provider sandbox — отдельная проверка, не вывод из headless viewport.

Первоначальный axe snapshot:30 route/width checks WCAG2.1 A/AA без violations; это не WCAG2.2 certificate. Inventory выявил138 flags (главным образом24px targets, breadcrumbs/cookie control); dead-click эвристика содержит no-op выбранных controls, timeouts и selector drift, поэтому её нельзя объявить PASS0. Пункты D-34/A11Y03–12 остаются в03 по своим подтверждениям. Финальные численные Lighthouse/axe результаты — checkpoint/evidence.

Финальный axe повтор:30/30 route/width checks,0violations WCAG2.1 A/AA;111inventory flags, не все подтверждённые defects. Исторические138 flags относятся к первому inventory. Dead-click heuristic не перепроверялась и не объявлена PASS. Парный compressed Lighthouse32/32 runs: численные baseline/current medians и mixed deltas вstage-2/FINAL_REPORT; performance threshold не объявлен PASS.

Final endpoint Quality Gate:132inventory rows,1920HTTP requests;831/831explicit expectations,2697/2697overlapping semantic checks,975snapshots+2A↔B whole-domain comparisons;0final assertion failures. ANY232/232 and narrowaction36/36; all inventory endpoints requested, full state/role/token combinations remainPARTIAL. Details and limits:stage-2/endpoint-quality-gate.md. Fresh SECURITY source review COMPLETED(15checks+1probe), no newHIGH/CRITICAL; MEDIUM SEC-FRESH-01 unapplied CRM proposal. OverallNO-GO: exhaustive dynamic certification and historical privacy requirement unmet, noStage2verifiedtag/Stage3.
