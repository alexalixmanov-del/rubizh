# 02 — FULL AUDIT (фаза A, статический аудит)

> Актуальный checkpoint этапа2-B приведён первым. Предыдущие результаты ниже сохранены как история; решения владельца меняются только в утверждённом R1–R11 scope.

<!-- STAGE2B_FINAL_CHECKPOINT_BEGIN -->

Все кодовые gates завершены. Решение **GO этапа 2** вступает в силу после SUCCESS CI самого doc-only checkpoint на его точном SHA; окончательные SHA/CI и опубликованный тег подтверждаются внешней metadata и итоговым ответом.

Код приложения f2264c6 и177efa9 идентичен: проверены SHA256 всех517 tracked regular files вне docs/tests; между ними добавлен только файл трёх регрессионных тестов R9. Поэтому browser/R9/Lighthouse сохраняют фактический runtime SHA f2264c6, а полный SITE/CI —177efa9; исходные SHA не переименованы.

## Этап 2-B — итоговый checkpoint 2026-10-14

Статус этапа 2-B: **GO_STAGE2_ONLY**. Код: `177efa9f5dea4e5ba1b0f16781ba41db582f86ad`; ветка `hardening/stage-2-audit-fixes`. Эти результаты относятся только к указанному финальному коду; прежние разделы сохраняют исторический статус и не заменяют новые gates.

Предварительный CI38415388496 на ebc5e83 завершился FAILED: PHP8.2/8.3, 488/487/1. Причина — реальный native-form `Origin:null` при `Referrer-Policy:no-referrer`, а не SMS fixture. Проверенное исправление2e78b98 сохраняет CSRF и допускает opaque origin только при `same-origin/navigate/document`; historical exact code CI38459393928 SUCCESS не заменяет CI окончательного SHA. Дополнительный R5 follow-up bcb3c2f прошёл независимое review и регрессии исходного срока оплаты; финальные gates приведены в таблице. Детали неразрешённых HIGH не публикуются.

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

Новые неразрешённые HIGH допускаются публично только как ID/severity; реестр: No confirmed unresolved HIGH/CRITICAL afterapprovedR1–R11scope; otherOWNER decisions preserved; onlyhostingtrusted_proxies valueBLOCKED(owner). Полные воспроизведения, персональные данные и сырые доказательства остаются private.

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


Метод: чтение кода SITE @59b4685 и PIM @2119846, четыре параллельных read-only аудита (ECC `code-explorer`, `php-reviewer`, `security-reviewer`, `Explore`) с повторной проверкой ключевых утверждений по коду. **Ничего не запускалось в браузере и не тестировалось на БД** (блокер B-1). Находки — в 03-DEFECT_REGISTER.

| Раздел ТЗ | Статус | Итог |
|---|---|---|
| §4 Архитектура | проверено по коду | 01-SOURCE_OF_TRUTH |
| §5 Галерея цвета | root cause найден | D-01, D-05, D-17 |
| §6 Recently viewed | root cause найден | D-06, D-07 |
| §7 Мобильная карусель категорий | root cause найден | D-08 |
| §8 Баннеры | Drive доступен публично (49 PNG, всё уже сопоставлено 08.10) | D-09, D-23 |
| §9 Карточка товара | частично (галерея, выбор размера v3/legacy) | остальное — этап 5 |
| §10 Каталог/поиск/фильтры | **не проверено** | этап 5 |
| §11 Корзина | серверная часть проверена: цена, сумма и количество не доверяются клиенту | без дефектов P0/P1 |
| §12 Checkout | серверная часть проверена; идемпотентность по `request_id` | D-02, D-18 |
| §13 MonoPay | проверено по коду; live не проверялся и не будет без разрешения | D-03, D-04, D-12, D-13, D-19, D-20 |
| §14 NP/ТТН | создание ТТН защищено от дублей; склады в `npOrigins()` | D-10; refs складов — runtime config, не проверено |
| §15 Кабинет | IDOR не найден (`customerOrder` по `customer_id`, `shopMayReadOrder`) | D-10, D-15 |
| §16 Статусы | матрица в 01 | противоречивые состояния: D-03, D-04, D-12, D-19 |
| §17 PIM v3 | контракт совпадает; расхождения латентные | D-14, D-21, PIM-1, PIM-2 |
| §18–20 UI, responsive, браузер | **не проверено** | этап 5 |
| §21 Security | сессии, CSRF, SQL, XSS, SSRF, path traversal, секреты — без критичных находок | D-15, D-16, D-24 |
| §22 Performance | **не измерено** | этап 5 (baseline до правок) |
| §23 SEO | `storefront.php`: canonical, noindex при фильтрах, JSON-LD Product/Offer | остальное — этап 5 |
| §24 Стабильность | `health.php` отдаёт только `{ready}`; 503 + Retry-After при ошибке каталога | этап 5 |
| §25 Тесты/CI | 45 файлов `tests/*.test.mjs`, CI зелёный | локальный baseline — B-1 |

