# STAGE CHECKPOINT — история контрольных точек

Правило владельца (2026-10-11): после каждого этапа — проверенная контрольная точка; тег только если все обязательные проверки зелёные на одном HEAD, включая CI для точного SHA. Теги — только локально; публикация тегов в GitHub, merge и deploy запрещены.

**Исправление (указание владельца 2026-10-11).** Прежняя запись «этапы 1–6 = фазы 2–7 ADDENDUM №2, подтверждено владельцем» была **неверной**: владелец такого не подтверждал. Фазы ADDENDUM №2 и глобальные этапы проекта — разные вещи. Предложение создать теги `rubizh-stage-1…6-verified` на одном коммите отменено; такие теги локально не создавались (проверено `git tag -l 'rubizh-stage-*'` перед созданием тега этапа 1 — пусто).

## Глобальные этапы проекта

| Этап | Содержание | Статус | Проверенный SHA | Тег (локальный) |
|---|---|---|---|---|
| 1 | Завершение SITE: hardening, Q-4…Q-7, Quality Gate | **VERIFIED** | `f50dc50` (код), тег на checkpoint-коммите | `rubizh-stage-1-verified` |
| 2 | Независимый multi-agent аудит SITE + PIM | **CHECKPOINT / INCOMPLETE / NO-GO** | `1fcca317f381c33ea29b40ccb12d99b2b65c439b` (code; doc-only checkpoint follows) | не создан |
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


## Глобальный этап2 — checkpoint2026-10-12 UTC: NO-GO

Code `1fcca317f381c33ea29b40ccb12d99b2b65c439b`, branch `hardening/stage-2-audit-fixes`; baseline tag51c83d808228a26328081b02211b4e3605353755. Main не использован/не изменён. PIM21198461f8ebb2eadef6dcd6fb77a50a8a038ea9; CRM dependencyb0e2f9359a05ec835a83d64bb9bcdc2c97487a50; оба tracked source clean/read-only; SITE staff/api-staff unchanged.

| Quality Gate | Реальное доказательство |
|---|---|
| Linux baseline |351/351 PASS,0FAIL/SKIP; tag CI38173980266SUCCESS, f50 code38170904075SUCCESS |
| Final full local |450/450 PASS;0FAIL/SKIP/CANCELLED;626167ms, exact code1fcca317 |
| Exact code CI |[38304082586](https://github.com/lieverifying/rubizh/actions/runs/38304082586) SUCCESS, PHP8.2/8.3; positive count, fail0/skip0 enforced |
| Three browsers /7widths |315/315 pages+21/21 purchases; ADDENDUM210/210, cabinet21/21; unexpectedJS/overflow/brokenimages0; expected synthetic404 consoles separately recorded |
| PIM unchanged |682/682 PASS,0FAIL/SKIP; proposals not applied |
| Q8 / D11 |Originalee ancestor PASS;31historical cases25red/6controls, finalfocused23/23; qty/N/mode follow-up approved; rules/examples in10 |
| axe / Lighthouse |30/30 WCAG2.1 A/AA checks0violations,111inventory flags;32paired compressed Lighthouse runs0errors; mixed score/time deltas, performance threshold not claimed PASS |
| Scoped review |Payments/changes/QA fixes independently approved, late financial/recovery/email findings closed; full whole SECURITY incomplete |
| Restore |61tables/2triggers, restored rows equal; private configuration/media preservation; synthetic only |
| Local integrity |151PHP syntax checks PASS; frozen SITE npm audit0; Stage2 gitleaks0(code span), final checkpoint span checked after commit |

Единый03:126 finding rows,36 FIXED; confidence/status/duplicates explicit. Неисправленные HIGH публикуются только ID/severity; подробности остаются private. §7 owner proposals в04; PIM/CRM patches unapplied. Existing03/02/04/05/07/08/09/10/SESSION updated, new report/proposals onlystage-2/. [Полный10-раздельный итоговый отчёт](stage-2/FINAL_REPORT.md).

**NO-GO:** required fresh whole SECURITY execution BLOCKED(tool)/INCOMPLETE; exhaustive dynamic endpoint/method/role traversal not certified. Зеленые selected suites или CI не заменяют эти два gate. Performance medians retain mixed deltas; productionp75/capacity UNMEASURED. Stage2 verified tag не создан, tag не опубликован, merge/deploy/Stage3 не выполнялись. Live provider E2E DEFERRED→Stage6, не PASS. Approved API/browser networking and normal branch push actually worked, corresponding BLOCKED(network) снят.

Этот commit меняет только документы, app/test/workflow bytes совпадают с указанным codeSHA. Собственный checkpoint SHA нельзя включить в сам commit; после push exact SHA/CI result фиксируются в final response и `/workspace/onboarding/rubizh/reports/checkpoint-ci.json`. Until that evidence, exact checkpoint CI is not claimed successful by this file.

Cloud install_script/start_skill tested and saved; final complete repository membership saved with actual mounts/exact HEADs after checkpoint. User review/save/publish in environment settings activates saved draft; new-task restoration not verified. Startup uses `/workspace/onboarding/rubizh/start.sh` +functional smoke, no live processes assumed restored. Optional marker/age/activity-checked cleanup helper preserves all fixture DB schemas/reports.


**Ограничение приватности:** GitHub repository visibility проверено как public. Унаследованный commit2a338da содержит исходные HIGH raw; обычный push сохранил эти версии в истории. Текущие документы редактированы, новые полные доказательства остаются local/private, но обещать приватность исторических raw нельзя. История не переписывалась: force-push запрещён владельцем. QA-20 MEDIUM / OWNER DECISION фиксирует процессный дефект; cleanup требует отдельного решения и не отменяет уже случившуюся публикацию. Технические подробности неразрешённых HIGH здесь не повторяются.
