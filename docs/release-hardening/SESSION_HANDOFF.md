# SESSION HANDOFF — RUBIZH SITE release hardening

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

Продолжение: сначала проверить точный reviewed code SHA и независимый R9 census/manifest, затем запускать изолированные DB/browser gates последовательно. Не выдавать старые source pin/CI/counts за новый прогон. Cloud setup использует существующий checkout и private runtime helpers; сохранённые процессы после восстановления не считаются работающими.

<!-- STAGE2B_FINAL_CHECKPOINT_END -->


## Исторические результаты до этапа 2-B


Обновлено: 2026-10-11 — **глобальный этап 1 (SITE) завершён**, checkpoint `rubizh-stage-1-verified` (локальный тег). Продолжать с этого документа. **К глобальному этапу 2 без указания владельца не переходить.**

## Глобальные этапы проекта (терминология владельца)

1 — завершение SITE (**VERIFIED**, проверенный код `3327862`, тег `rubizh-stage-1-verified` на checkpoint-коммите (`git rev-parse rubizh-stage-1-verified`)); 2 — независимый multi-agent аудит SITE + PIM; 3 — стабильный release candidate; 4 — завершение CRM; 5 — импорт пяти поставщиков; 6 — финальный E2E (живые проверки В-1…В-4 — DEFERRED сюда). Этапы 2–6 не начаты. Фазы 2–7 ADDENDUM №2 — отдельная закрытая работа (`rubizh-addendum2-phases2-7-verified`), не этапы 1–6.

## Итог глобального этапа 1 (2026-10-11)

- Q-6 (SMS), Q-7 (подтверждённое наличие → MonoPay, контракт webhook, идемпотентность — ключ на попытку оформления), Q-5 (RBAC, повторный вход ≤ 15 мин, обязательная версия заказа для возврата/сверки, аудит, CSRF), Q-4 (предзаказ v3 только после подтверждения менеджера) — DONE; SHA и CI — `08-RELEASE_READINESS.md`, `STAGE_CHECKPOINT.md`.
- Дефекты и ревью этапа: Q-4…Q-7, D-41, RV-10…RV-17, PERF-1 — `03-DEFECT_REGISTER.md`.
- Задачи следующих этапов: CRM-4.1 (показ спорных событий MonoPay), CRM-4.2 (обязательная версия в CRM-возврате), PERF-2.1 (~200 КБ JS первого экрана) — `04`.
- Новые тесты: `q4-v3-preorder`, `q5-manager-rbac`, `q7-payment-readiness`, `mono-webhook-contract`, `order-idempotency`, `idor-orders`, `sms-protection`.
- Инструменты (scratch, вне репозитория): `lh-prod.mjs` (Lighthouse за прокси brotli/gzip + кеш по .htaccess), `gate-sum.mjs`, `lh-sum.mjs`; QA-матрица: `QA_WIDTHS=360,390,430,768,1024,1280,1440 QA_FLOW_ALL=1 node tests/.staging/qa-matrix.mjs OUT`, `QA_FIREFOX=1 node tests/.staging/qa-addendum.mjs OUT`.
- Production: один разрешённый запрос заголовков `https://rubizh.shop/` — `content-encoding: br`, `cache-control: no-cache`, nginx. Больше обращений не было.

## Репозитории и ветки

| | SITE | PIM (READ-ONLY) |
|---|---|---|
| Локально | `/Users/l/Projects/rubizh` | `/Users/l/Projects/pim.rubizh` |
| Рабочая ветка | `hardening/site-release-20261011` (push в origin) | `claude/amazing-meitner-e6572n`, `2119846`, не изменялся |
| База ветки | `59b46857ea7c58c95212c94a0674d3ed1f934d7a` | — |
| Последний коммит | см. `git log -1` (коммит «Release hardening: docs, handoff…» поверх `77d3a8f`) | — |

Merge в main не выполнялся. Production, CRM, PIM не изменялись.

## Frozen rules (действуют)

PIM — только чтение; CRM не менять и не разворачивать; PIM→SITE sync OFF; AUTOPRICES OFF; никаких reset/импортов каталога; v3 на production не включать; не публиковать каталог; не менять реальные суммы/остатки/заказы/оплаты; никаких production migrations, destructive SQL, deploy — только после явного подтверждения владельца; без секретов/PII; без force push/hard reset/переписывания истории. COD полностью запрещён (решение владельца 2026-10-11). Реальные платежи и ТТН — запрещены.