## Ограничения
- Production не проверялся: ни smoke, ни бэкапы (`site-before-final-20261010-225434.sql.gz`, PIM JSON) — нет доступа к хосту из этой сессии.
- Утверждения о поведении monobank (D-13) — предположения до сверки с документацией.

## Глобальный этап 2 — дополнение 2026-10-12 UTC (checkpoint)

Этот раздел дополняет исторический аудит этапа 1. Независимые направления сначала читали закреплённый SITE `51c83d808228a26328081b02211b4e3605353755`, PIM `21198461f8ebb2eadef6dcd6fb77a50a8a038ea9` и карту системы; проверки исправлений и финальное ревью относятся к более позднему коду. Итоговый проверяемый код — `e9ce24dffb41751b8e08b13b4dff5a5c6056d203`; doc-only checkpoint не меняет application/test tree. Общий статус этапа NO-GO, без verified tag.

Стенд: Linux, PHP 8.4, MariaDB, Playwright Chromium/WebKit/Firefox; синтетические данные, отдельные fixture-схемы, локальные mock-транспорты. Production PHP 8.2, реальные провайдеры, данные покупателей и устройства iOS/Android этим стендом не проверены. PIM и отдельный репозиторий CRM только читались; их код не менялся. Полные доказательства и подробности неразрешённых HIGH хранятся вне репозитория.

| Направление | Что установлено на этапе 2 | Граница вывода |
|---|---|---|
| Архитектура, PHP, БД | Проверены точки входа, статусы, подтверждение сохранённого оплаченного заказа, блокировки и резервирование | Не все статические предположения воспроизведены; общая политика резервов и источника остатков требует решения |
| Платежи и security | Выполнены независимые синтетические проверки подписи, порядка событий, конкуренции, версий и прав; после основного исправления найдены дополнительные пункты | Финальное независимое security-ревью **INCOMPLETE**; успешные тесты не заменяют его заключение |
| Доставка | Проверен локальный отказ справочника и продолжение оформления с ручным адресом; непроверенный адрес не становится подтверждённым | Реальная НП, ТТН и политика нескольких отправлений не подтверждены |
| SITE ↔ PIM | Проверены контракт, исходные SKU, валютная граница и элементы галереи модели; SITE-валидация уточнена | PIM-предложения не применены; данные UNKNOWN/OUT_OF_STOCK не удалялись |
| Q-8 | Правила K1–K6 реализованы в SITE; отдельное ревью обнаружило позднюю проблему восстановления корзины | Коррекция qty/N/retail mode e7de3ea зафиксирована и независимо проверена; размещённые заказы не пересчитываются |
| Frontend, accessibility | Украинская ошибка сети, клавиатурные границы диалогов, восстановление фокуса, семантика мобильных фильтров, выбранный размер, контраст фокуса | Локальная проверка не является сертификатом WCAG или проверкой всех assistive technologies |
| SEO | Проверены единое описание, полный Product/Offer, соответствие SKU/цены/остатка, robots/breadcrumbs при SPA-переходах и canonical пагинации | Живая индексация и rich results не проверялись |
| Performance | Подтверждены зависимость первого экрана от runtime, тяжёлые холодные запросы и дубли владения CSS | Архитектура не менялась; production p75, CDN/сжатие и фактическая ёмкость неизвестны |
| Release / ops | Проверены отказы installer по артефакту/схеме, HTTP smoke и синтетическое восстановление БД/исходников | Исторический артефакт намеренно отвергается; нового production-релиза и восстановления production не было |

