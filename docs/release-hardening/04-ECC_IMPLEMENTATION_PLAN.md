# 04 — ECC IMPLEMENTATION PLAN (фактическое состояние)

> Актуальный checkpoint этапа2-B приведён первым. Предыдущие результаты ниже сохранены как история; решения владельца меняются только в утверждённом R1–R11 scope.

<!-- STAGE2B_FINAL_CHECKPOINT_BEGIN -->

Все кодовые gates завершены. Решение **GO этапа 2** вступает в силу после SUCCESS CI самого doc-only checkpoint на его точном SHA; окончательные SHA/CI и опубликованный тег подтверждаются внешней metadata и итоговым ответом.

Код приложения f2264c6 и177efa9 идентичен: проверены SHA256 всех517 tracked regular files вне docs/tests; между ними добавлен только файл трёх регрессионных тестов R9. Поэтому browser/R9/Lighthouse сохраняют фактический runtime SHA f2264c6, а полный SITE/CI —177efa9; исходные SHA не переименованы.

## Этап 2-B — итоговый checkpoint 2026-10-14

Статус этапа 2-B: **GO_STAGE2_ONLY**. Код: `177efa9f5dea4e5ba1b0f16781ba41db582f86ad`; ветка `hardening/stage-2-audit-fixes`. Эти результаты относятся только к указанному финальному коду; прежние разделы сохраняют исторический статус и не заменяют новые gates.

| Решение владельца | Финальный статус | Реализация | Регрессии | Независимое review |
|---|---|---|---|---|
| R1 | FIXED | `4a28331,9e8dc28` | legacy opt-in/v3/atomicity regressions; Apache HTTPS/dot-file8/8 | stage2b_payments |
| R2 | FIXED | `17adae4` | two-SKU gap-lock + exactly one bounded transaction retry | stage2b_logistics |
| R3 | FIXED | `c946be4` | nonwaiting quote/order + version-race PRICE_CHANGED | stage2b_logistics |
| R4 | FIXED | `4775903,56f5c40,a2d577f,62518b9` | new feed/no double count; terminal/full-refund release; timezone boundaries | stage2b_logistics,stage2b_performance |
| R5 | FIXED | `6c3818c,1722bed,62518b9,bcb3c2f` | bank mock recovery/expiry/original deadline; unpaid confirmation2RED→2GREEN quantity reserves; independent compatibility10/10 | stage2b_performance,stage2b_blind_payments |
| R6 | FIXED | `4c58f8b` | OWNER unknown-TTN recovery/late-match race/14digits/monotonic tracking | stage2b_database |
| R7 | FIXED | `PIM5fd46cb6fcd32fe628e8ccd0c9ebe4f4c998b055` | 2new regressions RED on2119846; full684/684 PASS; release hash chain; exactCI38329162970 SUCCESS | stage2b_payments |
| R8 | FIXED; trusted_proxies hosting value BLOCKED(owner) | `43df5e9,c90d06d,f2264c6` | identity/proof/verified success-only order count/failed-only staff; local-font CSP1RED→1GREEN; target19/19 | stage2b_performance,stage2b_blind_security |
| R9 | FIXED | `ebc5e83,2e78b98,177efa9` | 24,686uniquecriticalboundarycells:10,704freshf226+13,982independentlycompatible;52justifiedNAs; native48/48; externalportable3/3 | stage2b_payments,r9_final_runtime_review,r9_resume_review |
| R10 | ACCEPTED(owner), nonblocking | `final checkpoint documentation` | history unchanged; future pim_key/cron_key rotation in16/08; R1 mitigation | owner decision |
| R11 | FIXED (approved variant A); measured mixed deltas; B/C deferred | `e150e43` | CSSdeterministic3/3;8visualpairs; CSSgzip−29.8%;32pairedLHactualcompleted0runtimeerrors; mobilemedianshome49→54,catalog50→51,product54→57,kit54→51 | root independent source/visual review; final_checkpoint_review raw32LHmetrics |

R5 включает независимо проверенное исправление BLIND-PAY-02: повторное подтверждение неоплаченного заказа сохраняет исходные payment_due/remind_at и срок резерва; новые будущий/истёкший сценарии прошли regression-first. R10 остаётся owner-accepted историческим риском, а не исправленной историей.