## Выполнено (коммиты на ветке)

1. `366d8ff` тесты переносимы: `RUBIZH_PHP_RUNTIME`, `CHROMIUM_PATH`, `RUBIZH_TEST_REPORTS`, `RUBIZH_CRM_DIR` (дефолты CI прежние).
2. `d3804ae` COD удалён (сервер/клиент/NP/конфиг; дефолт оплаты больше не `cod`); D-03 потерянный вебхук MonoPay; D-04 `INVOICE_OPEN`.
3. `bf66500` D-13 `invoice/remove` перед повторным счётом.
4. `2f04aac` D-25 legacy «під замовлення» → подтверждение менеджером → счёт.
5. `4c4c299` P0 галерея цвета (D-01, D-05, D-17), кеш `product-v2-`.
6. `cc0473a` D-10 ТТН в кабинете.
7. `793cc70` D-06/D-07 недавно просмотренные; D-08 мобильные карусели категорий.
8. `77d3a8f` D-26 мобильная кнопка «Оберіть розмір».
9. Финальный коммит: документы `docs/release-hardening/*`, QA-инструменты `tests/.staging/qa-matrix.mjs`, `qa-cabinet.mjs`, `macos-php-shim.sh`.
10. Сессия 2 (коммит после `fcc73e9`): D-14, D-18, D-20, D-21 (legacy + v3), D-27, D-28, D-29…D-33 — regression-first; D-24 NO-DEFECT; D-11 → Q-8; D-22 → Q-9 (удаление файлов заблокировано классификатором, нужно разрешение). Документы 05 и 07. QA-инструменты `qa-fixture.mjs` (общий стенд) и `qa-audit.mjs` (кнопки, axe, Lighthouse).


Полный реестр: `03-DEFECT_REGISTER.md`. План: `04-ECC_IMPLEMENTATION_PLAN.md`. Интеграции: `06-INTEGRATION_AUDIT.md`.

Новые версии ассетов (подключены в `index.html`): `shop-client.2026101101.js`, `pim-v3-product.2026101101.js`, `site-qa.2026101101.{js,css}`, `recently-viewed.2026101101.css`, `category-carousel.2026101101.css`. Старые версии не удалены.

## Тесты

Сессия 2: `tests/seo-hardening.test.mjs`, `tests/a11y-hardening.test.mjs`, тесты D-18/D-20 в `release-hardening`, D-14 в `pim-v3-sync`, D-21 в `pim-v3-browser` и `color-gallery`.

Добавлены (сессия 1): `tests/release-hardening.test.mjs` (COD ×3, D-03, D-04, D-13, D-25, D-10), `tests/color-gallery.test.mjs` (PHP + desktop + mobile), `tests/ui-hardening.test.mjs` (recently viewed ×2, карусель 360/390/430, desktop). Изменены осознанно (новые требования владельца): `storefront.test.mjs` (COD никогда не показывается), `category-directory.test.mjs` (карусель вместо 4/стр).

Regression-first: каждый новый тест сначала красный на старом коде (для галереи/UI — проверено в worktree `59b4685`).

Последний полный локальный прогон (MariaDB 11.4, PHP 8.2, macOS): **281 тест, 276 pass, 5 fail** — все 5 падают так же на чистом `59b4685` и являются окружением macOS (в CI зелёные):
- `Database availability…` — тест переопределяет `curl_init`; проходит с `RZ_DISABLE_CURL=1` (shim) на старом и новом коде.
- `Scheduler runs each worker once…`, `Deployment preserves…`, `Small patch…` — Linux-скрипты (`flock`/`find -printf`/bash 4).
- `fixture migration rehearsal` (CRM) — локально не воспроизводится, вне scope.

Браузерный QA:
- Кабинет (`qa-cabinet`): Chromium/WebKit/Firefox × 360/390/768/1280 — 12/12 OK: свой список, чужой заказ 404 (IDOR нет), отменённая ТТН скрыта, без overflow.
- Матрица витрины (`qa-matrix`): 540/540 загрузок без ошибок/overflow, покупка до заказа 9/9 в 3 движках — см. `05-BROWSER_QA_MATRIX.md`.
- Аудит (`qa-audit`): axe 4 serious → исправлены; Lighthouse SEO 100, a11y 98–100 — см. `07-SECURITY_PERFORMANCE_REVIEW.md`.
- CI GitHub: `fcc73e9` — success; после нового push проверить снова.

