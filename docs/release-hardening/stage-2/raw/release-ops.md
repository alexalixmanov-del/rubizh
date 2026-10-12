# Stage 2 — RELEASE / OPS (6.13)

Audited SITE SHA: `51c83d808228a26328081b02211b4e3605353755`. Blind review used the pinned exported source, baseline `01-SOURCE_OF_TRUTH.md`, and current `00-SYSTEM_MAP.md` only. Relevant source bytes were matched against this Git object. No production execution, external provider calls, PIM synchronization, AUTOPRICES, or real asset deletion occurred.

The two baseline HIGH findings below are now fixed by tested, fail-closed installer gates in the SITE working tree. The historical artifact remains unchanged and is deliberately rejected; a new reviewed artifact is required before this installer can deploy. Full evidence, lower-severity findings, rehearsal results, and the proposed restore procedure are in `/workspace/onboarding/stage2-private/release-ops.md`.

## RELEASE-OPS-01 — Installer deploys an older artifact than the audited source

- **Domain / SHA:** RELEASE/OPS; `51c83d808228a26328081b02211b4e3605353755`.
- **Severity / confidence / status:** HIGH at baseline / confirmed / FIXED by a tested fail-closed gate.
- **Source:** `dev/install-pim-v3.sh:21`, `dev/install-pim-v3.sh:22`, `dev/install-pim-v3.sh:31`; `dev/deploy-update.sh:66`; `dev/package-release.py:10`.
- **Failure scenario:** An operator uses the shipped installer to deploy the reviewed release. Its fixed archive and checksum select an older release; installation replaces hardened payment and permission files with those older versions.
- **Test proof:** The local archive matches the installer checksum `cc8ac3b7c0f0224b8af5559c9ad9be6fc126254d9f18ee8b2b637193f32b0c3c`, but its manifest commit is `d22b0f001741536d2501721a00737c14218872be`. Four payment/permission files differ from the pinned source. Read-only archive inspection confirms later safeguards are absent. No installation on a real site was attempted.
- **Impact:** A successful checksum and installer result do not establish that the audited behavior was deployed; release hardening can regress.
- **Fix:** Produce an artifact from the intended immutable SHA; verify its manifest commit and every file hash against that SHA; update the installer artifact pin and test the packaged artifact. Avoid a self-embedded installer pin that silently selects an earlier release.
- **Implemented resolution:** Before inventory or source handoff, the installer rejects an unexpected reviewed commit, missing hardening controls, or mismatched manifest hashes for four payment/permission files. Regression checks reject the actual historical archive and changed file bytes, and accept the synthetic reviewed fixture. The existing archive pin was retained so this path stays blocked until a reviewed artifact is provided.

## RELEASE-OPS-02 — New reservation code becomes live before its mandatory schema migration

- **Domain / SHA:** RELEASE/OPS; `51c83d808228a26328081b02211b4e3605353755`.
- **Severity / confidence / status:** HIGH at baseline / confirmed for a pre-P0 installation / FIXED by a tested read-only prerequisite gate.
- **Source:** `dev/install-pim-v3.sh:31`, `dev/install-pim-v3.sh:36`; `dev/deploy-update.sh:62`; `shop/store-lib.php:22`; `shop/reservations.php:27`; `shop/order-p0-schema.php:7`; `dev/prepare-runtime.php:7`.
- **Failure scenario:** Updating an installation whose reservations table lacks the P0 columns exposes new source before P0 is applied. Requests or workers entering reservation operations during this interval query a missing column. A later migration failure leaves the incompatible source active; the deploy rollback trap has already completed successfully.
- **Test proof:** In a synthetic local database, restoring the pre-P0 reservation shape and calling current `shopReserveLines()` produces SQLSTATE `42S22`, unknown `status` column. Running guarded P0 migration twice then succeeds, preserves order rows, and correctly reconciles paid/cancelled reservations. The shipped installer calls deployment before that migration and contains no traffic or worker drain.
- **Impact:** Checkout, confirmation, and payment transitions that touch reservations fail during the deployment window or persistently after a migration failure. Lazy schema preparation cannot supply these CLI-only columns.
- **Fix:** Drain affected requests and workers before source/schema handoff, with an explicit failure rollback path; or apply the compatible additive migration using a staged migration tool before switching traffic to the new source. Verify required schema objects before readiness and resume traffic only after local functional checks pass.
- **Implemented resolution:** Before downloading or replacing source, the installer requires the existing P0 marker, all three reservation columns, audit table and both audit triggers. Incomplete installations fail without source or schema changes and must prepare the guarded additive migration separately. The synthetic regression exercises the actual CLI refusal and proves unchanged source/meta and no created deployment backup.

Validation: baseline deploy/cron/automation tests **9 passed**; three new regressions **failed before fixes**. After fixes, combined checks **12 passed, 0 failed, 0 skipped**; the strengthened CLI refusal test then passed with all five deployment tests. Installer shell syntax passed. HTTP smoke now rejects local 503 responses and accepts all three local 200 responses. Synthetic backup restored **61 tables and 2 triggers**, with all rows equal and both audit mutation guards enforced. Synthetic source rollback restored previous files/private configuration and preserved media. These results do not establish production backup availability, production scheduler installation, or real-provider delivery.