Production **NO-GO** сохраняется: завершение этапа 2 не разрешает deploy или этапы3–6. Живые bank/НП/SMS/mail/OAuth и сквозной provider E2E — **DEFERRED → этап6**, а не PASS. Все локальные деньги/заказы/сессии и ответы провайдеров синтетические; production данные, импорты, поставщики и AUTOPRICES не использовались.

R8: default `trusted_proxies=[]` проверяется кодом; только значение хостинга остаётся **BLOCKED(owner)** до ответа хостинга. Прочие OWNER DECISION не изменены. QA-20 исторический риск принят владельцем (**ACCEPTED, nonblocking**); current redaction не исправляет уже опубликованную историю, force/history rewrite не выполнялись. Перед production обязательна отдельная смена `pim_key`/`cron_key` и проверка отказа старым ключам.

CRM dependency `b0e2f9359a05ec835a83d64bb9bcdc2c97487a50` read-only; CRM-SEC-FRESH-01/CRM-PHP-01/CRM-FE-01 остаются на этапе4. PIM: только утверждённый R7/PIMC-P1 на `5fd46cb6fcd32fe628e8ccd0c9ebe4f4c998b055`, exact PIM CI38329162970 SUCCESS на неизменённом PIM SHA; прочие PIM предложения/зависимости не менялись. PIM baseline682 и final684 не взаимозаменяемы. Варианты performance B/C не реализованы; production CWV/p75/capacity и настоящие мобильные устройства не сертифицированы.

Решения R1–R11 дополняют исторический §7 только в явно утверждённом scope. Новая реализация остальных предложений этим checkpoint не разрешается.

<!-- STAGE2B_FINAL_CHECKPOINT_END -->


## Исторические результаты до этапа 2-B


Обновлено 2026-10-11 (сессия 2). Утверждено владельцем; работа в `hardening/site-release-20261011` (от `59b4685`).

## Выполнено

| Этап | Содержание | Состояние |
|---|---|---|
| 0 Стенд | PHP 8.2 + MariaDB 11.4 (как CI) + GNU findutils + Playwright Chromium/WebKit/Firefox; тесты переносимы через env | готово |
| 1 Деньги | D-02 COD, D-03, D-04, D-13, D-25 | FIXED, regression-first |
| 2 Галерея | D-01, D-05, D-17, D-26 | FIXED, regression-first |
| 3 UI | D-06, D-07, D-08 | FIXED; D-09 заблокирован (нет файлов) |
| 3b Кабинет | D-10 + браузерный QA кабинета (3 движка × 4 ширины, IDOR, ТТН) | готово, всё зелёное |
| 5a CI | GitHub Actions `SITE CI` на `fcc73e9`: success | готово |
| 4 P2/P3 | D-14, D-18, D-20, D-21 (v3 + legacy), D-27, D-28 — FIXED regression-first; D-24 NO-DEFECT; D-11 → Q-8; D-22 → Q-9 | готово, кроме решений владельца |
| 5b Browser QA | матрица 3 движка × 12 ширин × 15 страниц (540/540) + покупка до заказа 9/9 (`qa-matrix`), кабинет 12/12 (`qa-cabinet`) → `05-BROWSER_QA_MATRIX.md` | готово |
| 5c Audit | interaction inventory + dead-click, axe WCAG 2.1 AA, Lighthouse (`qa-audit`) → `07-SECURITY_PERFORMANCE_REVIEW.md`; найдено и исправлено D-29…D-33; D-34 → ТЗ главной | готово |

## Осталось (по порядку)

1. ~~CI и тег для ADDENDUM №2~~ — закрыто: тег `rubizh-addendum2-phases2-7-verified` (`bbc989a`, CI success). Теги `rubizh-stage-N-verified` относятся к **глобальным этапам 1–6 проекта** (см. `STAGE_CHECKPOINT.md`), а не к фазам ADDENDUM №2.
2. Q-6 SMS-защита → Q-7 прямая MonoPay при подтверждённом наличии → Q-5 step-up/RBAC/аудит → Q-4 v3 под заказ: каждый — отдельный этап с checkpoint.
3. Решения владельца: Q-8 (`10-KIT_RULES_PROPOSAL.md`), Q-9 (`09-ASSET_INVENTORY.md`), баннеры D-09 (`11-BANNER_PROMPTS.md`), sandbox monobank/НП (RV-4, live-проверки).
4. Повтор gate и `08-RELEASE_READINESS.md` → GO/NO-GO перед любым deploy (deploy — только с отдельного подтверждения).

