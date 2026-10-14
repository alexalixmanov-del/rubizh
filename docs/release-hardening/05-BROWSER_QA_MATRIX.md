# 05 — BROWSER QA MATRIX

> Актуальный checkpoint этапа2-B приведён первым. Предыдущие результаты ниже сохранены как история; решения владельца меняются только в утверждённом R1–R11 scope.

<!-- STAGE2B_FINAL_CHECKPOINT_BEGIN -->

Все кодовые gates завершены. Решение **GO этапа 2** вступает в силу после SUCCESS CI самого doc-only checkpoint на его точном SHA; окончательные SHA/CI и опубликованный тег подтверждаются внешней metadata и итоговым ответом.

Код приложения f2264c6 и177efa9 идентичен: проверены SHA256 всех517 tracked regular files вне docs/tests; между ними добавлен только файл трёх регрессионных тестов R9. Поэтому browser/R9/Lighthouse сохраняют фактический runtime SHA f2264c6, а полный SITE/CI —177efa9; исходные SHA не переименованы.

## Этап 2-B — итоговый checkpoint 2026-10-14

Статус этапа 2-B: **GO_STAGE2_ONLY**. Код: `177efa9f5dea4e5ba1b0f16781ba41db582f86ad`; ветка `hardening/stage-2-audit-fixes`. Эти результаты относятся только к указанному финальному коду; прежние разделы сохраняют исторический статус и не заменяют новые gates.

| Финальный gate | Фактический результат / привязка |
|---|---|
| R9 critical guards | PASS; source `f2264c6fc16deac69118bbfbfa760099fd0c4bdb`; contracts 120; applicable 24686, executed 24686, passed 24686, failed 0, missing 0, extra 0, duplicates 0; independent review r9_resume_review; APPROVED_FINAL_R9_CRITICAL_COVERAGE; r9/final-f226-runtime-consolidation.json + resume-independent-final-runtime-review.json; historicalcompatible13982/fresh10704/52justifiedNAs/census155PHP; all22modulesactualcomplete |
| Полный SITE | PASS на `177efa9f5dea4e5ba1b0f16781ba41db582f86ad`; total 497, pass 497, fail 0, skip 0, cancelled 0; stage2b-site-final-execution.json + actualTAP497/497/0FAIL/SKIP/CANCEL; all*.test.mjs; portable3persisted |
| Три browser engines | PASS на `f2264c6fc16deac69118bbfbfa760099fd0c4bdb`; Chromium / Firefox / WebKit × 360/390/430/768/1024/1280/1440; pages 336, purchase flows 21, native auth PASS48/48 (39raw+9actualChromium/Firefox/WebKit; realserverFetchMetadata; noEffect/noLeak); runtime errors 0, overflow 0, broken images 0; stage2b-browser-final/validation.json + source-binding;336pages+21actualnew1250orders/mockbankhandoffs,zeroerrors;14expected404consoleentries;purchaseoraclecorrectedwithindreview;capturedexits0;cabinet21/addendum210separatePASS |
| Кабинет / addendum | 21/21 и 210/210 PASS; Chromium/Firefox/WebKit ×7 widths; фактический source f2264c6; source-binding/validation/captured exit0 сохранены |
| axe | PASS на `f2264c6fc16deac69118bbfbfa760099fd0c4bdb`; checks 32, violations 0, inventory flags 109; stage2b-axe-final/validation.json + source-binding + captured exit0 |
| Lighthouse A | MEASURED_MIXED_DELTAS; baseline `d1dbfde5af7ea1e95e218f960a192faf985e7665` → final `f2264c6fc16deac69118bbfbfa760099fd0c4bdb`; paired runs 32, runtime errors 0; mobile home: score 49→54, LCP 7.36→7.42s, TBT 1021→712ms; catalog: score 50→51, LCP 7.12→7.01s, TBT 1021→923ms; product: score 54→57, LCP 6.37→5.75s, TBT 765→749ms; kit: score 54→51, LCP 6.82→7.37s, TBT 738→876ms; desktop home: score 78→90, LCP 1.66→1.50s, TBT 290→139ms; catalog: score 90→92, LCP 1.56→1.49s, TBT 165→142ms; product: score 93→95, LCP 1.34→1.25s, TBT 136→122ms; kit: score 93→94, LCP 1.49→1.35s, TBT 118→108ms; deltas CSS gzip44107→30974bytes (−29.8%); mobileLCP home+0.89%,catalog−1.58%,product−9.77%,kit+7.99%; mixed measurements, no numeric80 gate/CWV certification; B/C deferred; r11-compressed-performance-d1/results.json,validation.json,32rawLHJSON; capturedexit0; independentrawmetrics/settingsreview;8gzipdecoded-valid/6staticbyte-equivalent; imageprobeobservations retained |
| Integrity / restore | npm audit Fresh SITE0(exit0); PIM1unchangedMODERATE(exit1),0HIGH/CRITICAL; manifests/locks/source unchanged; PIMdeps outsideauthorizedR7scope; gitleaks Raw1/exit1,0confirmed secrets; exact independentlyreviewed syntheticpricingfixture; no rule suppression; PHP syntax 155/155 PHP syntax PASS at exact code177efa9; synthetic restore Fresh current fullsuite synthetic rehearsal:61tables+2triggers fullyrestored, additiveCLI/safe-onlybackfill/oldcode rollbackPASS;productionwrites0 |

