# 08 — RELEASE READINESS

Дата: 2026-10-11. Ветка `hardening/site-release-20261011`. **Глобальный этап 1 (SITE) — проверенный код `f50dc50` (код продукта = `3327862`)**; PIM `21198461f8ebb2eadef6dcd6fb77a50a8a038ea9` (не изменялся); CRM не изменялся (CRM-тесты SITE зелёные).

**Терминология (исправлено по указанию владельца 2026-10-11).** Глобальные этапы проекта: 1 — завершение SITE (hardening, Q-4…Q-7, Quality Gate); 2 — независимый multi-agent аудит SITE + PIM; 3 — стабильный release candidate; 4 — завершение CRM; 5 — импорт пяти поставщиков; 6 — финальный E2E всей системы. Фазы 2–7 ADDENDUM №2 — отдельная, уже закрытая работа (тег `rubizh-addendum2-phases2-7-verified`), они **не** равны этапам 1–6. Тег `rubizh-stage-1-verified` = завершение глобального этапа 1; теги этапов 2–6 не создаются, пока эти этапы не выполнены.

## Глобальный этап 1 (SITE): **GO** (для перехода к этапу 2; не production)

| Задача | Статус | SHA | CI |
|---|---|---|---|
| Q-6 защита SMS-входа | DONE | `fd3430d`, `27aa3a0` (CI на `8afd937`); доработка `17f9c67` | 38156005947 success; 38163957374 success |
| Q-7 подтверждённое наличие → MonoPay, контракт webhook, идемпотентность | DONE | `d7554bf`; доработки `cd58e3b`, `e59a693`, `3327862` | 38157095357; 38166010267; 38166971893; 38168415309 — success |
| Q-5 RBAC, повторный вход, версия заказа, аудит, CSRF | DONE | `c90192d`; доработки `17f9c67`, `cd58e3b` | 38158149167; 38163957374; 38166010267 — success |
| Q-4 предзаказ v3 после подтверждения менеджера | DONE | `f69bb0d` | 38159041894 success |
| Несколько посылок | DONE (анализ; данные реальные, отображение оставлено, схема не менялась) | — | — |
| Quality Gate | DONE | `f50dc50` | 38170904075 success |

Живые внешние проверки (HTTPS webhook, оплата тестовой картой, реальная SMS, тестовая ТТН, В-1…В-4) — **DEFERRED → этап 6** (решение владельца), не PASS и не BLOCKED.

## Quality Gate на `f50dc50`

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


## Блокеры

**Этапа 1:** нет (BLOCKED-пунктов нет).

**Production (вне этапа 1, решение NO-GO для production сохраняется):**


Код ветки готов к финальной проверке, но выпуск в production блокируют пункты ниже. Ни один из них не требует переделки уже сделанного.

| # | Блокер | Что нужно | От кого |
|---|---|---|---|
| B-1 | ~~CI для точного SHA~~ — **закрыт** для `bbc989a` (run 38149516196 success); повторяется для каждого нового HEAD | push по разрешению | — |
| B-2 | ~~Q-4…Q-7 не реализованы~~ — **закрыт** на этапе 1 | — | — |
| B-3 | Правила комплекта (Q-8) | согласование `10-KIT_RULES_PROPOSAL.md` | владелец |
| B-4 | Live-проверка MonoPay / Nova Poshta / SMS, включая реакцию `invoice/remove` на `failure` (RV-4) | **DEFERRED → этап 6** | владелец (В-1…В-4) |
| B-5 | Баннеры 19 категорий (D-09) | файлы по `11-BANNER_PROMPTS.md` | владелец |
| B-6 | Mobile Lighthouse ниже 80 (PERF-1): ~200 КБ JS рисуют первый экран | аудит этапа 2 (PERF-2.1) | работа |

Не блокеры (решение владельца, можно после релиза): D-22/Q-9 удаление 38 неиспользуемых файлов (`09-ASSET_INVENTORY.md`), D-23 разрешение баннеров, D-34 (б, в) шапка, D-35 логирование ошибки кабинета, минификация JS (07 §5).

## История: что было подтверждено на `98ef261` (ADDENDUM №2, до этапа 1)