## ADDENDUM №2 — сверка (Phase 1, 2026-10-11)

Источник: «ECC ADDENDUM №2» владельца. Сверено с кодом на `3326514` (CI success) и реестром 03. Статусы: NEW / EXTEND / DONE / CONFLICT.

| # | Требование | Существующее | Статус | Файлы | Тесты |
|---|---|---|---|---|---|
| A-1 | Hero: одна CTA «Обрати спорядження», крупнее | 2 CTA (`index.html` hero), `.rz-btn` 13px/500 | NEW | `index.html`, новый `ui-addendum.*.css` | addendum-home |
| A-2 | Кнопка «Зібрати комплект» во 2-м блоке заметнее, «Допомогти з вибором» вторична | `.rz-btn-primary` + `.rz-text-link` уже есть | EXTEND | CSS | addendum-home |
| A-3 | Единые Primary/Secondary/Text link, focus, 44×44 | `.rz-btn`, inline-стили, D-34 | EXTEND (+D-34) | CSS | addendum-home, a11y |
| A-4 | Шапка/поиск (D-34: пустой поиск, 2.5.3, 24px) | D-34 OPEN | EXTEND | `index.html`, client | addendum-home |
| K-1 | Onboarding «ЗБЕРИ СВІЙ КОМПЛЕКТ ЗА 4 КРОКИ», «Почати збір»/«Пропустити», «Як це працює?», localStorage с версией, Esc, focus trap, без scroll lock | нет | NEW | `index.html`, client | addendum-kit |
| K-2 | Параметры = предпочтения; обувь «Оберіть розмір» вместо «—»; изменение не меняет добавленный SKU молча | «Мої параметри», шаг 01; поведение при смене — проверить | EXTEND | client | addendum-kit |
| K-3 | Статус слота «Не обрано» / «Обрано: N товар» / «Необов'язково» | «Додано ✓» / «Необов’язково» | EXTEND | client | addendum-kit |
| K-4 | Карточки выбора: фото, имя, цена, размер/цвет, наличие, disabled | модальный picker с размерами/цветом/примечаниями | DONE (проверить disabled) | — | kit-* существующие |
| K-5 | Summary: «Вартість товарів / Знижка на комплект / Разом», без зачёркивания при 0 | «Разом окремо» (зачёркнуто только при экономии) / «Ціна комплектом» | EXTEND (подписи, строка скидки) | `index.html`, client | addendum-kit |
| K-6 | CTA «ДОДАТИ КОМПЛЕКТ ДО КОШИКА»; пустой — «Спочатку додайте хоча б один товар» | `kitToCart`, `kitCantLabel` «Додайте щонайменше N позиції» | EXTEND (тексты; правило ≥N не меняем — Q-8) | client | addendum-kit |
| K-7 | Проверки при добавлении в корзину, список проблем, не удалять доступное | `needsSize`, `isOut`+«Замінити», `kitPriceUpd` | DONE/проверить | — | существующие + addendum-kit |
| K-8 | Черновик между сессиями, перепроверка на сервере | «Ми зберегли вашу збірку», цены перечитываются | DONE | — | существующие |
| K-9 | Mobile sticky summary-бар не перекрывает safe area | `data-kit-bar` с `env(safe-area-inset-bottom)` | DONE/проверить 360 | — | browser QA |
| K-10 | «Потрібна допомога з вибором?» → реальный сценарий | `goPicker` (подбор за 6 вопросов) + менеджер | EXTEND (заметная вторичная ссылка) | `index.html` | addendum-kit |
| K-11 | Не менять SKU/цены/скидки/корзину/заказ | frozen | DONE (ограничение) | — | весь suite |
| C-1 | Навигация каталога, «Каталог → Категорія → Підкатегорія» на mobile | D-08 карусель, хлебные крошки, D-28 | EXTEND (аудит переходов) | — | addendum-catalog |
| C-2 | Карточки: единые пропорции, цена диапазоном | 4:5, D-21 | DONE/проверить диапазон | — | addendum-catalog |
| C-3 | Фильтры совместно, reset, сортировка/пагинация не теряют выбор, мобильные «Фільтри/Показати/Скинути», без scroll lock | фильтры есть | EXTEND (аудит + исправления) | client | addendum-catalog |
| C-4 | Поиск: кириллица/латиница/пробелы/пусто/длинный/нет результатов с полезным сообщением | `noResults` | EXTEND | client | addendum-catalog |
| C-5 | Одна товарная модель для каталога/конструктора/корзины | общие `Z`, `storeV3Map` | DONE | — | — |
| P-1 | Кабинет: «Огляд» (активный заказ + одна CTA, пустое состояние) | вкладка overview отключена (redirect → orders) | EXTEND | `auth/account-view.php`, `index.php` | addendum-account |
| P-2 | История: карточки, 1–3 превью, пагинация | есть (20/стр., превью, Активні/Історія) | DONE (+ кол-во товаров, сумма — проверить) | — | qa-cabinet |
| P-3 | Страница заказа: товары, оплата, доставка, история | есть (timeline, товары, ТТН) | EXTEND (раздельные статусы заказ/оплата/доставка) | `order-detail.php` | addendum-account |
| P-4 | Несколько отправлений «Посилка 1 із 2» | схема поддерживает N shipments (`rubizh_order_shipments`) | EXTEND (подписи; без миграций) | `order-detail.php` | addendum-account |
| P-5 | Человеческие статусы, без `awaiting_webhook` | `shopCustomerStatus`, `customerPayment` | DONE/проверить маппинг | — | addendum-account |
| P-6 | Повторить заказ с перерасчётом | `shop/repeat-order.php` + `storeRepeatOrder` (владелец, текущие цены/варианты, список недоступных) | DONE; EXTEND: не дублировать строки корзины, ссылка на товар для недоступных | client | addendum-account |
| P-7 | Обране | `tab=favorites` | DONE (проверить актуальные цены, удаление, слияние гостя) | — | addendum-account |
| P-8 | Мої дані без обхода SMS | телефон readonly после подтверждения | DONE | — | существующие |
| P-9 | Поддержка с номером заказа | mailto с темой «Замовлення №» | DONE | — | — |
| S-1 | Footer «Ми в соцмережах», Instagram/TikTok из настроек (`instagram_url`, `tiktok_url`), валидация https+host, скрытие пустых | нет | NEW | `shop/settings-lib.php`, `settings.php`, `index.html`, client | addendum-social |
| Q-4 | v3 «під замовлення»: заказ → подтверждение менеджера → повторная проверка SKU/цены → счёт → оплата; PIM только читается | — | **DONE** `f69bb0d` (CI 38159041894 success) | `order-validation.php`, `customer-ui.php` | q4-v3-preorder |
| Q-5 | RBAC на сервере, step-up ≤ 15 мин для возврата/сверки/переопределения цены, версия заказа (409), аудит, CSRF; CRM не менялся | — | **DONE** `c90192d` (CI 38158149167 success) + ревью-правки `17f9c67` | `financial-permissions.php`, `financial-actions.php`, `settings.php` | q5-manager-rbac, p0-integration |
| Q-6 | SMS: лимит на адрес, бюджет неверных кодов (номер, адрес), резерв 30% для клиентов, проверка при подозрительной активности, email-резерв | — | **DONE** `8afd937` (CI 38156005947 success) + `17f9c67` (один текст отказа, ≤ 20 бит) | `auth/phone.php`, `login.js` | sms-protection |
| Q-7 | Legacy: подтверждённый числовой остаток → сразу MonoPay (серверная цена, резерв); неизвестный остаток/ФОП/смешанный → менеджер; контракт webhook | — | **DONE** `d7554bf` (CI 38157095357 success) | `pim-v3-checkout.php` | q7-payment-readiness, mono-webhook-contract |
| Q-8 | Правила комплекта: исследование + предложение, расчёты не менять | D-11 | NEW (документ) | — | — |
| Q-9 | Инвентаризация assets, удаление отдельным этапом | D-22 | NEW (документ) | — | — |
| B-1 | Баннеры из Drive для категорий без баннера; перечень + промпты, без генерации | D-09/D-23 | EXTEND | — | — |

