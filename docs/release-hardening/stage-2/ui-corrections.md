# Stage 2 UI corrections and implementation verification

2026-10-12 UTC. Working branch `hardening/stage-2-audit-fixes`. Scoped implementation follow-up to private baseline FRONTEND / ACCESSIBILITY findings, not an independent final review or a WCAG conformance certificate. No commit, production request, provider call or real order occurred.

## Corrections

- `assets/shop-client.2026101101.js`: native fetch `TypeError` failures now produce `Не вдалося з’єднатися з сервером. Перевірте підключення до інтернету. Спробуйте ще раз.` The original exception remains its diagnostic cause. Cancellation (`AbortError`), structured server validation/status, malformed-JSON messages and existing timeout handling retain their separate paths.
- Commerce dialogs now enter the shared keyboard boundary at desktop and mobile widths. Opening order and focus-return frames support modal transitions; Tab and Shift+Tab remain inside the active dialog, Escape closes the active overlay, and connected openers regain focus. Background siblings become inert while the overlay is active and their previous inert state is restored on close/unmount. Mobile fixed-body scroll locking remains mobile-specific.
- Mobile filters expose `role=dialog` and `aria-modal=true` only while their mobile sheet is open. Closing or switching to desktop restores normal sidebar semantics. Its close control has a descriptive Ukrainian label. Search cancellation preserves its deliberate blur behavior so focus restoration cannot reopen search.
- Product size controls expose dynamic `aria-pressed` as selection changes. Quick-view's decorative backdrop remains clickable without becoming an extra unnamed keyboard control.
- `assets/experience.css` and its copy in the served `assets/head-bundle.2026101201.css` use a separate theme focus token: dark `#f0a144`, light `#8a4c0d`. The commercial accent remains unchanged.

## Regression and verification evidence

Environment: sourced `/workspace/onboarding/rubizh/environment.sh`. Browser fixture: local Node demo preview; isolated PHP fixture for the existing 404 contrast check. Additional browser verification explicitly blocked every non-loopback request and used synthetic customer data with an intercepted, aborted order POST.

1. Before correction, `node --test tests/a11y-hardening.test.mjs`: **11 executed; 5 passed, 6 failed, 0 skipped**. All six saved Stage 2 regressions reproduced: English fetch error; desktop quick-view focus; mini-cart/size focus; mobile filter semantics; selected-size state; light-theme focus contrast.
2. Quick-view to mini-cart regression added to verify restoration after the quick-view opener inside that dialog is removed.
3. Mobile search regression reproduced a correction-induced reopening on Escape (`data-open=1`); the targeted fix preserved intentional search blur. Targeted red run: **1 executed, 1 failed**.
4. Final `node --test tests/a11y-hardening.test.mjs tests/mobile-polish.test.mjs`: **15 executed, 15 passed, 0 failed/skipped/cancelled**. Mobile layout/action checks covered 320/390/430 px, dark and light themes. The contrast test resolves transparent field backgrounds to the first opaque ancestor instead of treating transparency as black.
5. Additional local checks: checkout fetch failure renders the Ukrainian message and resets `orderSending=false`; native cancellation keeps `AbortError`; server validation retains `Оберіть розмір` and HTTP 422; malformed JSON retains its Ukrainian temporary-server message. Light-theme checkout name-field outline is `rgb(138,76,13)` at 2 px against `rgb(243,242,235)`: **5.9968:1**, exceeding 3:1 for that measured surface.
6. `node --check assets/shop-client.2026101101.js` and `git diff --check` passed.

Private implementation logs/helpers remain outside the checkout under `/workspace/onboarding/stage2-private`: `ui-fix-red.log`, `ui-search-red.log`, `ui-final-validation.log`, `ui-additional-check.mjs`, `ui-additional-results.jsonl`. An initial extra helper run used the wrong checkout input label; the selector was corrected and the complete rerun passed.

This scope does not close baseline quantity-limit or commerce-bundle boot-failure findings, certify all assistive technologies/browser combinations, or replace the required independent final review. No banner, PIM/CRM contract, pricing or payment logic was changed by this UI implementation.