| Проверка | Результат |
|---|---|
| Полный `npm test` (325) | 321 pass; 4 fail — те же ограничения окружения macOS, что и на исходном `59b4685` (`Deployment preserves…`, `Scheduler…`, `Small patch…` — Linux-скрипты; `fixture migration rehearsal` — CRM, в CI зелёный) |
| Витрина (`qa-matrix`) | 540/540 загрузок (Chromium, WebKit, Firefox × 12 ширин × 15 страниц) без ошибок/overflow; покупка до заказа 9/9 |
| Кабинет (`qa-cabinet`) | 12/12 (3 движка × 4 ширины), IDOR нет, отменённая ТТН скрыта |
| Изменённые экраны ADDENDUM (`qa-addendum`) | 140/140 (Chromium + WebKit × 7 ширин × 10 экранов), включая распознавание экрана ошибки |
| Accessibility (axe WCAG 2.1 AA) | 0 нарушений на 30 проверках |
| SEO | Lighthouse 100; robots, canonical, JSON-LD Product/Offer/BreadcrumbList — тесты |
| Performance | Lighthouse desktop 82–85 / mobile 55–59 на `php -S` без gzip (production сжимает и кеширует) |
| Security | независимый ECC code review: P0/P1 нет; RV-1…RV-4 исправлены; новых endpoint’ов нет |
| SITE ↔ PIM | pim-v3-* тесты зелёные; PIM прочитан, не изменён |
| SITE ↔ CRM | crm-domain/security/confirmation/shipping/browser зелёные (кроме migration — окружение) |
| P0 / блокирующие P1 | открытых нет |

## Не проверено

- Реальные устройства iOS/Android (только движки Playwright).
- Live MonoPay / Nova Poshta / SMS-провайдер.
- Реальный каталог и фото на стейджинге за Apache (Lighthouse на production-подобном сервере).
- Пользовательское тестирование конструктора на реальных участниках (только сценарная экспертная проверка).

## Глобальный этап 2 — 2026-10-12 UTC: **INCOMPLETE / production NO-GO** (checkpoint)

Исторический GO этапа 1 выше относится к его закреплённому коду и переходу к аудиту. Он не подтверждает текущий release candidate. Исходный независимый аудит: SITE `51c83d808228a26328081b02211b4e3605353755`; итоговый код после поздних коррекций и повторной browser matrix: `e9ce24dffb41751b8e08b13b4dff5a5c6056d203`.

PIM остаётся `21198461f8ebb2eadef6dcd6fb77a50a8a038ea9`; отдельный CRM-репозиторий — read-only. Ни merge/deploy, ни production-миграции, ни provider activation, ни удаление assets не выполнялись и этим документом не разрешаются.

