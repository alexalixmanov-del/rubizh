# Storefront bug fixes — 2026-10-09

Base: `5128c7e090da3fc891d0195742fde4f3b11c0c69`.
Branch: `integration/site-pim-v3-foundation-2026-10-09`.

## Verified bugs and fixes

1. **Order receipt request race.** Opening order B while order A was still loading skipped B's request. A failed older request could also clear the currently displayed order. Requests now deduplicate by order number, use a generation guard, and validate the returned number. Changing orders clears the old receipt; a failed background refresh keeps the last known receipt with a visible error and retry. This does not change server payment permissions.
2. **Promo request race.** Older success or failure responses could replace a newer discount. Clearing the promo while its request was pending could restore the cleared code. Only the latest request for the current input can update the quote. The existing cart fingerprint check still rejects quotes for changed cart contents; server pricing remains authoritative.
3. **Nova Poshta directory race.** Changing delivery or city could leave a permanent loading indicator or display an error from the previous directory. Obsolete responses now stop their own loading state without inserting old results/errors. A pending debounce does not send a request for a city or delivery mode that has already changed.
4. **Narrow homepage layout.** At 320 px the kit feature's intrinsic grid width pushed the help button beyond the screen. The grid tracks and copy container can now shrink to their available width. Both themes retain fully visible actions at 320/360/390 px.

The new client asset is versioned. The previous asset remains available for rollback; the entry point loads only the new one. Both template stylesheet references use the updated cache key.

## Files changed

- `assets/shop-client.2026100901.js`
- `assets/experience.css`
- `index.html`
- `tests/storefront-races.test.mjs`
- `BUGFIX-REPORT-20261009.md`

## Verification

- Before fixes: all seven initial repro tests failed for the expected functional/layout reasons.
- Added 11 regression tests against methods from the actual active client asset and a Chromium homepage layout check.
- Visual/runtime inspection: homepage, catalog, category directory, kit builder, product, account profile and login; both themes; 320/390/1440 px. The initial inspection found the narrow homepage overflow; no JavaScript exceptions or broken visible fixture images were found in these 42 page/viewport/theme combinations. Additional responsive, modal, navigation and checkout checks run in the existing suite.
- Full workspace suite: **192 passed, 0 failed, 0 skipped**, 128.35 seconds.
- Of those, **183 belong to the committed suite including these fixes**; 9 belong to the pre-existing untracked `tests/model-migration.test.mjs`. Those migration files were left untouched and are excluded from this commit.
- Regression coverage includes decimal pricing v1, server price validation, SKU ownership, private price projection, atomic pricing sync, duplicate checkout and stock reservation concurrency, taxonomy/banners, kit selection, NP, MonoPay, account/auth, reminders and runtime security.
- `node --check assets/shop-client.2026100901.js` and `git diff --check` passed.
- Command: `RUBIZH_TEST_MYSQL_SOCKET=/workspace/test-runtime/mariadb/mysql.sock node --test --test-concurrency=1 tests/*.test.mjs`.
- Environment: Chromium + PHP 8.4 + isolated MariaDB fixtures. Production PHP 8.2, Safari/iOS on a physical device and real hosting load were not exercised by this run. Browser network races were controlled fixtures, without real bank/NP calls.

## Scope and release state

`PRODUCTION_WRITES = 0`

`PIM_SYNC_ENABLED = false`

No database migrations, PHP runtime changes, production taxonomy changes, legacy model merges, product URL changes or payment-flow changes were introduced. PIM v3 capabilities remain unadvertised. Production was not deployed. These checks establish the reported fixes and regressions in the isolated environment; they do not certify every possible production defect or hosting capacity.