Порядок ADDENDUM №2 (выполнен): Phase 2 (A-1…A-4) → Phase 7 (S-1) → Phase 3 (K-1) → Phase 4 (K-2…K-10) → Phase 5 (C-*) → Phase 6 (P-*) → Q-6 → Q-7 → Q-5 → Q-4 → Q-8/Q-9 (документы) → B-1 → Phase 8 (регрессия, browser QA, документы) → финальный `/ecc:code-review` → `08-RELEASE_READINESS.md`.

## VERIFIED CHECKPOINT после каждого этапа (требование владельца 2026-10-11)

**Исправлено 2026-10-11 (указание владельца):** прежняя запись «этапы 1–6 = фазы 2–7 ADDENDUM №2» была неверной и владельцем не подтверждалась. Фазы 2–7 ADDENDUM №2 закрыты отдельным checkpoint с тегом `rubizh-addendum2-phases2-7-verified`. **Глобальные этапы проекта:** 1 — завершение SITE (hardening, Q-4…Q-7, Quality Gate); 2 — независимый multi-agent аудит SITE + PIM; 3 — стабильный release candidate; 4 — завершение CRM; 5 — импорт пяти поставщиков; 6 — финальный E2E всей системы. Тег `rubizh-stage-N-verified` = завершение глобального этапа N.

