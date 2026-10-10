# Additive migration and rehearsal

Prepare PIM v3 and frozen P0 first, following their existing guarded operator commands. CRM never migrates during a HTTP request. `dev/migrate-crm.php --plan` inventories additive tables, immutable triggers and indexes without writes. `--apply` requires the exact configured database name and verified off-webroot backup SHA256. `--isolated` works only for `fixture_*` databases on the local test socket. Migration journal entries bind SQL and the actual schema object hash; collision, missing journaled objects or drift refuse migration before new DDL. DDL is inherently autocommit, so interruption can require an operator review of an unjournaled object; do not silently adopt it.

Additions: staff roles/permissions/users; assignments; notes; staff audit; physical returns and verified refund allocations; provider refund operations; sender profiles; contact normalization evidence; migration journal. Existing order/payment/shipment entities are reused. Added indexes cover order date/id, financial queues, confirmation queues, shipment state and signed payment event lookup. No order/customer/item deletion, status guessing or destructive schema conversion occurs.

Operator sequence:

1. Inventory the exact deployed schema/version and read-only reconciliation plan. Stop conflicting workers for apply, take a fresh consistent backup outside webroot and prove restoration to an isolated database.
2. Review `php dev/migrate-crm.php --plan`. Apply with `--apply --database=<exact name> --backup-file=<private backup> --backup-sha256=<sha256>`.
3. Review both `dev/reconcile-order-states.php --plan` and `dev/phone-identity-backfill.php --plan`. Phone planning performs no ownership merges or writes.
4. Review `dev/backfill-crm-order-states.php --plan`. Only after concrete approval, use its exact `--plan-sha256`, database and backup hash to apply safe empty state annotations. Ambiguities remain flagged.
5. Provision an initial OWNER via stdin, deploy the complete PHP/static release, run security and E2E checks before enabling staff access.

Automated rehearsal `tests/crm-migration.test.mjs` creates mixed historical/v3 orders and account ownership, takes a consistent fixture backup, restores all rows and triggers into a second schema, checks equality, applies CRM twice, refuses a changed plan, fills only a safe mapping, preserves ambiguous records and verifies original SITE code can read the expanded schema. The fixture-only snapshot utility refuses non-fixture names and TCP connections. Its base64 encoding preserves binary values as well as Ukrainian text.

Evidence is local synthetic production-like MySQL, not an actual production database copy. Production-copy restore and hosting DDL privileges remain rollout prerequisites. PRODUCTION_WRITES=0.