## Сессия 2, продолжение (ADDENDUM №2 и checkpoint)

- Push `3326514` выполнен по разрешению, CI success. Дальнейшие коммиты (`7b4aa86` … `98ef261` и checkpoint) **не отправлены** — новое правило: push только с явного разрешения.
- ADDENDUM №2: фазы 2–7 реализованы regression-first (это не глобальные этапы проекта; закрыты тегом `rubizh-addendum2-phases2-7-verified`); сверка — `04` (A-*, K-*, C-*, P-*, S-*).
- Независимый ECC code review: P0/P1 нет; RV-1…RV-4 исправлены. Gate на `98ef261` зелёный; после push CI success на `bbc989a` → тег `rubizh-addendum2-phases2-7-verified`.
- Документы: `08-RELEASE_READINESS.md` (NO-GO для production, блокеры B-1…B-5), `09-ASSET_INVENTORY.md` (Q-9), `10-KIT_RULES_PROPOSAL.md` (Q-8), `11-BANNER_PROMPTS.md` (D-09).
- Следующее по решениям владельца: Q-6 (SMS), Q-7 (прямая MonoPay при подтверждённом наличии), Q-5 (step-up/RBAC/аудит), Q-4 (v3 под заказ) — каждый этапом с checkpoint; ждут разрешения/решения владельца по CI-push и этапам.
- Новые QA-инструменты: `tests/.staging/qa-addendum.mjs` (экраны ADDENDUM), `qa-audit.mjs` (Lighthouse с жёстким таймаутом).

## Сессия 2, продолжение (интеграции и Q-6)

- Checkpoint ADDENDUM: тег `rubizh-addendum2-phases2-7-verified` → `bbc989a` (CI success), локальный, не отправлен.
- Ключи провайдеров: `~/Projects/rubizh-test-secrets/` (вне Git). monobank — sandbox (тестовый мерчант), НП и TurboSMS — реальные аккаунты, только readonly. Запуск: `run-testing.sh <provider> -- node tests/.staging/qa-connectivity.mjs` и `qa-provider-sandbox.mjs`. Подробно — `INTEGRATION_TEST_READINESS.md`.
- Q-6 (SMS) реализован и прошёл локальный gate; **INCOMPLETE** до CI (push по разрешению). Q-7 → Q-5 → Q-4 — после решения владельца.

## Не начато / в работе

- Ждёт владельца: Q-4…Q-9 (03), файлы баннеров D-09/D-23, **дополнительное ТЗ** (главная, конструктор комплектов, каталог, кабинет 2.0, Instagram/TikTok) — сопоставить с 04, добавить только новое.
- Не начато: D-34 (шапка/поиск — вместе с ТЗ главной), `08-RELEASE_READINESS.md`, финальный `/ecc:code-review`.
- Не объявлять проект завершённым до обработки дополнительного ТЗ.

## Требует дополнительной проверки

- Доля legacy-товаров, у которых цвета получат placeholder: зависит от реальных `variants.data.photos` в production — нужен read-only запрос на копии БД (не на production без разрешения).
- MonoPay/НП — только mock; live не проверялись.
- Версия MariaDB на хостинге (риск R-1).
- Кеш `product-*` на production: новые ключи `product-v2-*`, старые истекут сами.

## Локальное окружение (без секретов)

- Homebrew: `php@8.2`, `mariadb@11.4` (+`mariadb` 13, не используется), `findutils`. Playwright браузеры в `~/Library/Caches/ms-playwright`.
- Тестовая MariaDB 11.4: `--no-defaults --skip-networking`, сокет `/tmp/rzdb/mysqld.sock`, данные в scratchpad сессии (временные; при новой сессии создать заново). Пароль root пустой, только локальный сокет, только fixture-схемы.
- CRM frontend для тестов: клон `crm.rubizh@b0e2f93` в scratchpad, `npm run build` (CRM не изменялся).

## ECC выполнено