**Definition of Done этапа** — все пункты выполнены на одном и том же HEAD:
1. Полный `npm test` (известные macOS-ограничения окружения перечислены и совпадают с исходным `59b4685`).
2. Полная Browser QA Matrix (`qa-matrix`, `qa-cabinet`, `qa-addendum`) + снимки изменённых экранов.
3. SITE ↔ PIM ↔ CRM в пределах изменений (pim-v3-*, crm-*, release-hardening).
4. Security, SEO, accessibility, performance (`qa-audit`: axe, Lighthouse; seo/a11y тесты).
5. CI GitHub для **точного SHA** (требует push — только с разрешения владельца).
6. Независимый ECC code review (агент `ecc:code-reviewer`) и исправление находок.
7. Нет открытых P0 и блокирующих P1.

**Checkpoint:** обновить 03/05/08 → `STAGE_CHECKPOINT.md` (SHA SITE и PIM, дата, результаты, восстановление) → отдельный commit → annotated tag `rubizh-stage-N-verified` (только если пункты 1–7 зелёные) → чистое дерево. Push коммитов и тегов — только с явного разрешения. Если чего-то нет (например, CI без push) — статус **INCOMPLETE**, без тега `verified`, обычный commit и перечень недостающего. Изменение кода после checkpoint отменяет его подтверждение для нового HEAD.

## Глобальный этап 1 (SITE) — 2026-10-11

Порядок выполнен: Q-6 → Q-7 → Q-5 → Q-4 → несколько посылок (анализ) → Quality Gate → checkpoint. Живые внешние проверки (HTTPS webhook, оплата тестовой картой, реальная SMS, тестовая ТТН, В-1…В-4) — **DEFERRED → этап 6**. Реальные API на этапе 1 не вызывались: всё через mock и контрактные тесты. Итоги — `08-RELEASE_READINESS.md`, `STAGE_CHECKPOINT.md`.

### Задачи следующих этапов, возникшие на этапе 1

| ID | Этап | Задача | Основание |
|---|---|---|---|
| CRM-4.1 | 4 (CRM) | Показ менеджеру спорных событий MonoPay: `mono_event_rejected` + результат pull-сверки `mono_parked_reconcile` (статус банка, сумма, валюта, локальный статус), фильтр «требует звірки». CRM на этапе 1 не менялся | RV-14 |
| CRM-4.2 | 4 (CRM) | Сделать версию заказа обязательной в CRM-возврате: `crmRefund(...,$version)` проверяет её под блокировкой заказа (`staff/refunds.php:13`), но параметр необязателен. SITE `financial-actions.php` уже требует версию с этапа 1 | RV-11 |
| PERF-2.1 | 2 (аудит) | ~200 КБ JS рисуют первый экран: серверный рендер первого экрана или разделение/минификация `shop-client` (474 КБ); адаптивные варианты изображений категорий/`kit-photo` | PERF-1 |

## Не входит без отдельного разрешения
Production deploy, production migrations, включение v3, PIM-патчи, реальные платежи/invoice, реальные ТТН, reset/импорт каталога, изменения CRM, merge в main.

## Глобальный этап 2 — план checkpoint, 2026-10-12 UTC (checkpoint)

Рабочая ветка: `hardening/stage-2-audit-fixes`; исходный аудит SITE `51c83d8`, итоговый код `e9ce24dffb41751b8e08b13b4dff5a5c6056d203`. История этапа 1 выше сохраняется. PIM и отдельный CRM-репозиторий остаются read-only; миграции и live-операции в этот план выполнения не входят.

