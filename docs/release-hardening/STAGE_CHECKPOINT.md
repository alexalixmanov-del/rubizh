# STAGE CHECKPOINT — история контрольных точек

> Актуальный checkpoint — этап 5.1, затем этап 5, затем этап 4.1, затем этап 4 (CRM), затем этап 3 (RC1). Блоки этапа 2-B и ранее ниже — история.

<!-- STAGE51_CHECKPOINT_BEGIN -->

## Этап 5.1 — правило свежести данных поставщиков, checkpoint 2026-10-17

Статус: **GO этапа 5.1** при зелёном CI на SHA checkpoint-коммита (SHA и номер CI — в аннотации тега `rubizh-stage-5.1-verified`). Существующие теги не двигались. Production — **NO-GO**. Merge не выполнялся. CRM не менялась (тег `crm-stage-5.1-verified` не ставится; в CI закреплён CRM `614a044`).

| Объект | Ветка / тег |
|---|---|
| SITE | `hardening/stage-5.1` от `rubizh-stage-5-verified`, тег `rubizh-stage-5.1-verified` |
| PIM | `hardening/stage-5.1-pim` от `pim-stage-5-verified` (`25ba078`), тег `pim-stage-5.1-verified`; 715/715 |
| CRM | без изменений, `614a044` (`crm-stage-5-verified`) |

Правило (решение владельца): возраст данных SKU (время наблюдения поставщика, иначе время импорта в PIM) ≤ `pay_fresh_hours` (72 ч) — прямая оплата; до `sell_max_days` (8 дн.) — только через «Очікує підтвердження менеджера», без MonoPay до подтверждения; старше — SKU не заказывается, модель без других заказываемых SKU скрыта (не удалена). Пороги — настройки владельца в PIM (с проверкой), передаются в `freshness_policy` пакета синхронизации; SITE применяет на сервере (`shop/stock-freshness.php`, CONFIG §17). Без времени данных — только через менеджера (fail closed).

Тесты: SITE `stage51-freshness` (границы 71/73 ч и 7/9 дн., смешанная корзина, обход через API, оплаченные заказы, K6, политика из PIM, fail closed; RED на коде этапа 5), PIM `stage5-freshness` (переписан), `final-workflow` (политика в пакете). Найден дефект этапа 5: возраст не учитывался для импортов без отметки поставщика (S51-03, FIXED). Security-ревью: CRITICAL/HIGH нет; M1–M3, L1–L3 и три LOW-остатка исправлены, повторная проверка — все закрыты. Полная регрессия — CI на Linux.

<!-- STAGE51_CHECKPOINT_END -->

<!-- STAGE5_CHECKPOINT_BEGIN -->

## Глобальный этап 5 — PIM, PDF-рахунок, себестоимость из PIM, D-65, SEO, checkpoint 2026-10-16

Статус: **GO этапа 5** при зелёном CI на SHA checkpoint-коммита (SHA и номер CI — в аннотации тега `rubizh-stage-5-verified`). Существующие теги не двигались. Production — **NO-GO**. Merge не выполнялся. Этап 5.2 (импорт поставщиков 5-B) не начат.

| Объект | SHA / тег |
|---|---|
| SITE | `hardening/stage-5` от `rubizh-stage-4.1-verified` (`a8c0bb3`), тег `rubizh-stage-5-verified` |
| CRM | `614a044cbe710c59d296ccc6534afc8fa58dd923` (`hardening/stage-5`, remote `ci`), тег `crm-stage-5-verified`; закреплён в `.github/workflows/ci.yml` |
| PIM | `55e0432` (`hardening/stage-5-pim`), тег `pim-stage-5-verified`; 711/711 тестов |

| Пункт | Статус | Тесты |
|---|---|---|
| 5-1 D-65 бронезахист по фиксированной цене | FIXED | `stage5-armor`, `pricing-policy` |
| 5-2 себестоимость из PIM (`api/pim/costs`, только pim_key, OWNER/ACCOUNTANT) | DONE | `stage5-pim-costs` |
| 5-3 PDF-рахунок ФОП (сайт, кабинет, CRM) | DONE | `stage5-invoice-pdf` |
| 5-4 PIM: freshHours 36, резервная копия на SITE (ротация 14), PIMC-P2/P3/P4/C1, ajv, ротация pim_key | DONE | PIM 711/711, `stage5-pim-backup`, `stage5-pim-key` |
| 5-5 SEO: страницы групп `/rozdil/<slug>`, robots.txt, image sitemap, JSON-LD, карточка без JS, описания категорий | DONE | `stage5-seo`, `stage41-site` |
| 5-6 CRM-5.1 | FIXED (корень: запрос Staff API, начатый во время ухода со страницы; CRM 614a044) | `crm-stage4-matrix` (без исключения), `stage5-crm51-webkit` |
| 5-7 лимит запросов к банку на payment-return, телефон менеджера из настроек | FIXED | `stage5-payment-return` |

