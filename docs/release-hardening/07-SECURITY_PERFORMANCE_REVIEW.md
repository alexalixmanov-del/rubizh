# 07 — SECURITY, PERFORMANCE, SEO, ACCESSIBILITY REVIEW

> Актуальный checkpoint этапа2-B приведён первым. Предыдущие результаты ниже сохранены как история; решения владельца меняются только в утверждённом R1–R11 scope.

<!-- STAGE2B_FINAL_CHECKPOINT_BEGIN -->

Все кодовые gates завершены. Решение **GO этапа 2** вступает в силу после SUCCESS CI самого doc-only checkpoint на его точном SHA; окончательные SHA/CI и опубликованный тег подтверждаются внешней metadata и итоговым ответом.

Код приложения f2264c6 и177efa9 идентичен: проверены SHA256 всех517 tracked regular files вне docs/tests; между ними добавлен только файл трёх регрессионных тестов R9. Поэтому browser/R9/Lighthouse сохраняют фактический runtime SHA f2264c6, а полный SITE/CI —177efa9; исходные SHA не переименованы.

## Этап 2-B — итоговый checkpoint 2026-10-14

Статус этапа 2-B: **GO_STAGE2_ONLY**. Код: `177efa9f5dea4e5ba1b0f16781ba41db582f86ad`; ветка `hardening/stage-2-audit-fixes`. Эти результаты относятся только к указанному финальному коду; прежние разделы сохраняют исторический статус и не заменяют новые gates.

Предварительный CI38415388496 на ebc5e83 завершился FAILED: PHP8.2/8.3, 488/487/1. Причина — реальный native-form `Origin:null` при `Referrer-Policy:no-referrer`, а не SMS fixture. Проверенное исправление2e78b98 сохраняет CSRF и допускает opaque origin только при `same-origin/navigate/document`; historical exact code CI38459393928 SUCCESS не заменяет CI окончательного SHA. Дополнительный R5 follow-up bcb3c2f прошёл независимое review и регрессии исходного срока оплаты; финальные gates приведены в таблице. Детали неразрешённых HIGH не публикуются.

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