| Шаг | Фактическое состояние | Что ещё требуется |
|---|---|---|
| Независимый аудит направлений | Отчёты и частные доказательства собраны; воспроизводимые сценарии отделены от статических предположений | 127 строк/36 FIXED; confidence/disposition в03; unresolved HIGH details private |
| Разрешённые SITE-коррекции | Q-8 K1–K6, контрактная валидация, сохранение оплаченного snapshot, синхронизация диагностики/версий, доставка, UI/a11y, SEO, локальная readiness и installer gates реализованы | Поздние коррекции зафиксированы и scoped review approved; fresh whole SECURITY source review completed with explicit limits |
| Повтор проверки кода | Baseline 351/351; первый полный SITE 435/435; неизменённый PIM 682/682; все без skipped | Полный прогон точного итогового кода: `450/450 PASS;0FAIL/SKIP/CANCELLED;626167ms, tested1fcca317, identical app/tests in e9ce24d` |
| Browser matrix | Финальный повтор315/315+21/21, ADDENDUM210/210, cabinet21/21;3движка×7ширин | Final app tree verified; no production/provider certification |
| Независимое финальное ревью | Отдельные платежные, changes и security-проверки выполнены; выявлены поздние пункты | **COMPLETED source review**; dynamic/runtime limits remain explicit |
| CI и checkpoint | Exact schedulinge9 CI PHP8.2/8.3 SUCCESS; final doc-only checkpoint separately | `e9ce24dffb41751b8e08b13b4dff5a5c6056d203`, `[38307425169](https://github.com/lieverifying/rubizh/actions/runs/38307425169) SUCCESS on e9ce24d, PHP8.2/8.3; exact final doc-only checkpoint CI checked after push`; затем документы и статус без преждевременного verified-тега |

Проверки после `56acdcb` включают дополнительные денежные границы, сохранение количества и N комплектов при восстановлении корзины, а также доказанный источник email для прав сотрудника. Детали неразрешённых HIGH остаются частными; перечень для публикации — только ID/severity. Зелёный локальный набор не закрывает отдельную внешнюю находку или решение владельца.

## Этап 2, §7 — предложения, требующие решения владельца

Это предложения для следующих отдельных работ; таблица не разрешает их реализацию, не меняет деньги/остатки автоматически и не раскрывает подробности неразрешённых HIGH. До решения сохраняется текущая архитектура.