Quality gate: полная регрессия — CI на Linux (решение владельца; CI 38942879087 на `45dc356` — success; локальный полный прогон на macOS прерван по решению владельца: 440 ok, единственный not ok — #49 из-за сети); #49 отдельно с `RZ_DISABLE_CURL=1` — ok; npm audit 0 (SITE, CRM, PIM); gitleaks 0; финальный security-reviewer — PASS. Решение владельца S5-02: ИИ-краулерам публичные страницы разрешены, как сейчас.

Замеры (от сети, заряд 42–43 %, M2, macOS 26.3.1, MariaDB 11.4.13, синтетическая фикстура, 3 прогона, медиана; код выполнения на `45dc356` тот же, что на `d8fcbf0`): `/rozdil` 7.5 мс, категория 8.6 мс, главная 7.5 мс, sitemap с изображениями 5.5 мс, товар 6.8 мс, PDF-рахунок 60 строк 6.4 мс (37 КБ).

<!-- STAGE5_CHECKPOINT_END -->

<!-- STAGE41_CHECKPOINT_BEGIN -->

## Этап 4.1 — недостающая часть 4-SITE и OD-4.6, checkpoint 2026-10-16

Статус: **GO этапа 4.1** при зелёном CI на SHA checkpoint-коммита (SHA и номер CI — в аннотации тега `rubizh-stage-4.1-verified`). Существующие теги этапа 4 не двигались. Production — **NO-GO** (как этап 4). Merge не выполнялся.

| Объект | SHA |
|---|---|
| SITE | ветка `hardening/stage-4-crm` от `rubizh-stage-4-verified` (`a6100ec`) |
| CRM | `57e9ef432680ce84fc1552ff2a240da42a5aa6e7` (`hardening/stage-4-crm`, тег `crm-stage-4.1-verified`; закреплён в CI SITE) |
| PIM (только чтение) | `5fd46cb` |

D-55…D-60, D-62…D-64 — FIXED (`stage41-site`); OD-4.6 — DONE (`crm-stage41-wholesale`); решение владельца по поиску — DONE (`crm-stage41-search`); S4-10 — FIXED. Схема CRM v4. Ревью: typescript-reviewer, a11y-architect, seo-specialist, code-reviewer — 0 CRITICAL/HIGH, замечания исправлены (коммиты 4bfacb8, c4740c7, CRM 57e9ef4); click-path-audit пути «главная → заявка → CRM → заказ» — без находок. Снимки до/после — `stage-4.1/screens/`.

<!-- STAGE41_CHECKPOINT_END -->

<!-- STAGE4_CRM_CHECKPOINT_BEGIN -->

## Глобальный этап 4 — CRM, checkpoint 2026-10-16

Статус: **GO этапа 4** при зелёном CI на SHA checkpoint-коммита (SHA и номер CI — в аннотации тегов `rubizh-stage-4-verified` / `crm-stage-4-verified`; свой SHA коммит содержать не может). Production — **NO-GO** до закрытия `docs/release/PRE_LAUNCH_BLOCKERS.md` и выполнения `docs/crm/16-CRM_GO_LIVE_CHECKLIST.md` по решению владельца. Merge не выполнялся.

| Объект | SHA / ветка |
|---|---|
| SITE | `hardening/stage-4-crm` (от `rubizh-stage-3-verified` = `6c0b15c`); последний код+тесты до checkpoint — `5102e82`; push в `origin` (lieverifying/rubizh) |
| CRM frontend | `hardening/stage-4-crm` = `1f9b1080ba1b49c453c0616b0a6ed1aa7fb66a2c` (от `work` = `b0e2f93`); push в alexalixmanov-del/crm.rubizh; закреплён в `.github/workflows/ci.yml` |
| PIM (только чтение) | `fix/pimc-p1` = `5fd46cb6fcd32fe628e8ccd0c9ebe4f4c998b055`; 684/684 на копии `git archive` |

**Проверки.** Полная регрессия SITE на финальном коде — 564 теста (macOS): все зелёные, кроме #49 (зелёный отдельным прогоном с `RZ_DISABLE_CURL=1`) и #439 SEC-01 (только macOS; на Linux CI зелёный); 3 skip — только Linux. 12/12 E2E. Матрица CRM 3 движка × 7 ширин × 2 темы, axe 0, клавиатура. 50 000 заказов ≤ 500 мс (максимум 312 мс; условия — 07). Lighthouse CRM — 07. Обновление/откат поверх RC1 и 3 кандидатов production — 4/4. gitleaks 0, npm audit 0 (оба репозитория). Независимые ревью: code-reviewer, security-reviewer (2 прохода + финальный проход по изменениям после слепого ревью — 0 CRITICAL/HIGH/MEDIUM), payments.

**Реестр:** D-50…D-54 FIXED, D-61 (владелец) FIXED, D-55…D-60/D-62/D-63 — BLOCKED (текст не получен, OD-4.9); собственные: S4-01…S4-09, PERF-4.1…PERF-4.4, A5-01, DEP-01, R4-01…R4-24 (R4-14, R4-15 — LOW, документированы). Решения владельца: OD-4.1…OD-4.9 (`docs/crm/01-CRM_ARCHITECTURE.md`). Перенесено на этап 5: **CRM-5.1** (WebKit сообщает оборванные навигацией загрузки как ошибки страницы; в матрице — задокументированное ослабление).

<!-- STAGE4_CRM_CHECKPOINT_END -->

<!-- STAGE3_RC1_CHECKPOINT_BEGIN -->

## Глобальный этап 3 — стабильный RC1, checkpoint 2026-10-14

Статус: **GO этапа 3** (production — **NO-GO** до закрытия `docs/release/PRE_LAUNCH_BLOCKERS.md`, PL-1…PL-4). Ветка `release/rc1` от `rubizh-stage-2-verified`; PR #2 `release/rc1 → main` открыт **без merge**. Теги `rubizh-stage-3-verified` и `rubizh-rc1` — на одном doc-only checkpoint-коммите после SUCCESS его CI (SHA/CI коммита-checkpoint фиксируются в аннотации тегов и итоговом отчёте — свой SHA коммит содержать не может).

| Объект RC1 | SHA |
|---|---|
| SITE код приложения / пакет | `24e27c41fd42dea736515308ce0b31412c2be64b` (после него меняются только `tests/`, `docs/`, `downloads/`) |
| SITE финальный код+тесты | `92c827e9d233b02f925bbeccfa48c16d04d583c3` |
| PIM (read-only) | `fix/pimc-p1` = `5fd46cb6fcd32fe628e8ccd0c9ebe4f4c998b055` |
| CRM frontend (read-only) | `b0e2f9359a05ec835a83d64bb9bcdc2c97487a50` |
| Пакет | `downloads/Rubizh-rc1.zip`, SHA-256 `7a63d9eb8fd93c0d19c3b6b20dd5340a7549b1bd7b4c976cdae2fbe59abec516`, 430 файлов, воспроизводим байт-в-байт |

Синхронизация: SITE `2a338da` → `6311e40` (fast-forward), `rubizh-stage-2-verified^{}` = `6311e40`, `rubizh-stage-1-verified^{}` = `51c83d8`; PIM `claude/amazing-meitner-e6572n@2119846` → `fix/pimc-p1@5fd46cb`. Базовая линия на `6311e40` (macOS): 497 тестов, 491 pass, 3 skip (Linux-only: scheduler/flock, 2 × deploy GNU), 3 fail — 2 среды (Homebrew PHP со встроенным curl: `audit-fixes` проходит с `RZ_DISABLE_CURL=1`, `SEC-01` — только Linux) и 1 таймаут под параллельной нагрузкой (`order-idempotency`, в изоляции PASS); на Linux CI этапа 2 — 497/497.

Изменения кода этапа 3 (без новой функциональности): `847d4c0` RC3-01 (дефект 4.5: архив содержал `.github/`, `.gitignore`, `*.mjs`; `contracts/`, `cache/`, `RELEASE-MANIFEST.json`, `*.tmp` читались по HTTP) — regression-first (RED на `6311e40`), Apache 2.4-проба, независимое ревью `ecc:code-reviewer` APPROVE + `ecc:security-reviewer` без блокеров; `24e27c4`, `92c827e` — тест 4.4 (ревью APPROVE).

| Пункт | Статус | Файл / коммит |
|---|---|---|
| 1 Синхронизация | DONE | выше |
| 2 PRE_LAUNCH_BLOCKERS | DONE (PL-1…PL-4 OPEN — решения владельца) | `docs/release/PRE_LAUNCH_BLOCKERS.md` |
| 4.1 Манифест | DONE | `docs/release/RC1_MANIFEST.md` |
| 4.2 Контракты | DONE | `docs/release/CONTRACTS.md` |
| 4.3 Конфигурация | DONE | `docs/release/CONFIG.md` |
| 4.4 Обновление поверх production и откат | DONE; точная версия production — BLOCKED(owner) PL-4.6/4.7, отрепетированы все 3 кандидата | `tests/rc1-upgrade-rollback.test.mjs` |
| 4.5 Пакет | DONE (дефект RC3-01 исправлен) | `847d4c0`, `downloads/Rubizh-rc1.zip` |
| 4.6 Go-live | DONE | `docs/release/GO_LIVE_CHECKLIST.md` |
| 4.7 Бэкапы | DONE (процедура); production-бэкап не передавался → PL-4.1 | чек-лист шаги 2–3 |
| 4.8 Known issues | DONE | `docs/release/KNOWN_ISSUES.md` |
| 4.9 Changelog | DONE | `docs/release/CHANGELOG_RC1.md` |
| 4.10 Main | DONE: автодеплоя нет → PR #2 без merge | https://github.com/lieverifying/rubizh/pull/2 |
| 4.11 Документы | DONE | `docs/README.md`, этот файл, `SESSION_HANDOFF.md`, `08-RELEASE_READINESS.md` |

**Обновление и откат (4.4)** — для каждого кандидата production `b442eb7`, `b1662de`, `9788a9e` (архив установщика `0e7dafa` = дерево `9788a9e`, 337 файлов): 46 таблиц, 17 заказов во всех состояниях заказа/оплаты/отправки/резерва/счёта, 2 клиента + гость, менеджер из конфига; бэкап `mysqldump` (≈128 КБ); P0 из пакета → `deploy-update.sh` (430 файлов, хеши = манифест) → окно между заменой кода и миграциями (витрина/sitemap/кабинет 200, Staff API 503) → prepare-runtime, PIM v3, CRM, NP recovery, R4 reconcile (2 освобождены), backfill CRM (17 legacy: 13 safe, 3 ambiguous, 1 conflict — неоднозначные не применяются). Сверка: 45 таблиц — 0 потерянных/изменённых строк (единственное изменение типа — цены `int`→`DECIMAL(14,2)`, значения равны; `meta.schema` 3→4); добавлена 1 строка timeline при открытии legacy-заказа в кабинете; +26 таблиц, 6 триггеров. R4: 1007/1008/1009 RELEASED, оплаченные COMMITTED, открытые ACTIVE. R5: попытка без id → failure/failed, известный счёт → created/pending, `success` банка → awaiting_webhook (не paid). Кабинет: 3 своих старых заказа открываются, чужой — нет; CRM: 17/17 старых заказов. Повтор миграций: 71 таблица, 0 изменений. Откат: дерево кода = исходное (475 файлов байт-в-байт), старый код работает на мигрированной схеме, после пересоздания БД и восстановления дампа 46/46 таблиц равны исходным.

| Quality Gate (финальный код) | Результат | Этап 2 для сравнения |
|---|---|---|
| CI на точном SHA | `92c827e`: push [38625368576](https://github.com/lieverifying/rubizh/actions/runs/38625368576) и PR [38625487655](https://github.com/lieverifying/rubizh/actions/runs/38625487655) SUCCESS, PHP 8.2/8.3, **501/501, fail 0, skip 0**; `24e27c4`: [38620244608](https://github.com/lieverifying/rubizh/actions/runs/38620244608) SUCCESS 501/501 | 497/497 |
| Полный SITE локально (macOS, `24e27c4`) | 501: 496 pass, 3 skip (Linux-only), 2 среды (curl) — те же, что в базовой линии; тест 4.4 PASS на macOS с GNU coreutils | — |
| PIM `5fd46cb` | 684/684 + dry-run 49/49; сборка `rubizh_pim.html` и wire-фикстура байт-в-байт; архив 10.9.3 пересобран идентично (`53e81757…`) | 684/684 |
| Contract-тесты | в составе 501 (PIM v3 sync/foundation/checkout/enable, legacy R1, CRM, MonoPay, НП) — `docs/release/CONTRACTS.md` §4 | — |
| Браузерная матрица (05) | Chromium/Firefox/WebKit × 360/390/430/768/1024/1280/1440: 315 загрузок, 0 JS-ошибок, 0 overflow, 0 битых изображений, 21 ожидаемых 404 (страница 404); покупка до MonoPay-заглушки 21/21; COD нигде (единственное совпадение — фраза «Післяплати немає» в оферте) | 336 загрузок / 21 покупок |
| Кабинет / ADDENDUM | кабинет 12/12 (3 движка × 4 ширины; чужой заказ 404, утечки нет; Firefox 768/1280 сначала получили 428 — лимит R8 на одном адресе 127.0.0.1 в общем прогоне, повтор на свежем стенде 4/4; см. PL-1); ADDENDUM 211 проверок, 0 ошибок/overflow | 21/21, 210/210 |
| axe | 30 проверок, **0 нарушений** WCAG 2.1 A/AA; 140 inventory-флагов и 29 «dead-click» кандидатов — информативно, не сертификация | 32 / 0 / 109 |
| Lighthouse | Код приложения идентичен runtime-SHA этапа 2 `f2264c6` (отличаются только `.htaccess` и `dev/package-release.py`) → парные сжатые замеры этапа 2 действуют без изменений (mobile 54/51/57/51, LCP 5,75–7,42 с). Справочно локально (macOS, PHP dev-сервер **без сжатия**, не сравнимо с этапом 2): mobile perf 62–63, LCP 10,7–12,1 с; desktop 88–91, LCP 1,9–2,1 с; a11y 99–100, SEO 100 | PL-2 |
| RBAC/IDOR/CSRF | в составе 501: `q5-manager-rbac`, `idor-orders`, `crm-security`, `crm-domain`, `stage2-r9-auth-csrf`, `stage2-r9-critical-gate`, `stage2-r8-limits` — PASS | R9 24 686/24 686 |
| gitleaks | 2 коммита этапа 3: 0; рабочее дерево: 3 известные синтетические фикстуры тестов (как на этапе 2), реальных секретов 0 | 0 подтверждённых |
| npm audit | SITE 0; PIM 1 moderate (ajv, без изменений); composer не используется | то же |
| Обновление/откат | PASS ×3 кандидата (выше) | синтетическая репетиция |
| Независимое ECC-ревью | `ecc:code-reviewer` APPROVE ×3 (пакет, тест 4.4, окно); `ecc:security-reviewer` — 0 CRITICAL/HIGH, MEDIUM RC3-01 исправлен, прочее → RC3-02…07; `ecc:architect` — сверка документов, исправления внесены | — |

GO этапа 3 выполнен: синхронизация, PRE_LAUNCH_BLOCKERS, манифест/контракты/конфигурация/чек-лист, обновление и откат без потери данных, воспроизводимый пакет, Quality Gate зелёный, CI success. Открыты (допустимо): PL-1…PL-4. К этапу 4 без указания владельца не переходить.

<!-- STAGE3_RC1_CHECKPOINT_END -->


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

Предварительный CI38415388496 на ebc5e83 завершился FAILED: PHP8.2/8.3, 488/487/1. Причина — реальный native-form `Origin:null` при `Referrer-Policy:no-referrer`, а не SMS fixture. Проверенное исправление2e78b98 сохраняет CSRF и допускает opaque origin только при `same-origin/navigate/document`; historical exact code CI38459393928 SUCCESS не заменяет CI окончательного SHA. Дополнительный R5 follow-up bcb3c2f прошёл независимое review и регрессии исходного срока оплаты; финальные gates приведены в таблице. Детали неразрешённых HIGH не публикуются.

Production **NO-GO** сохраняется: завершение этапа 2 не разрешает deploy или этапы3–6. Живые bank/НП/SMS/mail/OAuth и сквозной provider E2E — **DEFERRED → этап6**, а не PASS. Все локальные деньги/заказы/сессии и ответы провайдеров синтетические; production данные, импорты, поставщики и AUTOPRICES не использовались.

R8: default `trusted_proxies=[]` проверяется кодом; только значение хостинга остаётся **BLOCKED(owner)** до ответа хостинга. Прочие OWNER DECISION не изменены. QA-20 исторический риск принят владельцем (**ACCEPTED, nonblocking**); current redaction не исправляет уже опубликованную историю, force/history rewrite не выполнялись. Перед production обязательна отдельная смена `pim_key`/`cron_key` и проверка отказа старым ключам.

CRM dependency `b0e2f9359a05ec835a83d64bb9bcdc2c97487a50` read-only; CRM-SEC-FRESH-01/CRM-PHP-01/CRM-FE-01 остаются на этапе4. PIM: только утверждённый R7/PIMC-P1 на `5fd46cb6fcd32fe628e8ccd0c9ebe4f4c998b055`, exact PIM CI38329162970 SUCCESS на неизменённом PIM SHA; прочие PIM предложения/зависимости не менялись. PIM baseline682 и final684 не взаимозаменяемы. Варианты performance B/C не реализованы; production CWV/p75/capacity и настоящие мобильные устройства не сертифицированы.

<!-- STAGE2B_FINAL_CHECKPOINT_END -->


## Исторические результаты до этапа 2-B


Правило владельца (2026-10-11): после каждого этапа — проверенная контрольная точка; тег только если все обязательные проверки зелёные на одном HEAD, включая CI для точного SHA. Теги — только локально; публикация тегов в GitHub, merge и deploy запрещены.

**Исправление (указание владельца 2026-10-11).** Прежняя запись «этапы 1–6 = фазы 2–7 ADDENDUM №2, подтверждено владельцем» была **неверной**: владелец такого не подтверждал. Фазы ADDENDUM №2 и глобальные этапы проекта — разные вещи. Предложение создать теги `rubizh-stage-1…6-verified` на одном коммите отменено; такие теги локально не создавались (проверено `git tag -l 'rubizh-stage-*'` перед созданием тега этапа 1 — пусто).

## Глобальные этапы проекта

| Этап | Содержание | Статус | Проверенный SHA | Тег (локальный) |
|---|---|---|---|---|
| 1 | Завершение SITE: hardening, Q-4…Q-7, Quality Gate | **VERIFIED** | `f50dc50` (код), тег на checkpoint-коммите | `rubizh-stage-1-verified` |
| 2 | Независимый multi-agent аудит SITE + PIM | **CHECKPOINT / INCOMPLETE / NO-GO** | `e9ce24dffb41751b8e08b13b4dff5a5c6056d203` (code; doc-only checkpoint follows) | не создан |
| 3 | Стабильный release candidate | не начат | — | — |
| 4 | Завершение CRM | не начат | — | — |
| 5 | Импорт пяти поставщиков | не начат | — | — |
| 6 | Финальный E2E всей системы (включая живые проверки В-1…В-4, DEFERRED с этапа 1) | не начат | — | — |

## Глобальный этап 1 — завершение SITE (2026-10-11)

**Проверенный код: `f50dc50`** (код продукта идентичен `3327862`; `f50dc50` меняет только тесты). Checkpoint-коммит с документами — поверх него; тег `rubizh-stage-1-verified` — на checkpoint-коммите после CI success на его точном SHA. PIM `21198461f8ebb2eadef6dcd6fb77a50a8a038ea9` (не изменялся). CRM не изменялся.

| Задача | Статус | SHA | CI |
|---|---|---|---|
| Q-6 защита SMS-входа | DONE | `fd3430d`, `27aa3a0` → `8afd937`; `17f9c67` | 38156005947, 38163957374 — success |
| Q-7 подтверждённое наличие → MonoPay; контракт webhook; идемпотентность | DONE | `d7554bf`; `cd58e3b`, `e59a693`, `3327862` | 38157095357, 38166010267, 38166971893, 38168415309 — success |
| Q-5 RBAC, повторный вход, версия заказа, аудит, CSRF | DONE | `c90192d`; `17f9c67`, `cd58e3b` | 38158149167, 38163957374, 38166010267 — success |
| Q-4 предзаказ v3 после подтверждения менеджера | DONE | `f69bb0d` | 38159041894 — success |
| Несколько посылок | DONE (анализ) | — | — |
| Quality Gate | DONE | `f50dc50` | 38170904075 success |

| Проверка | Результат |
|---|---|
| Полная регрессия (`npm test`: unit, integration, contract, E2E Playwright) на `f50dc50` | 351 тест: 347 pass, 4 fail — известные ограничения окружения macOS (`Deployment preserves…`, `Scheduler…`, `Small patch…` — Linux-скрипты; `fixture migration rehearsal` — CRM), на Linux CI зелёные (run 38156005947: ok 91/54/92/84) |
| CI GitHub на точном SHA | `f50dc50` — run 38170904075 **success**; checkpoint-коммит (только документы) — отдельный run, см. итоговый отчёт / `git log` |
| Browser QA, Chromium/WebKit/Firefox × 360/390/430/768/1024/1280/1440 (код `3327862` = `f50dc50` без тестов) | витрина 315/315 загрузок (главная, каталог, категории, поиск, карточка, предзаказ, комплект, вход, оферта, 404…) — горизонтального скролла 0, JS-ошибок 0, битых изображений 0; покупка (цвет → размер → корзина → checkout → MonoPay-stub) 21/21 (один прогон Firefox 1440 упёрся в лимит заказов с одного адреса — защита работает; повтор отдельно: PASS); кабинет, конструктор комплекта, фильтры, заказ — 210/210; кабинет A↔B 12/12 |
| Accessibility | axe WCAG 2.1 A/AA: 0 нарушений (30 проверок); мёртвых кнопок 0/29; инвентарь элементов 140 проверок — 0 проблем; Lighthouse a11y 99–100 |
| SEO | Lighthouse SEO 100 на всех страницах; robots/canonical/JSON-LD — тесты |
| Security | RBAC, повторный вход, версия заказа, CSRF — q5/p0; IDOR A↔B (статус, повтор, оплата, отмена, скрин, кабинет) — нарушений нет; секреты в истории git (gitleaks 8.30.1, 108 коммитов): 3 срабатывания — синтетические значения тестовых фикстур, приватные конфиги в истории отсутствуют |
| Mobile Performance (Lighthouse, медиана 3 прогонов, сервер с brotli как production + кеш по .htaccess) | до: главная 73, каталог 72, товар 76, комплект 74 → после: 74 / 73 / 75 / 74 (разница в пределах разброса прогонов). Без сжатия (php -S): 54–59. Desktop: 83–89. 80 недостижимо без смены архитектуры — PERF-1 → аудит этапа 2 |
| Production (1 разрешённый запрос заголовков) | `content-encoding: br`, `cache-control: no-cache` (HTML), `server: nginx`, HSTS |
| Независимый ECC code review | 4 прохода (весь этап 1; `f69bb0d..cd58e3b`; `e59a693`; `3327862`): CRITICAL/HIGH — 0; все MEDIUM исправлены (RV-10…RV-17), LOW — исправлены или приняты (RV-14 доработан, RV-16 accepted) |

**Живые внешние проверки** (HTTPS webhook, тестовая карта, реальная SMS, тестовая ТТН, В-1…В-4): **DEFERRED → этап 6**. BLOCKED-пунктов на этапе 1 нет.

**Восстановление:**

```sh
cd ~/Projects/rubizh && git fetch origin && git checkout rubizh-stage-1-verified
cd ~/Projects/pim.rubizh && git checkout 21198461f8ebb2eadef6dcd6fb77a50a8a038ea9   # PIM той же точки (read-only)
# тестовое окружение — SESSION_HANDOFF.md, «Восстановление стенда»
```


## ADDENDUM №2, фазы 2–7 — закрыт отдельно (тег `rubizh-addendum2-phases2-7-verified` → `bbc989a`)

Фазы ADDENDUM №2 (главная, инструкция конструктора, UX конструктора, каталог, кабинет, соцсети) — не глобальные этапы. История их проверки ниже.

## Сводка

| Фаза ADDENDUM №2 | Содержание | Коммит реализации | Статус | Тег |
|---|---|---|---|---|
| 2 | Главная: одна CTA, кнопки, пустой поиск (A-1…A-4) | `7b4aa86` | INCOMPLETE (нет CI для SHA) | — |
| 3 | Инструкция конструктора (K-1) | `a33613e` | INCOMPLETE (нет CI для SHA) | — |
| 4 | Удобство конструктора (K-2…K-10) | `1998ef0` | INCOMPLETE (нет CI для SHA) | — |
| 5 | Каталог: поиск, пустые результаты (C-1…C-4) | `f032253` | INCOMPLETE (нет CI для SHA) | — |
| 6 | Кабинет 2.0 (P-1…P-7) | `41786ac` | INCOMPLETE (нет CI для SHA) | — |
| 7 | Соцсети в футере (S-1) | `7b4aa86` | INCOMPLETE (нет CI для SHA) | — |
| gate | Исправления по независимому ревью и QA | `62d7d52`, `0a8dc24`, `98ef261` | — | — |

**Проверенный код фаз 2–7: `98ef261`** (дата 2026-10-11). PIM: `21198461f8ebb2eadef6dcd6fb77a50a8a038ea9` (без изменений, чистое дерево). CRM: не подключён; код CRM не менялся.

Последний CI: `3326514` — success (до ADDENDUM). Для `98ef261` CI не запускался: требуется push.

## Результаты gate на `98ef261`

- Unit/integration/regression: `npm test` 325 → 321 pass, 4 fail (ограничения окружения macOS, идентичны `59b4685`).
- Browser QA: витрина 540/540 + покупка 9/9 (3 движка); кабинет 12/12; экраны ADDENDUM 140/140 (Chromium + WebKit, 360–1440).
- Security: независимый ECC code review — P0/P1 нет; RV-1 (P2), RV-2 (P3), RV-3 (P3), RV-4 (P2) исправлены regression-first.
- Accessibility: axe — 0 нарушений (30 проверок). SEO: Lighthouse 100. Performance: desktop 82–85, mobile 55–59 (php -S без сжатия).
- Интеграции: PIM v3 тесты зелёные (PIM не менялся); CRM-тесты SITE зелёные кроме migration (окружение).
- Исправлено в ходе фаз: D-36…D-39, RV-1…RV-4 (см. 03).
- Ограничения: live MonoPay/НП/SMS не проверялись; RV-4 требует sandbox monobank.
- Не проверено: реальные устройства, реальные пользователи, production-подобный сервер.

## Решение по фазам 2–7 (история): **INCOMPLETE** до push

Единственный невыполненный обязательный пункт — CI для точного SHA. После разрешения на push: `git push origin hardening/site-release-20261011` → CI для итогового SHA → при success создать annotated тег на проверенном коммите и (с отдельного разрешения) отправить теги.

## Восстановление этого состояния

```sh
cd ~/Projects/rubizh && git fetch origin
git switch hardening/site-release-20261011
git checkout 98ef261            # проверенный код фаз 2–7 ADDENDUM №2 (detached HEAD)
# окружение тестов и QA: docs/release-hardening/SESSION_HANDOFF.md, раздел «Восстановление стенда»
cd ~/Projects/pim.rubizh && git checkout 21198461f8ebb2eadef6dcd6fb77a50a8a038ea9   # PIM той же точки (read-only)
```

## Итог checkpoint (2026-10-11, после разрешения на push)

- Push: `3326514..bbc989a` (без force, без merge).
- **CI:** SITE CI run `38149516196` на точном SHA **`bbc989aa902700e41c29adaa42d0b70bd8ccd855`** — **success** (job `test`).
- **Статус фаз 2–7 ADDENDUM №2: VERIFIED.** По решению владельца — **один** локальный annotated tag на общую проверенную версию (не шесть тегов на один коммит): **`rubizh-addendum2-phases2-7-verified`** → `bbc989aa902700e41c29adaa42d0b70bd8ccd855`. Тег в GitHub **не отправлен** (нужно отдельное разрешение).
- Код этого коммита = проверенный `98ef261` + документы checkpoint.
- Система целиком **не production-ready**: блокеры B-2…B-5 в `08-RELEASE_READINESS.md` (B-1 закрыт для этого SHA).
- Восстановление: `git checkout rubizh-addendum2-phases2-7-verified` (PIM: `21198461f8ebb2eadef6dcd6fb77a50a8a038ea9`).

## Промежуточная запись Q-6 (история; итог — в разделе глобального этапа 1)

| Пункт gate | Результат |
|---|---|
| Реализация | `fd3430d` (Q-6), `27aa3a0` (исправления ревью), тест P-6 стабилизирован (`HEAD` ниже) |
| Полный `npm test` | 334 → 329 pass; 4 — ограничения окружения macOS (как на `59b4685`); 1 — нестабильный P-6 из-за hash-навигации в тесте, исправлен и стабилен (3 прогона под нагрузкой, 51/51) |
| Browser QA | витрина 540/540 + покупка 9/9 (3 движка); кабинет 12/12; SMS-проверка в браузере — тест |
| Security / независимый ревью | P0/P1 нет; RV-5 (P2), RV-6, RV-7 исправлены; RV-8, RV-9 приняты с обоснованием (03) |
| Интеграции | monobank sandbox 6/6 и Nova Poshta readonly 5/5 через код SITE (`INTEGRATION_TEST_READINESS.md`); TurboSMS — readonly + mock |
| CI для точного SHA | **не выполнен** — нужен push (разрешение владельца) |
| P0 / блокирующие P1 | нет |

Статус на момент записи: INCOMPLETE (только CI). Позже: CI success на `8afd937` (run 38156005947) → Q-6 DONE.


## Глобальный этап2 — итоговый checkpoint2026-10-13 Europe/Kyiv: NO-GO

Code `e9ce24dffb41751b8e08b13b4dff5a5c6056d203`, branch `hardening/stage-2-audit-fixes`; baseline tag51c83d808228a26328081b02211b4e3605353755. Main не использован/не изменён. PIM21198461f8ebb2eadef6dcd6fb77a50a8a038ea9; CRM dependencyb0e2f9359a05ec835a83d64bb9bcdc2c97487a50; оба tracked source clean/read-only; SITE staff/api-staff unchanged.

| Quality Gate | Реальное доказательство |
|---|---|
| Linux baseline |351/351 PASS,0FAIL/SKIP; tag CI38173980266SUCCESS, f50 code38170904075SUCCESS |
| Final full local |450/450 PASS;0FAIL/SKIP/CANCELLED;626167ms on1fcca317, identical app/tests in e9ce24d; standalone capacity1/1PASS |
| CI |Prior1fcca run38304082586SUCCESS;2c06cde run38306094757FAIL PHP8.3; schedulinge9 run38307425169 SUCCESS PHP8.2/8.3. Exact final checkpointCI result after push in final response/metadata; all450 tests+pipefail/nonempty/zeroFAIL/SKIP retained |
| Three browsers /7widths |315/315 pages+21/21 purchases; ADDENDUM210/210, cabinet21/21; unexpectedJS/overflow/brokenimages0; expected synthetic404 consoles separately recorded |
| PIM unchanged |682/682 PASS,0FAIL/SKIP; proposals not applied |
| Q8 / D11 |Originalee ancestor PASS;31historical cases25red/6controls, finalfocused23/23; qty/N/mode follow-up approved; rules/examples in10 |
| axe / Lighthouse |30/30 WCAG2.1 A/AA checks0violations,111inventory flags;32paired compressed Lighthouse runs0errors; mixed score/time deltas, performance threshold not claimed PASS |
| Scoped review |Payments/changes/QA fixes independently approved, late financial/recovery/email findings closed; fresh whole SECURITY source review completed with explicit limits |
| Restore |61tables/2triggers, restored rows equal; private configuration/media preservation; synthetic only |
| Local integrity |151PHP syntax checks PASS; frozen SITE npm audit0; Stage2 gitleaks0(code span), final checkpoint span checked after commit |

Единый03:127 finding rows,36 FIXED; confidence/status/duplicates explicit. Неисправленные HIGH публикуются только ID/severity; подробности остаются private. §7 owner proposals в04; PIM/CRM patches unapplied. Existing03/02/04/05/07/08/09/10/SESSION updated, new report/proposals onlystage-2/. [Полный10-раздельный итоговый отчёт](stage-2/FINAL_REPORT.md).

**NO-GO:** fresh whole SECURITY source review COMPLETED; broader runtime limits explicit; exhaustive dynamic endpoint/method/role traversal not certified. Сохранённые runtime/coverage limits и нарушение исторической приватности не закрываются selected suites или CI. Performance medians retain mixed deltas; productionp75/capacity UNMEASURED. Stage2 verified tag не создан, tag не опубликован, merge/deploy/Stage3 не выполнялись. Live provider E2E DEFERRED→Stage6, не PASS. Approved API/browser networking and normal branch push actually worked, corresponding BLOCKED(network) снят.

Этот commit меняет только документы, app/test/workflow bytes совпадают с указанным codeSHA. Собственный checkpoint SHA нельзя включить в сам commit; после push exact SHA/CI result фиксируются в final response и `/workspace/onboarding/rubizh/reports/checkpoint-ci.json`. Until that evidence, exact checkpoint CI is not claimed successful by this file.

Cloud install_script/start_skill tested and saved; final complete repository membership saved with actual mounts/exact HEADs after checkpoint. User review/save/publish in environment settings activates saved draft; new-task restoration not verified. Startup uses `/workspace/onboarding/rubizh/start.sh` +functional smoke, no live processes assumed restored. Optional marker/age/activity-checked cleanup helper preserves all fixture DB schemas/reports.


**Ограничение приватности:** GitHub repository visibility проверено как public. Унаследованный commit2a338da содержит исходные HIGH raw; обычный push сохранил эти версии в истории. Текущие документы редактированы, новые полные доказательства остаются local/private, но обещать приватность исторических raw нельзя. История не переписывалась: force-push запрещён владельцем. QA-20 MEDIUM / OWNER DECISION фиксирует процессный дефект; cleanup требует отдельного решения и не отменяет уже случившуюся публикацию. Технические подробности неразрешённых HIGH здесь не повторяются.

Final endpoint Quality Gate:132inventory rows,1920HTTP requests;831/831explicit expectations,2697/2697overlapping semantic checks,975snapshots+2A↔B whole-domain comparisons;0final assertion failures. ANY232/232 and narrowaction36/36; all inventory endpoints requested, full state/role/token combinations remainPARTIAL. Details and limits:stage-2/endpoint-quality-gate.md. Fresh SECURITY source review COMPLETED(15checks+1probe), no newHIGH/CRITICAL; MEDIUM SEC-FRESH-01 unapplied CRM proposal. OverallNO-GO: exhaustive dynamic certification and historical privacy requirement unmet, noStage2verifiedtag/Stage3.
