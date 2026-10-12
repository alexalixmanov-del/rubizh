# Глобальный этап2 — итоговый checkpoint report

**Решение: NO-GO.** Исправления и доказательства сохранены; Stage2 verified tag не создан. Незавершённый обязательный fresh SECURITY проход и неполная exhaustive динамическая проверка всех endpoint/method/role не объявляются PASS. Это checkpoint аудита, не разрешение на Stage3/deploy.

## 1. Объект и независимость

SITE code: `1fcca317f381c33ea29b40ccb12d99b2b65c439b`, branch `hardening/stage-2-audit-fixes`. База: tag rubizh-stage-1-verified →`51c83d808228a26328081b02211b4e3605353755` (проверенный f50dc50). Main не использован как база и не изменён. PIM `/workspace/pim.rubizh` →`21198461f8ebb2eadef6dcd6fb77a50a8a038ea9`, CRM frontend dependency `/workspace/onboarding/dependencies/crm.rubizh` →`b0e2f9359a05ec835a83d64bb9bcdc2c97487a50`; оба source clean/read-only. CRM backend staff/api-staff внутри SITE не изменён относительно базы.

13 направлений: architecture, PHP backend, security, payments, PIM contracts, logistics, database, frontend, QA, accessibility, performance, SEO, release/ops. Первые9 WIP raw сохранены как импортированные исходные свидетельства, недостающие4 independently читали pinned source/01/map. Они не использовали ee207fa/чужие выводы. Реализация: root и специализированные finish_payments/finish_ui/finish_seo/delivery_resilience; независимое итоговое review: final_payments_review и independent_changes_review. Fresh final_security_review был остановлен проверкой инструмента и не завершил проход.

## 2. Находки и regression disposition

Единый реестр — существующий03. CONFIRMED-RAW означает подтверждение в исходном raw, CANDIDATE/UNCONFIRMED не считаются доказанными или PASS. Stage1 D/RV остаются историей, не смешаны с повторным подтверждением Stage2. Подтверждённых CRITICAL не зарегистрировано. NEW late regressions REV-Q8-01/02 закрыты; их red-current/baseline-control и independent follow-up сохранены. FPAY-01/02 и SEC-15 закрыты после нового review; CRM-FE-01 остаётся candidate/owner review. Часть исходных HIGH остаётся UNCONFIRMED; закрытые доказательства не переносятся в публичный отчёт.

| Domain / IDs | Rows | FIXED | OWNER DECISION | OPEN/PARTIAL/UNCONFIRMED |
|---|---|---|---|---|
| A11Y | 13 | 4 | 0 | 9 |
| ARCH | 13 | 2 | 6 | 5 |
| CRM-FE | 1 | 0 | 1 | 0 |
| DB | 7 | 0 | 2 | 5 |
| FE | 3 | 1 | 0 | 2 |
| FPAY | 3 | 2 | 0 | 1 |
| LOG | 8 | 1 | 4 | 3 |
| PAY | 6 | 1 | 1 | 4 |
| PERF | 3 | 0 | 3 | 0 |
| PHP | 3 | 0 | 1 | 2 |
| PIMC | 18 | 2 | 7 | 9 |
| QA | 20 | 8 | 1 | 11 |
| RELEASE-OPS | 3 | 3 | 0 | 0 |
| REV-Q8 | 2 | 2 | 0 | 0 |
| SEC | 15 | 2 | 7 | 6 |
| SEO | 5 | 5 | 0 | 0 |
| SP | 3 | 3 | 0 | 0 |


Сводка126 строк: FIXED=36, OPEN/PARTIAL/UNCONFIRMED=57, OWNER DECISION=33. Severity original: MEDIUM=65, LOW=40, HIGH=20, MEDIUM / conditional HIGH=1. Это строки регистра, а не126 независимо подтверждённых уникальных дефектов; duplicate mappings и confidence сохранены.

Сводка severity/status и confidence каждой строки —03. Подтверждённые MEDIUM, которые не исправлены, явно OPEN/OWNER/PARTIAL; они не скрыты за зелёными тестами. Разные raw проявления одной причины дедуплицированы в03; нового параллельного реестра нет.

## 3. CRITICAL/HIGH