| Предложение | Варианты и ожидаемый результат | Риск, проверка и граница |
|---|---|---|
| Первый экран и delivery UI | **A:** сохранить runtime, уменьшить/сжать assets, убрать повтор CSS, облегчить home boot; **B:** видимые серверные header/hero и первый экран товара/каталога с постепенным подключением взаимодействий; **C:** предварительная компиляция либо более широкая миграция UI. Рекомендация аудита: B после измеримых небольших шагов A | A: небольшой–средний объём, cascade/визуальная проверка; B: средний–большой, явное владение DOM/DTO; C: большой риск навигации/checkout/SEO. Сравнить cold/warm FCP/LCP/long tasks, JS off/failed, stock/money/schema и снимки. Решение пока не принято |
| Холодный каталог и индексы | Отдельные измерения compact home dataset, отложенных facets и материализованных category/size/buyability-проекций | Репрезентативная синтетическая кардинальность и EXPLAIN до выбора; не переносить loopback-тайминги на production и не вводить миграции без отдельного разрешения |
| CGNAT, IPv6 и лимиты | Разделить политику для общего адреса, сессии и подтверждённого actor; определить нормализацию IPv6, справедливость очереди и поведение заполненных корзин лимита | Сначала нагрузочные/негативные сценарии общего IP и доступности входа; не ослаблять защиту и не доверять forwarded headers без политики proxy |
| Резервы и источник остатка | Утвердить смысл HELD/COMMITTED/RELEASED, срок, восстановление после неопределённости, позднюю оплату и сверку с текущими остатками | Матрица заказ/счёт/доставка/резерв, last-unit concurrency и исторические заказы. Решение источника данных отдельно; никаких удалений UNKNOWN/OUT_OF_STOCK |
| Неизвестная платёжная операция и HTTP 503 | Сохранить отказ без движения денег; рассмотреть ограниченный, дедуплицированный аудит и наблюдаемость неизвестных/повторных событий | Политика ретраев и реальное поведение провайдера ещё не подтверждены; без PII/секретов в журнале и без автоматического подтверждения неизвестной операции |
| Настройки и доступ сотрудника | Утвердить actor/роль, срок step-up, подтверждённый источник email, действия при истечении сессии и понятный путь повторного входа | Серверная проверка прав остаётся обязательной; сверить UI/API с финансовыми тестами. Нельзя выводить право сотрудника из неподтверждённой строки email |
| Browser matrix | Сохранить матрицу 3 движка × 7 ширин, добавить целевые сценарии поздних изменений и отдельно реальные мобильные устройства | Ожидаемые HTTP 404 отличать от pageerror; сохранять снимки и SHA. Эмуляция viewport не означает проверку настоящих iOS/Android |
| CRM: UNKNOWN, парковка и reconciliation | На этапе 4 спроектировать менеджерское представление неопределённости, спорных/parked событий, ручной сверки и безопасных retry с обязательной версией заказа | CRM в этом этапе не меняется. Не превращать отображение/кнопку в автоматическое движение денег, создание SKU или подтверждение наличия |
| Единые проекции состояния и DTO | Рассмотреть общие проекции клиентского/менеджерского статуса, цены, наличия и структурированных данных вместо расходящихся локальных расчётов | Сначала контрактные тесты и примеры состояний; широкое архитектурное объединение вне текущих точечных коррекций |
| Q-9: inventory assets и баннеры | Сверить реальные ссылки, release artifact и файлы отката; обновить документ инвентаризации и отдельный перечень недостающих баннеров | **Без удаления и генерации.** Удаление — отдельное решение с планом отката; баннеры требуют утверждённых файлов |
| Live E2E глобального этапа 6 | Отдельно согласовать sandbox/live webhook, оплату, SMS/email, НП/ТТН, scheduler и восстановление на целевом хостинге | **DEFERRED**, не PASS. Нужны конкретный разрешённый режим, безопасные данные и provider/hosting-конфигурация; текущие mock-прогоны не заменяют live-доказательства |

Текущий doc-only checkpoint фиксирует завершённые коррекции, проверки и незавершённые gate честно. Fresh whole SECURITY source pass завершён; dynamic endpoint evidence и его coverage limits приведены в итоговом отчёте. При остающихся внешних HIGH, решениях владельца или незавершённом review статус остаётся **INCOMPLETE / production NO-GO**; этапы 3–6 не объявляются выполненными.

QA-20: historical raw privacy не обеспечивается current redaction в public repo. No force/history rewrite performed; separate owner decision required.

Final endpoint Quality Gate:132inventory rows,1920HTTP requests;831/831explicit expectations,2697/2697overlapping semantic checks,975snapshots+2A↔B whole-domain comparisons;0final assertion failures. ANY232/232 and narrowaction36/36; all inventory endpoints requested, full state/role/token combinations remainPARTIAL. Details and limits:stage-2/endpoint-quality-gate.md. Fresh SECURITY source review COMPLETED(15checks+1probe), no newHIGH/CRITICAL; MEDIUM SEC-FRESH-01 unapplied CRM proposal. OverallNO-GO: exhaustive dynamic certification and historical privacy requirement unmet, noStage2verifiedtag/Stage3.

## Глобальный этап 3 — стабильный RC1 (2026-10-14, EXTEND)

Порядок владельца: синхронизация → PRE_LAUNCH_BLOCKERS → 4.1–4.11 → Quality Gate → checkpoint (`rubizh-stage-3-verified` + `rubizh-rc1` на одном SHA). Новой функциональности нет; изменения кода — только при дефекте, найденном проверкой этапа (regression-first + независимое ревью). Агенты ECC — по разрешению владельца на весь этап, по необходимости.