### Проверенная база доказательств

| Проверка | Результат | Привязка |
|---|---|---|
| Linux baseline SITE | **351/351 pass; 0 fail, 0 skipped** | Закреплённый исходный код; `baseline-compatible.tap` вне репозитория |
| Первый полный прогон исправлений SITE | **435/435 pass; 0 fail, 0 skipped** | `final-regression.tap`; до поздних коррекций и финального checkpoint |
| PIM, без изменений | **682/682 pass; 0 fail, 0 skipped** | `pim-tests.log`; не означает применения предложений |
| Полная browser matrix | **315 загрузок + 21 поток покупки** | Повтор на final application tree; 3 движка × 360/390/430/768/1024/1280/1440 |

В matrix нет JS pageerror, горизонтального overflow и битых синтетических изображений; сообщения console о предусмотренном HTTP 404 на `product-404` сохранены отдельно, а не объявлены JavaScript-сбоями. Финальный повтор после поздних app-изменений завершён:315/315+21/21, ADDENDUM210/210, cabinet21/21; позднейшие QA-only commits app bytes не меняли.

### Состояние checkpoint

**INCOMPLETE; production NO-GO.** Неразрешённые HIGH публикуются только как ID и severity в итоговом реестре; эта оценка не превращает неподтверждённое предположение в production-факт. Остаются решения владельца и оставшиеся dynamic coverage/privacy условия; exact code CI success, doc-only checkpoint CI проверяется после push. Текущие исправления и checkpointи не дают права на merge, deploy, миграции, активацию провайдеров, изменение PIM/CRM или удаление assets.

Итоговая привязка: `e9ce24dffb41751b8e08b13b4dff5a5c6056d203`, `450/450 PASS;0FAIL/SKIP/CANCELLED;626167ms, tested1fcca317, identical app/tests in e9ce24d`, `Scoped payment/changes/QA review approved; fresh whole SECURITY source review COMPLETED;15 selected checks+1 bounded probe`, `[38307425169](https://github.com/lieverifying/rubizh/actions/runs/38307425169) SUCCESS on e9ce24d, PHP8.2/8.3; exact final doc-only checkpoint CI checked after push`. Живой сквозной E2E сохраняет статус **DEFERRED → глобальный этап 6**, а не PASS.


**Ограничение приватности:** GitHub repository visibility проверено как public. Унаследованный commit2a338da содержит исходные HIGH raw; обычный push сохранил эти версии в истории. Текущие документы редактированы, новые полные доказательства остаются local/private, но обещать приватность исторических raw нельзя. История не переписывалась: force-push запрещён владельцем. QA-20 MEDIUM / OWNER DECISION фиксирует процессный дефект; cleanup требует отдельного решения и не отменяет уже случившуюся публикацию. Технические подробности неразрешённых HIGH здесь не повторяются.

Final endpoint Quality Gate:132inventory rows,1920HTTP requests;831/831explicit expectations,2697/2697overlapping semantic checks,975snapshots+2A↔B whole-domain comparisons;0final assertion failures. ANY232/232 and narrowaction36/36; all inventory endpoints requested, full state/role/token combinations remainPARTIAL. Details and limits:stage-2/endpoint-quality-gate.md. Fresh SECURITY source review COMPLETED(15checks+1probe), no newHIGH/CRITICAL; MEDIUM SEC-FRESH-01 unapplied CRM proposal. OverallNO-GO: exhaustive dynamic certification and historical privacy requirement unmet, noStage2verifiedtag/Stage3.