Неисправленные/условные исходные HIGH — только безопасный публикационный список; текущие подробности не повторяются; историческое ограничение приватности отмечено ниже:

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

Confidence/owner disposition приведены в03; список не означает восемь подтверждённых production failures.

| FIXED ID | Суть и файл | Regression / commit | Независимое review |
|---|---|---|---|
| ARCH-01 | Paid fulfillment подтверждается без изменения money/timing/reservation snapshot; shop/np-fulfillment.php:83 | q7-payment-readiness /336ddd2 | independent_changes_review |
| PAY-01 | Failed attempt остаётся payable до bank closure; shop/store-lib.php, shop/mono-lib.php | p0/payment states /4439b1d | independent changes + fresh payments |
| LOG-01 | Transient directory failure сохраняет manual/unverified delivery; shop/np-lib.php:115 | np-checkout + fulfillment /b690451 | independent_changes_review |
| SEC-01 | api health проверяет только local media; api/index.php | runtime-security red/green /56acdcb | independent_changes_review; whole SECURITY incomplete |
| SP-1 | Contradictory/duplicate cancelList отклонён до ledger; shop/mono-lib.php:70 | mono-webhook-contract /c1c3498 | independent changes + payments |
| SP-2/ARCH-04 | SITE money/confirm versions проверены под lock; shop/mono-lib.php:172, shop/np-fulfillment.php:83 | q5/lock races/Q7 /ce8b8e8+d5384a8 | final_payments_review |
| SP-3 | Diagnostic reads не откатывают terminal evidence; shop/mono-lib.php | mono-webhook-contract /415a08b | fresh payments + independent changes |
| FPAY-01 | Supplied refund amount/ref correlated exactly; shop/mono-lib.php:176 | q5 + independent probes /7e8b3c0 | final_payments_review |
| FPAY-02 | Explicit partial/uncertain reversal не становится full refunded; shop/mono-lib.php:110 | mono-webhook-contract + probes /d041484 | final_payments_review |
| SEC-15 | Legacy manager требует proven mailbox identity; shop/financial-permissions.php:15 | staff-email-trust red/green /8235cf1 | independent_changes_review |
| RELEASE-OPS-01/02 | Unsafe historical zip and missing P0 prerequisites fail closed; dev/install-pim-v3.sh | deploy preflight /d744e55+2c6fbf6 | independent_changes_review |

Это scoped review исправлений, не blanket security/production certification. Financial policy, floors, provider activation и conservative stock holds не заменены новыми правилами.

## 4. PIM и CRM предложения

PIM-P1 HIGH: public PIMC-P1.patch — notice, полный patch/reproduction private; код не применён. MEDIUM PIMC-P2 stale-stock policy — owner proposal без patch; PIMC-P3 broken-color-photo/PIMC-P4 color-scoped size requests и LOW PIMC-C1 fixture manifest: [PIM summary](proposals/PIM-SUMMARY.md), applicability checked only. PIM682/682 относится к unchanged baseline, не к proposed fixes. После решения PIM owner нужны regression-first, generated-runtime rebuild и полный suite.

CRM PHP-01 MEDIUM: [CRM-PHP-01.patch](proposals/CRM-PHP-01.patch), syntax/applicability checked, не применён; scalar-input/safe-error coverage требуется владельцу. CRM-FE-01 candidate: rapid actions/refetch могут дать safe STALE_ORDER409; explicit refresh recovery проверен в SITE harness, CRM application не исправлялся. Unknown refunds/shipments и унификация проекций — [CRM summary](proposals/CRM-SUMMARY.md); provider-unverified FPAY-03 не превращён в догадку о bank money state.

## 5. Q8 / D-11

`git merge-base --is-ancestor rubizh-stage-1-verified ee207fa` PASS. Правила K1–K6 утверждены владельцем2026-10-11 в10; D-11 FIXED. Custom kit:≥2 разных models из≥2 MAIN slots; small не квалифицирует, но получает PIM kit price при qualified составе. На каждый model —1 unit на kit, N для подразделения; extras retail. Server uses current PIM price/floor/slot, no promo/wholesale stacking; placed snapshots сохраняются.