| Пункт | Исполнитель / агент ECC | Результат |
|---|---|---|
| 1 Синхронизация | координатор | SITE `2a338da` → `6311e40` (ff), теги stage-1/2 сверены; PIM `fix/pimc-p1` = `5fd46cb`; CRM `b0e2f93` клонирован read-only |
| 2 PRE_LAUNCH_BLOCKERS | координатор | `docs/release/PRE_LAUNCH_BLOCKERS.md` (PL-1…PL-4) |
| 4.1 Манифест | координатор | `docs/release/RC1_MANIFEST.md` |
| 4.2 Контракты | `ecc:architect` (черновик), координатор (сверка) | `docs/release/CONTRACTS.md` |
| 4.3 Конфигурация | `ecc:doc-updater` (черновик), `ecc:security-reviewer` (проверка), координатор | `docs/release/CONFIG.md` |
| 4.4 Обновление/откат | координатор; ревью `ecc:code-reviewer` | `tests/rc1-upgrade-rollback.test.mjs` (`24e27c4`), 3 production-кандидата |
| 4.5 Пакет | координатор; ревью `ecc:code-reviewer`, `ecc:security-reviewer` | дефект RC3-01 → `847d4c0`; пакет `7a63d9eb…` воспроизводим; Apache-проба |
| 4.6 Go-live | координатор | `docs/release/GO_LIVE_CHECKLIST.md` |
| 4.7 Бэкапы | координатор | процедура в чек-листе; production-бэкап не передавался → PL-4.1 |
| 4.8 Known issues | координатор | `docs/release/KNOWN_ISSUES.md` |
| 4.9 Changelog | координатор | `docs/release/CHANGELOG_RC1.md` |
| 4.10 Main | координатор | автодеплоя из `main` нет (workflow только CI, GitHub environments/deployments/hooks пусты) → PR `release/rc1 → main` без merge |
| 4.11 Документы | координатор | `docs/README.md`, SESSION_HANDOFF, STAGE_CHECKPOINT, 08 |
| Quality Gate | координатор; замеры `qa-matrix`/`qa-audit` | `STAGE_CHECKPOINT.md`, этап 3 |

Не запускались (не потребовались): `ecc:php-reviewer`/`ecc:typescript-reviewer` (PHP/JS приложения не менялись), `ecc:silent-failure-hunter` (скрипты миграций и отката проверены реальным прогоном и security-ревью), `ecc:e2e-runner`, `ecc:a11y-architect`, `ecc:seo-specialist`, `ecc:performance-optimizer` (замеры выполнены штатными инструментами `tests/.staging/qa-*`).

## Глобальный этап 4 — CRM (2026-10-15, EXTEND)

Поручение владельца: «Глобальный этап 4 — CRM РУБІЖ (готовый к подключению продукт)» + блок 4-SITE (D-50…D-54). Ветки `hardening/stage-4-crm` в SITE и `crm.rubizh`; PIM `fix/pimc-p1@5fd46cb` — только чтение.

| Фаза | Результат | Документ / тест |
|---|---|---|
| 0 gap-анализ | разделы CRM, пробелы, решения OD-4.1…OD-4.7 | `docs/crm/00`, `01` |
| 1 документы | архитектура, карта состояний, RBAC и API из контракта | `docs/crm/01–05`, `contracts/crm/crm-api.json` |
| 2–4 SITE + Staff API | 5 ролей, сессии, TOTP, повторный вход, функции SITE для каждого действия CRM, адаптеры live/mock/off, cron | `crm-stage4-rbac` (616 проверок), `crm-stage4-api`, `crm-stage4-contract` |
| 5 фронтенд | `crm.rubizh` на контракте и токенах макета, мобильные карточки, CSP без `unsafe-inline` | `crm-browser`, `crm-stage4-matrix` |
| 4-SITE | D-50…D-54 + A5 | `crm-stage4-site` |
| 6 тесты | 12 E2E, синтетика ≥500 заказов во всех состояниях, 50 000 заказов ≤0,5 с, матрица 3 движка × 7 ширин × 2 темы, axe 0, клавиатура, обновление поверх RC1 и трёх кандидатов | `crm-stage4-e2e`, `crm-stage4-synthetic`, `crm-stage4-matrix`, `rc1-upgrade-rollback` |
| 7 независимое ревью | `ecc:code-reviewer` + `ecc:security-reviewer` без общего контекста; находки R4-01…R4-15 | `crm-stage4-review`, `03-DEFECT_REGISTER` |
| 8 Quality Gate | полная регрессия, grep сборки (§12), gitleaks, npm audit, CI на точных SHA, чек-лист CRM | `08-RELEASE_READINESS`, `STAGE_CHECKPOINT` |

Не входит (запрещено поручением): production, деплой, production-миграции, live-флаги, реальные платежи/ТТН/SMS/почта, изменения PIM, PL-1/PL-2.