`/ecc:plan` (фазы A–C), параллельные read-only аудиты (`ecc:code-explorer`, `ecc:php-reviewer`, `ecc:security-reviewer`, `Explore`), regression-first реализация. **Не выполнено:** финальный `/ecc:code-review`.

## Как продолжить (новая сессия Claude Code)

```sh
cd ~/Projects/rubizh && git fetch origin && git switch hardening/site-release-20261011 && git pull --ff-only
claude --add-dir ../pim.rubizh
```

Первое сообщение: «Продолжи RUBIZH SITE release hardening по docs/release-hardening/SESSION_HANDOFF.md».

Восстановление стенда:

```sh
W=$TMPDIR/rz; mkdir -p $W/rt/usr/bin /tmp/rzdb
cp tests/.staging/macos-php-shim.sh $W/rt/usr/bin/php8.4 && chmod +x $W/rt/usr/bin/php8.4
/opt/homebrew/opt/mariadb@11.4/bin/mariadb-install-db --no-defaults --datadir=$W/db --auth-root-authentication-method=normal
/opt/homebrew/opt/mariadb@11.4/bin/mariadbd --no-defaults --datadir=$W/db --socket=/tmp/rzdb/mysqld.sock --skip-networking --pid-file=/tmp/rzdb/mysqld.pid &
git clone https://github.com/alexalixmanov-del/crm.rubizh.git $W/crm && (cd $W/crm && git checkout b0e2f9359a05ec835a83d64bb9bcdc2c97487a50 && npm ci --ignore-scripts && npm run build)
export RUBIZH_PHP_RUNTIME=$W/rt/usr RUBIZH_TEST_MYSQL_SOCKET=/tmp/rzdb/mysqld.sock RUBIZH_TEST_REPORTS=$W/reports RUBIZH_CRM_DIR=$W/crm PHP_PATH=$W/rt/usr/bin/php8.4
export CHROMIUM_PATH="$HOME/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
export PATH=$W/rt/usr/bin:/opt/homebrew/opt/findutils/libexec/gnubin:/opt/homebrew/opt/mariadb@11.4/bin:$PATH
npm test
node tests/.staging/qa-matrix.mjs $W/qa && node tests/.staging/qa-cabinet.mjs $W/qa
# axe + Lighthouse: npm i axe-core@4.10.3 lighthouse@12.6.1 в отдельной папке $W/tools, затем
node tests/.staging/qa-audit.mjs $W/qa/audit $W/tools
```

## Порядок следующих действий

1. Проверить CI ветки на GitHub.
2. Перезапустить `qa-matrix`, заполнить `05-BROWSER_QA_MATRIX.md`, исправить найденное (regression-first).
3. Получить ответы Q-4…Q-7 и файлы для D-09.
4. P2/P3 из реестра.
5. 07 и 08 документы, финальный `/ecc:code-review`, повтор тестов, GO/NO-GO.
6. Deploy — только по отдельному подтверждению владельца.


## Глобальный этап2 — cloud resume (2026-10-12)

SITE `/workspace/rubizh`, branch `hardening/stage-2-audit-fixes`; baseline `rubizh-stage-1-verified` →51c83d808228a26328081b02211b4e3605353755. Main не использовать/не менять. PIM `/workspace/pim.rubizh` exact21198461f8ebb2eadef6dcd6fb77a50a8a038ea9, CRM dependency `/workspace/onboarding/dependencies/crm.rubizh` exactb0e2f9359a05ec835a83d64bb9bcdc2c97487a50; их source read-only.

`source /workspace/onboarding/rubizh/environment.sh`; `bash /workspace/onboarding/rubizh/start.sh`. Helpers и signed Debian PHP8.4/MariaDB11.8 extraction вне checkout; Node24.19, Playwright1.62.1, Chromium/system плюс downloaded Firefox/WebKit. MariaDB fixture-only private Unix socket/noTCP, innodb_snapshot_isolation=OFF соответствует CI11.4. PHP extensions pdo_mysql/mbstring/curl/gd/fileinfo; root/no-password допустим только для этого fixture. Start проверяет SELECT1 и функциональный Node/PHP preview; running processes после snapshot restoration запускаются заново. Full tests: `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.mjs`. Не запускать много DB/browser suites параллельно: под перегрузкой подтверждены hard20s fixture timeouts; serial retries не ослабляли assertions.

