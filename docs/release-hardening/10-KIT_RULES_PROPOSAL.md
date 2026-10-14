# 10 — KIT DISCOUNT RULES: current state and proposal (Q-8)

> Актуальный checkpoint этапа2-B приведён первым. Предыдущие результаты ниже сохранены как история; решения владельца меняются только в утверждённом R1–R11 scope.

<!-- STAGE2B_FINAL_CHECKPOINT_BEGIN -->

Все кодовые gates завершены. Решение **GO этапа 2** вступает в силу после SUCCESS CI самого doc-only checkpoint на его точном SHA; окончательные SHA/CI и опубликованный тег подтверждаются внешней metadata и итоговым ответом.

Код приложения f2264c6 и177efa9 идентичен: проверены SHA256 всех517 tracked regular files вне docs/tests; между ними добавлен только файл трёх регрессионных тестов R9. Поэтому browser/R9/Lighthouse сохраняют фактический runtime SHA f2264c6, а полный SITE/CI —177efa9; исходные SHA не переименованы.

## Этап 2-B — итоговый checkpoint 2026-10-14

Статус этапа 2-B: **GO_STAGE2_ONLY**. Код: `177efa9f5dea4e5ba1b0f16781ba41db582f86ad`; ветка `hardening/stage-2-audit-fixes`. Эти результаты относятся только к указанному финальному коду; прежние разделы сохраняют исторический статус и не заменяют новые gates.

Утверждённые K1/K2, N/qty/retail-mode, SKU/kit-slot и server pricing rules сохранены. Уже оформленные денежные snapshots не пересчитываются. Stage2B не вводит новых ценовых или комплектных решений; соответствующие окончательные денежные/checkout proofs входят R9 и full SITE ниже.

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

Production **NO-GO** сохраняется: завершение этапа 2 не разрешает deploy или этапы3–6. Живые bank/НП/SMS/mail/OAuth и сквозной provider E2E — **DEFERRED → этап6**, а не PASS. Все локальные деньги/заказы/сессии и ответы провайдеров синтетические; production данные, импорты, поставщики и AUTOPRICES не использовались.

R8: default `trusted_proxies=[]` проверяется кодом; только значение хостинга остаётся **BLOCKED(owner)** до ответа хостинга. Прочие OWNER DECISION не изменены. QA-20 исторический риск принят владельцем (**ACCEPTED, nonblocking**); current redaction не исправляет уже опубликованную историю, force/history rewrite не выполнялись. Перед production обязательна отдельная смена `pim_key`/`cron_key` и проверка отказа старым ключам.

CRM dependency `b0e2f9359a05ec835a83d64bb9bcdc2c97487a50` read-only; CRM-SEC-FRESH-01/CRM-PHP-01/CRM-FE-01 остаются на этапе4. PIM: только утверждённый R7/PIMC-P1 на `5fd46cb6fcd32fe628e8ccd0c9ebe4f4c998b055`, exact PIM CI38329162970 SUCCESS на неизменённом PIM SHA; прочие PIM предложения/зависимости не менялись. PIM baseline682 и final684 не взаимозаменяемы. Варианты performance B/C не реализованы; production CWV/p75/capacity и настоящие мобильные устройства не сертифицированы.

<!-- STAGE2B_FINAL_CHECKPOINT_END -->


## Исторические результаты до этапа 2-B


Дата: 2026-10-11. Решение владельца: «Не считать комплектом просто 2+ штуки одного артикула… До согласования не меняй финансовые расчёты». **Код расчётов не менялся.** Ниже — как работает сейчас и точные правила на согласование.

## 1. Как работает сейчас

| Слой | Где | Правило |
|---|---|---|
| Источник kit-цены | PIM `app/lib/pricing.inc.js` `kitFloor()` (прочитано, PIM не менялся) | Для каждого SKU PIM считает `kit_price` из выплаты поставщику + маржа комплекта (`cfg.kitMargin`) + налоги/эквайринг + доставка; округление вверх |
| Проверка на SITE | `shop/pricing-policy.php` `shopPricingPolicy()` | kit-цена принимается, только если есть `minimum_sale_price`, `discount_margin_floor_pct = 15` и `minimum ≤ kit_price ≤ розница`; иначе kit-цены нет → розница |
| Цена строки | `shopPricingUnit()` | `price_mode=kit` → `kit_cents` SKU; ниже пола PIM — отказ `DISCOUNT_NOT_ALLOWED` |
| Готовые комплекты | `shopPricingKitComposition()` с `definitions` | состав строго как в определении: те же модели, SKU/цвет (если заданы), количество |
| Свой комплект (`kit_group`) | `shopPricingKitComposition()` без определения | **достаточно ≥ 2 разных SKU или ≥ 2 единиц** — поэтому 2 шт. одного SKU получают kit-цену (D-11) |
| Совместимость | `shop/pricing.php` | промокод не суммируется с комплектом и оптом |
| Ограничение | клиент `kitAdd` | не более 20 единиц в конструкторе |
| Витрина | `shop-client` | сумма «Разом» = Σ kit-цен строк с подтверждённой kit-ценой + розница остальных; сервер пересчитывает перед оплатой |

Деньги не «теряются» ниже пола PIM ни в одном сценарии: даже при D-11 цена ≥ `minimum_sale_price`. Проблема бизнес-логики — скидка за «комплект» из одинаковых вещей.

## 2. Предлагаемые правила (на согласование)