Финальный code CI: [38595759822](https://github.com/lieverifying/rubizh/actions/runs/38595759822), статус **SUCCESS** на точном `177efa9f5dea4e5ba1b0f16781ba41db582f86ad`. Независимое финальное review: root code-gate validation; r9_resume_review final runtime; independent PAYMENTS/SECURITY/R1–R11 reviews; final_checkpoint_review raw32LH metrics; final document approval retained separately. Verified tag: `rubizh-stage-2-verified`; создание и публикация подтверждаются внешней metadata, не планом. Создание локального annotated tag и его обычный push разрешены владельцем в этапе2-B; выполняются только после SUCCESS CI точного doc-only checkpoint. Старые запреты на push ниже относятся к историческим этапам и не отменяют это разрешение. Собственный SHA doc-only checkpoint и его exact CI нельзя встроить в тот же commit: окончательные checkpoint SHA/CI/tag target фиксируются в независимой retained metadata и final response. Пока этих подтверждений нет, их успешность не заявляется этим документом.

Production **NO-GO** сохраняется: завершение этапа 2 не разрешает deploy или этапы3–6. Живые bank/НП/SMS/mail/OAuth и сквозной provider E2E — **DEFERRED → этап6**, а не PASS. Все локальные деньги/заказы/сессии и ответы провайдеров синтетические; production данные, импорты, поставщики и AUTOPRICES не использовались.

R8: default `trusted_proxies=[]` проверяется кодом; только значение хостинга остаётся **BLOCKED(owner)** до ответа хостинга. Прочие OWNER DECISION не изменены. QA-20 исторический риск принят владельцем (**ACCEPTED, nonblocking**); current redaction не исправляет уже опубликованную историю, force/history rewrite не выполнялись. Перед production обязательна отдельная смена `pim_key`/`cron_key` и проверка отказа старым ключам.

CRM dependency `b0e2f9359a05ec835a83d64bb9bcdc2c97487a50` read-only; CRM-SEC-FRESH-01/CRM-PHP-01/CRM-FE-01 остаются на этапе4. PIM: только утверждённый R7/PIMC-P1 на `5fd46cb6fcd32fe628e8ccd0c9ebe4f4c998b055`, exact PIM CI38329162970 SUCCESS на неизменённом PIM SHA; прочие PIM предложения/зависимости не менялись. PIM baseline682 и final684 не взаимозаменяемы. Варианты performance B/C не реализованы; production CWV/p75/capacity и настоящие мобильные устройства не сертифицированы.

<!-- STAGE2B_FINAL_CHECKPOINT_END -->


## Исторические результаты до этапа 2-B


Дата: 2026-10-11. Ветка `hardening/site-release-20261011`. Стенд — изолированная копия (`tests/.staging/qa-fixture.mjs`), PHP built-in server; production не затрагивался. Инструменты: axe-core 4.10.3, Lighthouse 12.6.1 (установлены во временную папку сессии, в репозиторий не добавлены), Playwright Chromium.

## 1. Security (изменения ветки `59b4685..HEAD`)

| Область | Проверка | Итог |
|---|---|---|
| Оплата | COD отклоняется сервером при любом написании и любом конфиге (D-02) | тесты |
| MonoPay webhook | ECDSA X-Sign проверяется до любой обработки; при невалидной подписи — 403. Постоянное несовпадение суммы/валюты/статуса в **подписанном** событии → 200 + аудит без изменения денег (D-20); неизвестный счёт/ошибка БД → 503 (банк повторит) | тесты |
| Потерянный вебхук | `paid` только по аутентифицированному чтению банка с совпадением reference/amount/ccy и после 15 мин (D-03) | тесты |
| Повторный счёт | старый счёт деактивируется в банке до создания нового (D-13); сумма не меняется при открытом счёте (D-04) | тесты |
| Идемпотентность заказа | `request_id` общий для вкладок (D-18); в `localStorage` — только короткий хеш оформления, без имени/телефона | тест |
| IDOR кабинета | чужой заказ → 404 в 3 движках × 4 ширинах | браузерный QA |
| XSS | JSON-LD (`Product`, `BreadcrumbList`) через `json_encode` с `JSON_HEX_TAG/AMP/APOS/QUOT`; HTML — `storefrontEsc` | ревью + тест |
| SQL | все новые запросы с привязкой параметров (`pim-v3-sync`, `mono-lib`) | ревью |
| CSP | без изменений: `script-src 'self' 'nonce-…'`; добавленный `<style>` 404-страницы разрешён `style-src 'unsafe-inline'` | ревью |
| Cookie | `Secure`, `HttpOnly`, `SameSite=Lax` сохранены (D-24 — by design) | ревью |
| Секреты | в коммитах нет ключей/токенов/PII; конфиги — только `config.sample.php` | ревью |

Открытые решения владельца: Q-5 (step-up для денежных действий менеджера), Q-6 (CAPTCHA/резерв SMS, D-15).

## 2. Accessibility (axe-core, WCAG 2.1 A/AA, 15 страниц × 390/1280 = 30 проверок)

До исправлений — 4 правила уровня `serious`, после — 0 по этим правилам:

| Правило | Где | Исправление |
|---|---|---|
| `scrollable-region-focusable` | лента фото товара | D-29 |
| `nested-interactive` | карточки «Поради» | D-30 |
| `aria-prohibited-attr` | рекомендации в слотах комплекта | D-31 |
| `color-contrast` | серверная 404 | D-32 |
| Lighthouse `skip-link` | товар, «Поради» | D-33 |

Осталось (D-34, P3): `label-content-name-mismatch` (логотип, «Кошик»), цели < 24 px (хлебные крошки, «Налаштування cookie»), пустой поиск без фокуса — предлагается в рамках ТЗ главной/шапки.

## 3. Interaction inventory

`qa-audit`: все видимые ссылки/кнопки/поля на 15 страницах × 2 ширины; клик по каждой кнопке на главной, каталоге, товаре, товаре под заказ, комплекте (новая страница на каждый клик).

- Ссылок без `href`: 0. Кнопок без доступного имени: 0 после D-30 (ссылки мессенджеров внутри закрытого `<details>` — ложные срабатывания).
- «Мёртвых» кнопок: реальных — 0. 22 срабатывания разобраны вручную:
  - реагируют позже 0,5 с (SPA-переход/догрузка): «Гарантія», «Форма та одяг», «Додати…», «Обрати спорядження»;
  - ожидаемый no-op: логотип на главной, уже выбранный цвет/«ФОП», «−» при количестве 1, «‹» на первом фото, «Скинути фільтри» без фильтров, «Зібрати комплект» на `/kit`;
  - UX-замечание: «Шукати» с пустым полем (D-34).

## 4. SEO

- `robots.txt`: только существующие пути; `/categories` открыт для AI-агентов (D-27).
- JSON-LD `Product`/`Offer` + `BreadcrumbList` на товаре и категориях (D-28).
- Canonical на всех индексируемых страницах; `noindex,follow` при фильтрах и для `/kit/<code>`; 404 для несуществующих товаров/категорий.
- Lighthouse SEO: **100** на всех 10 прогонах.

## 5. Performance (Lighthouse 12.6.1)

| Страница | Mobile perf | Desktop perf | A11y | Best practices | SEO | Desktop LCP | CLS |
|---|---|---|---|---|---|---|---|
| Главная | 57 | 82 | 99 / 100 | 100 | 100 | 2,4 s | 0,074 |
| Каталог | 57 | 83 | 99 / 100 | 96 | 100 | 2,5 s | 0,01 |
| Подкатегория | 56 | 86 | 99 / 100 | 96 | 100 | 2,2 s | 0,01 |
| Товар | 49 | 85 | 98 | 96 | 100 | 2,3 s | 0,004 |
| Комплект | 58 | 83 | 99 / 100 | 96 | 100 | 2,4 s | 0,009 |

Как читать: стенд — `php -S` **без gzip и без заголовков кеша**. В production `.htaccess` включает `mod_deflate` и `immutable` на год, поэтому замечания `uses-text-compression`/`uses-long-cache-ttl` к production не относятся, а мобильный LCP 12–14 s (симуляция медленного 4G на несжатых ~470 КБ JS) там будет заметно ниже. `errors-in-console`/96 в best practices — только недоступные тестовые фото `img.test`. Цифры сняты до исправлений D-29…D-33.

Реальные возможности (не исправлялись — не дефекты релиза, требуют сборки/отдельного решения):
1. `shop-client.*.js` 468 КБ без минификации (−160 КБ), ~170 КБ неиспользуемого кода на первом экране; минификация при упаковке релиза.
2. HTML-шаблон страницы ~290 КБ (все виды в одном `index.html`) — разделение по видам.
3. Render-blocking `hero-theme.*.js` и два `store.*.css` (−1,5 s в мобильной симуляции).
4. Повторить Lighthouse на стейджинге за Apache с реальным каталогом до/после релиза.

## 6. Повтор после ADDENDUM №2 и независимого ревью (2026-10-11)

- **axe-core WCAG 2.1 A/AA:** 30 проверок (15 страниц × 390/1280) — **0 нарушений**.
- **Lighthouse:** SEO 100 на всех 10 прогонах; accessibility 99–100 (`skip-link` больше не падает; остались P3 `label-content-name-mismatch` и `image-redundant-alt` у логотипа — D-34 б); best practices 96–100 (только недоступные тестовые `img.test`); performance desktop 82–85, mobile 55–59 на `php -S` без сжатия (см. §5).
- **Кнопки:** реальных «мёртвых» нет; новые срабатывания («2XL», «Каталог ▾») проверены вручную — реагируют.
- **Независимый ECC code review** (агент `ecc:code-reviewer`, диффы относительно `59b4685`, клиент — против прежних версий файлов): P0/P1 — нет; P2/P3 — RV-1…RV-4, все исправлены regression-first. Проверено без замечаний: COD, MonoPay (подписи, grace-период, повторы), INVOICE_OPEN, publication_state, XSS в новых шаблонах, соцссылки, отсутствие новых endpoint’ов.
- **Новые поверхности безопасности ADDENDUM:** ссылки соцсетей валидируются при сохранении и при каждом чтении (https, точный хост, без учётных данных/порта/опасных схем), на клиенте — повторно; новых endpoint’ов нет; кабинет — только существующий домен заказов с проверкой владельца.

## 7. Глобальный этап 2 — дополнение 2026-10-12 UTC (checkpoint)

Предыдущие разделы — история этапа 1; их оценки и GO нельзя переносить на новый SHA. Независимый исходный аудит выполнялся на SITE `51c83d8`, финальный код `e9ce24dffb41751b8e08b13b4dff5a5c6056d203`, matrix повторена на identical application tree, позднейшие commits QA-only. Runtime локальных проверок: Linux, PHP 8.4, синтетическая MariaDB, fixture-ключи/сессии и loopback mock-провайдеры. Production, реальные платежи, возвраты, ТТН, SMS/email и данные покупателей не использовались.

### Security и независимое ревью

Существующие и добавленные локальные проверки охватывают проверку подписи, порядок/повтор события, денежные версии под блокировкой, независимые конкурентные процессы, RBAC/step-up, идемпотентность и сохранение оплаченного snapshot. Отдельный финальный security-набор завершил **48/48 pass, 0 fail/skipped**, но это результат выбранных тестов, а не безусловное security-заключение.

**Новое независимое fresh SECURITY source review — COMPLETED:**15реальных selected subtests PASS+1bounded probe; SEC-FRESH-01 MEDIUM proposal unapplied, runtime limits explicit. Дополнительные платежные и changes-ревью выявили поздние пункты на `56acdcb`; исправления повторно проверены payment/changes reviewers; полный SECURITY проход этим не заменён. Публикуются только ID/severity неразрешённых HIGH; ни количество зелёных тестов, ни статический просмотр не закрывают их автоматически. Итоговое заключение: `Scoped payment/changes/QA review approved; fresh whole SECURITY source review COMPLETED;15 selected checks+1 bounded probe`.

Installer теперь отказывает при неподходящем артефакте, неполных P0 prerequisites и неуспешном HTTP smoke. Синтетическое восстановление проверило **61 таблицу и 2 триггера**, равенство строк и запрет мутации audit; восстановление исходников сохранило private configuration и media. Это подтверждает локальную процедуру, а не backup, cron, downtime или recovery time настоящего хостинга. Исторический архив по-прежнему намеренно отвергается.

### Accessibility и browser evidence

Точечные исправления включают клавиатурные границы коммерческих диалогов, inert фон, возврат фокуса, семантику mobile filters, `aria-pressed` размеров и контраст фокуса light theme. До исправления добавленные regressions воспроизводились; итоговый scoped run `a11y-hardening` + `mobile-polish`: **15/15 pass, 0 fail/skipped**. В проверенной light-theme поверхности outline имеет контраст **5,9968:1**. Native fetch-сбой показывает украинский текст и освобождает состояние отправки; отмена, timeout и серверная валидация сохраняют отдельные пути.

Повторная полная matrix на final application tree: Chromium/WebKit/Firefox × 360/390/430/768/1024/1280/1440, **315 загрузок и 21 поток покупки**, без JS pageerror, overflow и битых синтетических изображений. Предусмотренные HTTP 404 страницы товара вызвали console resource-сообщения в Chromium/WebKit; они отделены от JavaScript-ошибок. Поздние app corrections включены в повтор; real devices remain untested. Scoped тесты и matrix не являются полной сертификацией WCAG.

### SEO

Server/SPA теперь сохраняют полный Product с image, brand, description, seller, Offer URL и реальным SKU. SKU, цена и availability относятся к одному варианту: неизвестный остаток не превращается в InStock; zero, preorder с подтверждённым сроком, mixed inventory и совпадение SKU/цены проверены синтетически. Описание одно; SPA меняет robots/breadcrumbs, удаляет Product при уходе в каталог; out-of-range page canonical использует авторитетный ответ каталога. Автоматически сериализуемый default `sort=pop` нормализован на server/client.

`seo-hardening`: **7/7 pass, 0 fail/skipped**. Дополнительные JS/no-JS проверки stock/identity/canonical прошли; provider rich-result eligibility, реальная индексация и search-console данные не проверялись.

### Performance: уточнение исторических утверждений

Этап 2 подтвердил зависимость видимого первого экрана от runtime compilation, тяжёлые cold catalog/facet-запросы и повторное владение CSS. В одном settled synthetic mobile-сценарии (200 legacy-товаров, 6× CPU, 150 ms latency, 200 kB/s) **FCP = LCP = 12 460 ms**, TTFB 1514,2 ms; другие начальные прогоны не дожидались contentful paint и не являются FCP/LCP-измерениями. Профилирование 2000 товаров завершилось таймаутом — это не измеренная задержка ответа.

Здесь нет обычного hosting compression/CDN/cache, реальных CPU, распределения каталога или пользователей; magnitude на production не установлена. Историческая фраза §5 о том, что production LCP «будет заметно ниже», остаётся гипотезой, а не результатом этапа 2. Реальный p75 и целевая ёмкость **UNMEASURED**.

Первый экран, компактный home dataset, facets/индексы и CSS-ownership остаются **OWNER DECISION**. Варианты A/B/C, риски и acceptance собраны в `04-ECC_IMPLEMENTATION_PLAN.md`, этап 2 §7; архитектурный редизайн и удаление файлов не выполнялись. После решения нужны одинаковые cold/warm before/after сценарии и визуальная/SEO/денежная parity.

### Остаток для итогового gate

Привязка результатов, включая completed fresh SECURITY source verdict и точные runtime limits: `e9ce24dffb41751b8e08b13b4dff5a5c6056d203`, `450/450 PASS;0FAIL/SKIP/CANCELLED;626167ms, tested1fcca317, identical app/tests in e9ce24d`, `Scoped payment/changes/QA review approved; fresh whole SECURITY source review COMPLETED;15 selected checks+1 bounded probe`, `[38307425169](https://github.com/lieverifying/rubizh/actions/runs/38307425169) SUCCESS on e9ce24d, PHP8.2/8.3; exact final doc-only checkpoint CI checked after push`. Stage 2 review остаётся **INCOMPLETE**, production **NO-GO**. Live-провайдеры и финальный сквозной E2E — **DEFERRED → этап 6**, не PASS.

Финальный paired compressed Lighthouse:32/32 runs,0runtime errors; mobile medians home53→54/catalog55→57/product58→59/kit56→55; LCP7370→7323/6929→7102/6150→6173/6575→6681ms. Desktop94→93/95→94/95→94/94→95. SEO100; payload+3,9–4,0KB. Все32 завершены; performance threshold не объявлен PASS. Одинаковые local gzip/cache, четыре synthetic products,3mobile runs interleaved per version/page; no live production CWV. Финальный axe30/30,0violations WCAG2.1 A/AA;111inventory flags, dead-click heuristic не повторена и не объявлена PASS. Полная детализация —stage-2/FINAL_REPORT.


**Ограничение приватности:** GitHub repository visibility проверено как public. Унаследованный commit2a338da содержит исходные HIGH raw; обычный push сохранил эти версии в истории. Текущие документы редактированы, новые полные доказательства остаются local/private, но обещать приватность исторических raw нельзя. История не переписывалась: force-push запрещён владельцем. QA-20 MEDIUM / OWNER DECISION фиксирует процессный дефект; cleanup требует отдельного решения и не отменяет уже случившуюся публикацию. Технические подробности неразрешённых HIGH здесь не повторяются.

Final endpoint Quality Gate:132inventory rows,1920HTTP requests;831/831explicit expectations,2697/2697overlapping semantic checks,975snapshots+2A↔B whole-domain comparisons;0final assertion failures. ANY232/232 and narrowaction36/36; all inventory endpoints requested, full state/role/token combinations remainPARTIAL. Details and limits:stage-2/endpoint-quality-gate.md. Fresh SECURITY source review COMPLETED(15checks+1probe), no newHIGH/CRITICAL; MEDIUM SEC-FRESH-01 unapplied CRM proposal. OverallNO-GO: exhaustive dynamic certification and historical privacy requirement unmet, noStage2verifiedtag/Stage3.

## 8. Глобальный этап 4 — CRM (2026-10-15)

**Независимое ревью.** `ecc:code-reviewer` и `ecc:security-reviewer` без общего контекста с автором; затем повторный слепой проход security и payments на итоговых SHA. Первый проход: code-reviewer — 0 CRITICAL/HIGH, 6 MEDIUM; security-reviewer — 2 HIGH, 6 MEDIUM → R4-01…R4-13. Слепой повтор: security — 3 HIGH, 3 MEDIUM → R4-16…R4-23; payments — 0 CRITICAL/HIGH, 3 LOW (исправлены). Поправка владельца по финансам ролей — R4-24 (таблица «Поля × роли», `tests/crm-stage4-fields.test.mjs`, 70 проверок). Находки и исправления — `03-DEFECT_REGISTER` (R4-01…R4-24), тесты `tests/crm-stage4-review.test.mjs`. Открытых CRITICAL/HIGH нет; R4-14, R4-15 — LOW, задокументированы (`KNOWN_ISSUES`).

**Дополнительно после ревью.** Ревью PERF-4.1 и S4-06 (`ecc:code-reviewer`, без общего контекста): 0 CRITICAL/HIGH; найдены и исправлены S4-08 (суммы возврата в ответе «створити повернення» для MANAGER/SUPPORT) и широкий поиск по e-mail; LOW — глубокие страницы клиентов (документировано). Триаж `security-bounty-hunter` по изменённым PHP этапа 4: SQL с данными запроса только через привязанные параметры, сортировка — белый список, `LIMIT/OFFSET` — проверенные целые; нет shell/eval/unserialize, чтения файлов или URL из запроса — новых находок нет. `production-audit` не выполнялся: любые действия с production запрещены (§13).

**Секреты и зависимости.** gitleaks (история SITE и CRM, рабочие деревья) — 0 находок (тестовые ключи стенда — в `.gitleaksignore` по отпечаткам с пояснением). `npm audit` SITE и CRM — 0 уязвимостей (CRM: react-router-dom 7.18.4, vite 7.3.6, точные версии).

**Производительность Staff API на 50 000 заказах** (`tests/crm-stage4-synthetic.test.mjs`, финальный код `5102e82`). **Условия замера:** Apple M2, 8 ГБ, 8 ядер, macOS 26.3.1, MariaDB 11.4.13 (Homebrew, локальный сокет), PHP 8.4 (встроенный сервер), **питание от сети, заряд 77–79 %**, машина без другой нагрузки; 3 прогона теста × медиана из 3 запросов внутри прогона → медиана по прогонам. Замеры, сделанные ранее при заряде 5–13 % (троттлинг CPU), признаны недействительными (поправка владельца). Результат (медиана, мс): «Огляд» OWNER 312, MANAGER 181; счётчики 264 / 203; «Оплати» 112 / 156; клиенты 68 / 62, сегмент VIP 47 / 46, поиск клиентов «Коваленко» 57, «a» 58, «@» 130; список заказов 51 / 49, страница 200 — 65 / 68, вкладки 19–86, сортировка по сумме 90; поиск заказов «Коваленко» 84, телефон 65, «a» 53, «@» 112. **Все ≤ 500 мс** (максимум 312). Исправления по ходу: PERF-4.1…PERF-4.4, S4-09 (генератор). В CI (общий раннер, MariaDB в Docker, в 4–8 раз медленнее) — отчёт и страховка 5 000 мс.

**Lighthouse 12.6.1, CRM** (стенд + сжатие как `mod_deflate` production). **Условия:** та же машина (Apple M2, 8 ГБ, macOS 26.3.1), **питание от сети, заряд 73 %**, 2026-10-16 00:22–00:28; 3 прогона, медиана. Прогоны 2026-10-15 23:42–23:46 шли от батареи — не засчитаны.

| Страница | Desktop perf / a11y / BP | Mobile perf / a11y / BP | Mobile LCP | Mobile FCP | TBT | CLS |
|---|---|---|---|---|---|---|
| Вход | 100 / 100 / 100 | 98 / 100 / 100 | 2,26 с | 1,66 с | 0 | 0 |
| Огляд | 100 / 100 / 100 | 97 / 100 / 100 | 2,37 с | 1,71 с | 0 | 0 |
| Замовлення | 100 / 100 / 100 | 97 / 100 / 100 | 2,39 с | 1,71 с | 0 | 0 |

Mobile — эмуляция Lighthouse «slow 4G» (первый экран ≤ 3 с выполнено). Без сжатия (встроенный сервер PHP) mobile LCP 3,2–5,1 с — production отдаёт JS/CSS/JSON сжатыми (`.htaccess`, `mod_deflate`). Сдвиг макета 0,29 на «Огляді» устранён (резерв высоты первого экрана).