Synthetic examples (retail1000, kit800): body+boots =1600; jacketqty3+bootsqty1 =3600 (лишние2 jacket retail); N3 jacketqty9+bootsqty3 =10800. Явный retail boots внутри group сохраняется:3800/11400. Same SKUqty2 и два models одного MAIN section — retail. K1–K6 validation:31 historical cases,25 red без fix +6 controls; старые14 browser/HTTP/CRM checks red на baseline; final focused23/23 + independent quantity/N/mode/reload probes. Corrected commits ee207fa+52bfc2c+e7de3ea. Older snapshots без N нельзя восстановить достоверно: default1, qty сохранён, current prices объяснены перед новым checkout.

## 6. Пункты §7

PERF first screen: варианты A CSS/media cleanup, B precompile runtime templates, C visible SSR first screen; рекомендуем отдельную архитектурную задачу с measured baseline и A-before-B/C, не реализовано автоматически. CGNAT: compound session/device/proven-identity keys, soft network challenge; production proxy/IPv6 policy не выдумана. Reservations: source-stock epoch/reconciliation/physical-return policy перед release, conservative holds сохранены. Unknown invoice: transient503/Retry-After + audited retry, no fabricated id/payment/absence. Settings: server format checks/escaping и step-up проверены existing suites; никакие реквизиты не заменены. Browser matrix: permanent pinned-engine fixture job proposal в05, current full local matrix выполнена. Unknown-state parking/reconciliation: provider-confirmed owner workflow proposed, CRM не изменён. Q9: все38 candidates существуют, literal source refs0, historical rollback exceptions preserved, удаления0. Banners не менялись. Live providers — DEFERRED Stage6.

## 7. OWNER DECISION

Рекомендации/варианты в04 и соответствующих proposal summaries. Выбрать first-screen plan; определить supported network/proxy limiter policy, stock observation/release semantics и доказательство разрешения UNKNOWN. PIM/CRM owner выбирает и отдельно применяет proposals с regression/build review. Do not auto-release money/stock or create retry TTN under uncertainty. Required next validation: fresh whole SECURITY review в доступной среде/человеком и exhaustive endpoint boundary evidence; это не разрешение на Stage3.

## 8. Quality Gate и сравнение с Stage1