**K1. Что такое свой комплект.** Группа `kit_group`, в которой есть **≥ 2 разные модели** (`product_id`) из **≥ 2 разных слотов** конструктора (Голова, Тіло, Ноги, Взуття, Бронезахист, Спорядження, Медицина, Дрібниці — `shopSlot()`/канонические категории). 2 шт. одного SKU или 2 модели одного слота сами по себе комплектом не являются.

**K2. Количество.** В одном комплекте kit-цена применяется к **1 единице каждой модели**. Дополнительные единицы той же модели в том же комплекте — по рознице. Несколько одинаковых комплектов оформляются через «Для підрозділу» (N комплектов), где kit-цена действует на N единиц каждой модели.

**K3. Цена позиции.** Только kit-цена SKU из PIM, прошедшая проверки §1 (пол ≤ kit ≤ розница); иначе розница. Процентов «от количества позиций» нет.

**K4. Не суммируется** с промокодом и оптовой ценой (как сейчас).

**K5. Отображение.** «Знижка на комплект» = Σ(розница − kit-цена) только по строкам, получившим kit-цену; если 0 — строка не показывается (уже так после ADDENDUM K-5).

**K6. Источник истины — сервер.** Клиент лишь отображает те же правила; при расхождении — `PRICE_CHANGED`/`INVALID_KIT` с объяснением до оплаты (существующий механизм).

## 3. Вопросы владельцу

1. Слот «Дрібниці» (аксессуары) засчитывается как второй слот для K1 или нужен «основной» слот (Тіло/Ноги/Взуття/Бронезахист)?
2. Две разные модели одного слота (две куртки) + одна вещь другого слота: kit-цена на обе куртки или только на одну?
3. Применять ли K1/K2 к уже сохранённым черновикам и ссылкам «Комплект від побратима» сразу (пересчёт с объяснением) — предлагаю да.

## 4. План реализации после согласования (regression-first)

1. Тесты сервера: 2 шт. одного SKU → `INVALID_KIT`/розница; 2 модели одного слота → нет kit; 2 слота → kit; лишняя единица → розница; «Для підрозділу» N.
2. `shopPricingKitComposition()` (+ определение слота на сервере), без изменения PIM и без миграций.
3. Тот же расчёт в клиенте конструктора; браузерные тесты сводки.
4. CRM-тесты домена заказов (общий `shopValidateOrder`).


## Stage 2 — УТВЕРЖДЕНО владельцем 2026-10-11; проверено 2026-10-12

Исходные разделы выше — история предложения. Решение раздела 10 актуального ТЗ реализовано в `ee207fa` после тега `rubizh-stage-1-verified` (`git merge-base --is-ancestor` = 0). Аудит доменов выполнялся на `51c83d808228a26328081b02211b4e3605353755`, без использования этого коммита.

Итоговые K1–K6:

- Свой комплект содержит ≥2 разные модели из ≥2 основных разделов: Голова, Тіло, Ноги, Взуття, Бронезахист, Спорядження, Медицина. «Дрібниці» не квалифицируют комплект, но получают kit-цену после выполнения условия.
- Каждая модель получает kit-цену на одну единицу; N комплектов «Для підрозділу» — на N единиц каждой модели. Две модели одного раздела вместе с другим основным разделом получают kit-цену обе; дополнительные единицы — розница.
- Только подтверждённая PIM kit-цена с существующим маржинальным полом; иначе розница. Промокод и оптовая цена не суммируются. Сервер остаётся источником истины.
- Черновики и ссылки пересчитываются с объяснением; уже оформленные денежные снимки не пересчитываются из-за изменения K1/K2. Подсказка K1: «Додайте річ ще з одного розділу, щоб отримати ціну комплекту». Дополнительные единицы также объясняются.
- Клиент использует канонический `kit_slot` PIM v3 из публичного DTO вместо догадки по названию; PRICE_CHANGED/INVALID_KIT блокируют несогласованную оплату.

Проверки: 17 правил сервера и 14 браузерных/HTTP/CRM проверок; одинаковые проверки на закреплённой базе дали 25 ожидаемых failures и 6 неизменённых passing controls (31 всего). Нельзя требовать падения неизменённых положительных контрольных сценариев. На реализации все 31 проходят; дополнительные связанные наборы — 49/49. Проверены ширины 360/390/430/768/1024/1280/1440, реальная передача в общий `shopValidateOrder`, черновик/ссылка, N комплектов, старый заказ и неизменность сохранённых 9430.00 при подтверждении/счёте. Полный финальный gate и SHA — в STAGE_CHECKPOINT.


### Финальное независимое review Q8 и recovery (2026-10-12)

Дополнительно regression-first закрыты REV-Q8-01/02: reminder хранит валидированную selection, а не оплачиваемые kit/retail fragments; qty и `kit_units` сохраняются, состав целиком пересчитывается сервером. Явный retail mode внутри kit group остаётся retail, одновременно участвуя в определении состава. Активный legacy/v3 клиент передаёт тот же mode/group/N. Коммит `e7de3eacd49c7f3bd9287cc559962de53c08dede`; 23/23 focused checks без FAIL/SKIP; независимые N1/N3 recovery/reload/browser/actual outgoing controls подтвердили parity. Старые snapshots без поля N не позволяют восстановить утраченный N: используется безопасный default1, полный qty сохраняется, цены пересчитываются с пояснением перед новым заказом. Размещённые order snapshots не меняются.