Browser external runners `/workspace/onboarding/qa-tools`, artifact folders `/workspace/onboarding/rubizh/reports/checkpoint-*`; Firefox требует разрешённый tool sandbox escalation из-за user-namespace/proc startup, WebKit `executablePath=/workspace/onboarding/browsers/webkit-2336/pw_run.sh` с verified local libs bridge. Cookies ослабляются только generated HTTP QA fixture. Не выдавать localhost links и не запускать live MonoPay/NP/SMS/SMTP. Approved api.github.com/cdn.playwright.dev/playwright.download.prss.microsoft.com реально проверены; прежний network BLOCKED снят только для выполненных операций.

Слепые исходные13 raw: stage-2/raw, единый регистр03, новые артефакты только stage-2/. Unresolved HIGH детали в ignored mode700 private/ и `/workspace/onboarding/stage2-private`; их не добавлять в index/PR/public reports. Full PIM HIGH patch private; public PIMC-P1 — notice. Другие proposals не применены. Поздние findings финального review корректированы/перепроверяются; точные статусы03/checkpoint имеют приоритет над историческими raw.

Cloud install_script/start_skill обновлены, повторно исполнены и saved в draft; публикация/новая-session restoration не выполнены. Runtime network state unknown не означает отсутствие доступа: наблюдались успешные GitHub API, browser download и git push. Repository declarations после doc checkpoint должны сохранить exactHEAD + реальные mounts, не устаревший main. Не менять network fields при сохранении scripts/repositories.

Следующий шаг только по итоговому STAGE_CHECKPOINT. Нельзя считать этот checkpoint разрешением на Stage3 build/packaging/deploy, PIM sync/AUTOPRICES или tag publication. GO-tag допускается лишь при выполненном Stage2 gate; сейчас unresolved owner/external пункты требуют NO-GO.

Tmpfs hygiene: tests retain fixture copies after stop(), and this long audit exhausted17GB /tmp. 941 positively identified inactive synthetic SITE dirs were removed after stopping failed overlapping runners; all DB schemas/reports preserved. Do not count the ENOSPC/contended runs as green. Optional /workspace/onboarding/rubizh/cleanup-fixtures.py dry run/--apply only considers old (>1h), marker-verified, inactive copies. Run final DB/browser suites serially with capacity checks; no arbitrary /tmp or DB deletion.

Финализация: codee9ce24dffb41751b8e08b13b4dff5a5c6056d203; prior code1fcca CI38304082586SUCCESS; schedulinge9 and exactfinal checkpoint CI results retained separately. Full browser matrix/axe/Lighthouse repeated after app corrections; bound independent payment/changes/QA approval. Общий Stage2 NO-GO: historical privacy requirement unmet and dynamic/runtime coverage limits explicit; new whole SECURITY source pass completed; Stage3 STOP. Doc-only checkpoint exactCI verified after push in final response/retained metadata. Full numeric reportstage-2/FINAL_REPORT, register03; сохранять private HIGH confidentiality.


**Ограничение приватности:** GitHub repository visibility проверено как public. Унаследованный commit2a338da содержит исходные HIGH raw; обычный push сохранил эти версии в истории. Текущие документы редактированы, новые полные доказательства остаются local/private, но обещать приватность исторических raw нельзя. История не переписывалась: force-push запрещён владельцем. QA-20 MEDIUM / OWNER DECISION фиксирует процессный дефект; cleanup требует отдельного решения и не отменяет уже случившуюся публикацию. Технические подробности неразрешённых HIGH здесь не повторяются.

Final endpoint Quality Gate:132inventory rows,1920HTTP requests;831/831explicit expectations,2697/2697overlapping semantic checks,975snapshots+2A↔B whole-domain comparisons;0final assertion failures. ANY232/232 and narrowaction36/36; all inventory endpoints requested, full state/role/token combinations remainPARTIAL. Details and limits:stage-2/endpoint-quality-gate.md. Fresh SECURITY source review COMPLETED(15checks+1probe), no newHIGH/CRITICAL; MEDIUM SEC-FRESH-01 unapplied CRM proposal. OverallNO-GO: exhaustive dynamic certification and historical privacy requirement unmet, noStage2verifiedtag/Stage3.