| Gate | Проверенное доказательство | Текущий итог |
|---|---|---|
| Linux baseline SITE | **351/351 pass; 0 fail/skipped** (`baseline-compatible.tap`) | PASS для исходной базы |
| Первый полный SITE regression | **435/435 pass; 0 fail/skipped** (`final-regression.tap`) | PASS до поздних изменений; новый итог `450/450 PASS;0FAIL/SKIP/CANCELLED;626167ms, tested1fcca317, identical app/tests in e9ce24d` |
| PIM, без изменений | **682/682 pass; 0 fail/skipped** (`pim-tests.log`) | PASS выбранного read-only workflow; предложения не применены |
| Полная browser matrix | **315/315 загрузок +21/21 потоков**, ADDENDUM210/210, cabinet21/21;3движка×7ширин, final application tree | PASS локального synthetic scope; latest commits QA-only |
| UI/a11y и SEO | Scoped UI/a11y **15/15**, SEO **7/7**, без skipped; дополнительные stock/SKU/canonical сценарии зелёные | PASS в указанном scope; не полная WCAG/provider-сертификация |
| Release / ops rehearsal | Fail-closed artifact/schema/smoke gates; восстановлены **61 таблица и 2 триггера**, исходники/private config/media | Локально проверено; production artifact/backup/scheduler не подтверждены |
| Финальное независимое review | Payment/changes/QA follow-up approved; new whole SECURITY source review COMPLETED | **COMPLETED source review**;15checks+1probe, no blanket dynamic/production PASS |
| CI для точного итогового SHA | Exact schedulinge9 CI PHP8.2/8.3 SUCCESS; final doc-only checkpoint separately | **[38307425169](https://github.com/lieverifying/rubizh/actions/runs/38307425169) SUCCESS on e9ce24d, PHP8.2/8.3; exact final doc-only checkpoint CI checked after push**; старый зелёный CI не заменяет новый |
| Внешние HIGH и решения владельца | Окончательный статус фиксирует координатор в `03-DEFECT_REGISTER.md` | Остаются открытыми; общий GO не выдаётся |

В matrix нет JS pageerror, horizontal overflow и битых синтетических изображений. Ожидаемые console-сообщения HTTP 404 для тестовой отсутствующей карточки сохранены отдельно; их не надо ни скрывать, ни считать JavaScript-сбоем. Проверка выполнялась на локальных fixture-данных с mock-провайдерами; это не реальная покупка.

### Неразрешённые HIGH: публикационный список для завершения реестра

Таблица — итоговый публикационный список, не заключение о подтверждённой эксплуатации. Часть исходных оценок ещё требует подтверждения; уверенность, source references, сценарии и исправления остаются в закрытых доказательствах. Окончательный реестр сверён; private confidence evidence сохранены.

| ID | Severity |
|---|---|
| ARCH-02 | HIGH |
| DB-01 | HIGH |
| DB-02 | HIGH |
| DB-03 | HIGH |
| PAY-02 | HIGH |
| LOG-02 | HIGH |
| PIMC-P1 | HIGH |
| SEC-05 | conditional HIGH |

### Что остаётся после NO-GO checkpoint

1. Fresh whole SECURITY review завершён новым independent agent; соблюдать coverage limits финального dynamic endpoint gate и решить историческую приватностьQA-20.
2. Exact code CI success подтверждён; doc-only checkpoint exact-SHA CI выполняется после push и фиксируется в итоговом ответе/retained metadata.
3. Оставить нерешённые внешние пункты и решения владельца открытыми. Предложения по архитектуре, performance, CGNAT, резервам, наблюдаемости, настройкам, CRM и Q-9 перечислены в `04-ECC_IMPLEMENTATION_PLAN.md`, этап 2 §7; наличие предложений не означает согласие на реализацию.
4. Подготовить новый проверенный release artifact и целевые hosting prerequisites в отдельно разрешённом release-процессе. Нынешний исторический архив намеренно отсекается installer; успешной новой установки не было.

Live HTTPS webhook, sandbox/live оплата, SMS/email, НП/ТТН и финальный E2E всей системы сохраняют статус **DEFERRED → глобальный этап 6**. Они не являются PASS или текущим выполненным deploy. Этапы 3–6 не объявляются закрытыми; production **NO-GO** сохраняется.


**Ограничение приватности:** GitHub repository visibility проверено как public. Унаследованный commit2a338da содержит исходные HIGH raw; обычный push сохранил эти версии в истории. Текущие документы редактированы, новые полные доказательства остаются local/private, но обещать приватность исторических raw нельзя. История не переписывалась: force-push запрещён владельцем. QA-20 MEDIUM / OWNER DECISION фиксирует процессный дефект; cleanup требует отдельного решения и не отменяет уже случившуюся публикацию. Технические подробности неразрешённых HIGH здесь не повторяются.

Final endpoint Quality Gate:132inventory rows,1920HTTP requests;831/831explicit expectations,2697/2697overlapping semantic checks,975snapshots+2A↔B whole-domain comparisons;0final assertion failures. ANY232/232 and narrowaction36/36; all inventory endpoints requested, full state/role/token combinations remainPARTIAL. Details and limits:stage-2/endpoint-quality-gate.md. Fresh SECURITY source review COMPLETED(15checks+1probe), no newHIGH/CRITICAL; MEDIUM SEC-FRESH-01 unapplied CRM proposal. OverallNO-GO: exhaustive dynamic certification and historical privacy requirement unmet, noStage2verifiedtag/Stage3.

## Этап 2-B — обязательные условия перед production

При выходе в production сменить `pim_key` и `cron_key` на новые независимые случайные значения, обновить только соответствующих клиентов и проверить, что прежние значения больше не принимаются. В этом этапе ключи не менялись и production не затрагивался. Legacy-синхронизация выключена по умолчанию (`pim_legacy_sync=false`); разрешение legacy не позволяет изменять модели контракта 3.