| Проверка | Результат |
|---|---|
| Exact baseline Linux |351/351 PASS,0FAIL/SKIP; known macOS4 baseline failures не перенесены в Linux |
| Final full local |450/450 PASS;0FAIL/SKIP/CANCELLED;626167ms, exact code1fcca317 |
| Exact code CI | [38304082586](https://github.com/lieverifying/rubizh/actions/runs/38304082586), SUCCESS on `1fcca317f381c33ea29b40ccb12d99b2b65c439b`; PHP8.2+8.3, nonempty/zeroFAIL/SKIP enforced |
| Browser engines ×7 widths |315/315 page loads +21/21 purchase flows,0unexpectedJS/overflow/brokenimages;14expected synthetic404 console recorded |
| ADDENDUM / cabinetA-B |210/210 and21/21; foreign404/no leak, valid/cancelled TTN visibility checked |
| PIM contract / unchanged PIM | pinned source682/682 plus SITE full contract/sync/quote/CRM tests |
| PHP lint / npm audit |151 tracked PHP files syntax PASS; frozen SITE npm audit0 |
| CSRF/RBAC/IDOR |24negative CSRF/Origin requests at8 critical mutations +existing account/staff/step-up/revocation/state suites; exhaustive all-endpoint traversal NOT certified |
| Fresh reviews | scoped changes/payments corrections approved; whole SECURITY BLOCKED(tool) / incomplete |
| axe |30/30 route/width checks;0 violations WCAG2.1 A/AA;111 inventory flags, not a WCAG2.2 certificate or dead-click PASS |
| Lighthouse compressed comparison |32/32 measured runs,0 runtime errors; mobile medians home53→54/catalog55→57/product58→59/kit56→55; desktop94→93/95→94/95→94/94→95; SEO100. Same-host compressed fixture comparison; mixed deltas, no unconditional performance PASS |
| gitleaks Stage2 span |0 findings at code SHA; final doc-only checkpoint span checked after commit |
| Synthetic restore/rollback |61tables,2triggers,all restored rows equal; current additive migration and historical code read proof; no production dump/migration |

Stage1 macOS handling: deployment helpers explicitly Linux/GNU; non-Linux gets reasoned skip, scheduler checks flock and both exit statuses, snapshot helper accepts real system tmp directory. No macOS machine was run here. Supported Linux final/CI require0SKIP. ENOSPC, overloaded runs and the449pass/1light-theme readiness timeout were diagnosed, retained as non-green, then repeated without weakening assertions. Контрольные404 результаты сохранены отдельно. Runtime PHP8.4/MariaDB11.8 isolationOFF local versus PHP8.2/8.3+MariaDB11.4 CI explicit; compressed measurements are paired synthetic PHP-S fixtures, not production CWV/FPM/CDN or real-device certification.

## 9. Финальный commit, CI, tag, checkpoint

Code SHA `1fcca317f381c33ea29b40ccb12d99b2b65c439b`, all code/QA commits pushed withoutforce; code CI URL выше. После этого отчёта создаётся **doc-only checkpoint**: точный checkpoint SHA/его CI после commit фиксируются в final response и retained verification metadata (сам commit не может включать свой SHA). Application/test tree doc-only commit не меняет; required exact-checkpoint CI проверяется после push. **NO-GO; rubizh-stage-2-verified не создан/не опубликован.** No merge/deploy/Stage3.

## 10. Фактически / mocks / deferred / blocked

Фактически: signed-package runtime setup, frozen npm deps/build checks, private MariaDB, all local probes/suites, downloaded three engines, browser/axe/Lighthouse, Git read/push and exact-SHA GitHub API CI status. Через mocks/synthetic: catalog/orders/customer/staff, RSA bank callbacks/status/cancel responses, MonoPay handoff, NP directories/TTN state, SMS/mail transports. DEFERRED Stage6: real HTTPS bank callbacks, live/sandbox card transaction, actual SMS/email/NP TTN/provider E2E; no production action. BLOCKED(tool): fresh whole SECURITY agent execution. Approved network browser/API operations executed; they are no longer BLOCKED(network).

Cloud environment install_script/start_skill saved and refreshed with tested startup and capacity hygiene; current workflow validated, publication/new-task restoration not claimed. Final exact repository mounts/HEADs are saved in draft. Review/Save/Publish in environment settings remains the UI activation step. Detailed commands/results are retained in `/workspace/onboarding` and the ignored private evidence; uncorrected HIGH details не внесены в public report.

### Парные Lighthouse числа (3 mobile runs на каждую сторону; desktop1)

| Page | Mobile score baseline→current | LCP ms baseline→current | TBT ms baseline→current | CLS baseline→current | Compressed bytes baseline→current |
|---|---|---|---|---|---|
| home | 53→54 | 7370→7323 | 743→694 | 0.053→0.053 | 1523200→1527192 |
| catalog | 55→57 | 6929→7102 | 717→598 | 0→0 | 1315536→1319461 |
| product | 58→59 | 6150→6173 | 663.5→581.5 | 0.003→0.003 | 1172955→1176855 |
| kit | 56→55 | 6575→6681 | 650.5→673.5 | 0.031→0.031 | 1586826→1590749 |

LCP изменился от−0,6% до+2,5%; compressed payload вырос примерно3,9–4,0KB на страницу. Median не доказывает статистическую значимость; kit score−1 и desktop mixed deltas сохранены явно. Performance remains OWNER DECISION, target production capacity/p75 UNMEASURED. Исторические macOS74 не сравниваются с Linux53 как regression: подтверждённый before/after здесь — одна машина, один dataset, gzip/cache/throttling. Baseline/current mobile a11y99 на home/catalog/product и100 на kit; desktop100; SEO/best practices100 во всех32.


**Ограничение приватности:** GitHub repository visibility проверено как public. Унаследованный commit2a338da содержит исходные HIGH raw; обычный push сохранил эти версии в истории. Текущие документы редактированы, новые полные доказательства остаются local/private, но обещать приватность исторических raw нельзя. История не переписывалась: force-push запрещён владельцем. QA-20 MEDIUM / OWNER DECISION фиксирует процессный дефект; cleanup требует отдельного решения и не отменяет уже случившуюся публикацию. Технические подробности неразрешённых HIGH здесь не повторяются.