R9 считает уникальные предварительно объявленные applicable cell IDs. План итогового ledger содержит 10 704 обязательных свежих cell IDs на f2264c6 и 13 982 historically compatible cell IDs с независимо подтверждённой применимостью неизменённых guard/business predicates. Фактически завершённые свежие клетки: 10704; required-fresh denominator сам по себе не означает executed/PASS. Финальная сверка R9 завершена: PASS; независимое review — r9_resume_review; APPROVED_FINAL_R9_CRITICAL_COVERAGE. Исторические SHA сохранены и не переименованы в финальный SHA. Planned, подготовленные, пересекающиеся supporting checks и skipped не считаются PASS. Все 52 N/A имеют source rationale; диагностический ответ сам по себе не доказывает авторизацию. Expected404 отделены от runtime JS failures. axe покрывает выполненные WCAG 2.1 A/AA проверки; 109 inventory flags учитываются отдельно от 0 violations и не являются WCAG 2.2 certificate или dead-click PASS. Lighthouse — попарное измерение same host/data/compression/cache/throttling, mixed deltas не превращаются в безусловный performance PASS.

Предварительный CI38415388496 на ebc5e83 завершился FAILED: PHP8.2/8.3, 488/487/1. Причина — реальный native-form `Origin:null` при `Referrer-Policy:no-referrer`, а не SMS fixture. Проверенное исправление2e78b98 сохраняет CSRF и допускает opaque origin только при `same-origin/navigate/document`; historical exact code CI38459393928 SUCCESS не заменяет CI окончательного SHA. Дополнительный R5 follow-up bcb3c2f прошёл независимое review и регрессии исходного срока оплаты; финальные gates приведены в таблице. Детали неразрешённых HIGH не публикуются.

Native opaque-origin проверяется реальными формами во всех трёх engines; Secure-cookie корректировка допускается только в generated local HTTP fixture. Browser viewport не означает real-device validation; доступность WCAG axe не означает полную assistive-tech certification.

Production **NO-GO** сохраняется: завершение этапа 2 не разрешает deploy или этапы3–6. Живые bank/НП/SMS/mail/OAuth и сквозной provider E2E — **DEFERRED → этап6**, а не PASS. Все локальные деньги/заказы/сессии и ответы провайдеров синтетические; production данные, импорты, поставщики и AUTOPRICES не использовались.

R8: default `trusted_proxies=[]` проверяется кодом; только значение хостинга остаётся **BLOCKED(owner)** до ответа хостинга. Прочие OWNER DECISION не изменены. QA-20 исторический риск принят владельцем (**ACCEPTED, nonblocking**); current redaction не исправляет уже опубликованную историю, force/history rewrite не выполнялись. Перед production обязательна отдельная смена `pim_key`/`cron_key` и проверка отказа старым ключам.

CRM dependency `b0e2f9359a05ec835a83d64bb9bcdc2c97487a50` read-only; CRM-SEC-FRESH-01/CRM-PHP-01/CRM-FE-01 остаются на этапе4. PIM: только утверждённый R7/PIMC-P1 на `5fd46cb6fcd32fe628e8ccd0c9ebe4f4c998b055`, exact PIM CI38329162970 SUCCESS на неизменённом PIM SHA; прочие PIM предложения/зависимости не менялись. PIM baseline682 и final684 не взаимозаменяемы. Варианты performance B/C не реализованы; production CWV/p75/capacity и настоящие мобильные устройства не сертифицированы.

<!-- STAGE2B_FINAL_CHECKPOINT_END -->


## Исторические результаты до этапа 2-B


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
