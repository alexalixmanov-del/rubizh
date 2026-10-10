# Order P0 hardening

Scope: existing SITE order domain on PHP 8.2/MySQL-compatible InnoDB. No CRM dashboard, parallel order/customer/payment storage or PIM changes. Original SITE branch: `claude/amazing-meitner-e6572n`, baseline `d5e93f966c5d4ad6d5e686554f6e81dc2c6283aa`.

## Reservation authority

`rubizh_stock_reservations` remains the single quantity authority. Additive states:

| Trigger | Existing reservation transition |
| --- | --- |
| Numeric confirmed checkout / confirmation | Create ACTIVE once; same quantity replay is a no-op |
| Unpaid cancellation | ACTIVE → RELEASED |
| Unpaid deadline / expired bank invoice with no other open operation | ACTIVE → EXPIRED |
| Signed bank success, signed reversal, OWNER bank reconciliation | Existing row → COMMITTED once |
| Fulfillment / financial refund | Keep COMMITTED |

Quantity availability counts committed rows regardless of TTL or order delivery/refund status. Open or unknown bank operations hold active stock past TTL. Catalog/SKU locks and current reservation reads prevent overselling after an earlier REPEATABLE READ snapshot. Order mutations, reservation effects, event replay keys and audit inserts commit together; bank HTTP happens outside SQL transactions. Late money on a cancelled order is retained and flagged STATE_CONFLICT for review.

Physical return, refund and inventory return are separate decisions. This P0 adds no automatic inventory return or consumption based on an assumed supplier feed update. Committed quantity is held conservatively until an evidenced inventory reconciliation is designed; it must reconcile PIM quantities and publication revisions before releasing/consuming commitments. Quantity-less supplier status remains quantity-less.

## Financial permissions

Trusted server configuration `staff_roles` maps existing account IDs to OWNER, MANAGER, LOGISTICS or READ_ONLY. Configure real IDs through private server configuration; no owner is inferred from email or browser inputs. Existing verified `np_manager_emails` grant MANAGER only.

| Permission | OWNER | MANAGER | LOGISTICS | READ_ONLY |
| --- | --- | --- | --- | --- |
| payment.view | yes | yes | yes | yes |
| payment.invoice.create / resend | yes | eligible confirmed order only | no | no |
| payment.refund.request / execute | yes | no | no | no |
| payment.manual_reconcile | yes | no | no | no |
| order.price_override / total_override | yes | no | no | no |
| financial.audit.view | yes | no | no | no |
| order.confirm | yes | yes | no | no |
| shipment.manage | yes | no | yes | no |

Financial services enforce permission checks as well as HTTP entry points. Corrections require a 6–400 character reason. `rubizh_order_audit` stores immutable before/after JSON; database triggers reject UPDATE/DELETE. Application runtime DB users must not have privileges to drop triggers or truncate audit tables. Seller settings require OWNER; donation batch bookkeeping requires OWNER, while notification marking requires order.confirm. Customer self-service remains limited to owned orders, CSRF and existing eligibility checks.

## One validation contract

`shopValidateOrder()` resolves catalog identity, model/color/real size, publication, submission eligibility, current availability, reservation-adjusted quantity, payment flags and PIM price policy. Checkout, manager confirmation, size resolution and invoice use this service. Cart recovery uses selection validation without inventing a price offer.

Conflicts return HTTP 409 with `error_code` and `conflict`: PRICE_CHANGED, SKU_UNAVAILABLE, AVAILABILITY_CHANGED, PAYMENT_NOT_ALLOWED. Expired unpaid order invoice is blocked with PAYMENT_NOT_ALLOWED / ORDER_EXPIRED. Invoice never rewrites amounts or bypasses PIM payment_allowed with a manager checkbox.

A changed price or resolved size requires explicit OWNER approval of the returned `quote_hash` and reason. POST `/shop/order-confirm.php` accepts `resolution`, `approval: {quote_hash, reason}`, `availability_confirmed`, and existing order ID/CSRF. A stale hash fails. Price acceptance and fulfillment supplier/amount updates are transactional. There is no unrestricted item editing endpoint; future item editing must validate and apply changes transactionally and reconcile existing reservations, rather than directly modifying items_json.

POST `/shop/financial-actions.php` supports invoice.create, invoice.resend (returns the validated existing link, sends no message), refund.execute and manual_reconcile. GET returns the canonical order DTO; `action=audit` is OWNER-only. Bank-transfer proof is reconciled through OWNER confirmation with reason. Unsigned bank success observations never set PAID; unresolved refunds retain their durable intent and require bank investigation before any retry.

## Read-only legacy compatibility

CRM consumers use `shopCanonicalOrderDto()` / `canonical` on the receipt and staff endpoints. Presentation does not mutate history.

| Legacy order | Canonical order |
| --- | --- |
| new with explicit confirmation-required snapshot | WAITING_CONFIRMATION |
| new without evidence | null + LEGACY_REVIEW_REQUIRED |
| confirmed / processing / partially_shipped / shipped / delivered | CONFIRMED |
| cancelled | CANCELLED |
| completed | COMPLETED, contradictory money/fulfillment evidence flagged |
| returned / partially_returned / unknown | null + LEGACY_REVIEW_REQUIRED |

| Legacy payment | Canonical payment |
| --- | --- |
| pending / failed | UNPAID; PAYMENT_PENDING if open bank operation exists |
| paid | PAID |
| refunded | REFUNDED |
| cod / unknown | null + LEGACY_REVIEW_REQUIRED |

| Legacy fulfillment evidence | Canonical fulfillment |
| --- | --- |
| new / cancelled | NOT_READY |
| confirmed / processing, paid | READY_TO_SHIP |
| confirmed / processing, unpaid | NOT_READY |
| partially_shipped / shipped | SHIPPED |
| delivered / completed | DELIVERED |
| Valid tracking number on created shipment | TTN_CREATED |
| sent or partial delivered actual shipments | IN_TRANSIT |
| Every actual shipment delivered and all line quantities allocated | DELIVERED |
| Unknown shipment / return status | null + SHIPMENT_REVIEW_REQUIRED |

Explicit v3 states retain their canonical vocabulary. Contradictory legacy/v3 money or terminal evidence adds STATE_CONFLICT. A proven fully delivered paid v3 COMPLETED order is compatible with legacy delivered. No returned history is guessed to mean a stock return or refund.

```sh
php dev/reconcile-order-states.php --plan --config=/private/path/config.php
```

This command connects directly without request bootstrap/migrations, opens a READ ONLY transaction and rolls it back. It reports total_records, total_legacy_records, safe_mappings, ambiguous_mappings, conflicts and IDs/canonical states. It rejects --apply. No historical state backfill is implemented: only reviewed safe mappings may be added to a later backfill; ambiguous/conflicting records must remain reviewable.

## Additive migration and deployment

1. Quiesce order writes and workers, make and verify a restorable off-webroot DB backup. Rehearse on a restored staging copy using the hosting MySQL version and trigger privileges.
2. Run `php dev/migrate-order-p0.php --plan --config=/private/path/config.php`.
3. Apply with exact database name and verified backup SHA:
   `php dev/migrate-order-p0.php --apply --config=/private/path/config.php --database=ACTUAL_DB --backup-file=/private/path/backup.sql --backup-sha256=VERIFIED_SHA256`.
4. Migration adds reservation status/timestamps and immutable audit table/triggers. Existing paid/refunded reservations become COMMITTED; cancelled unpaid reservations become RELEASED. Historical timestamps are not fabricated. Existing orders/customers/items/invoices/shipments and catalog tables are retained.
5. Repeat the plan to verify all steps exist; run runtime preparation and reconciliation --plan. Configure account roles privately, then exercise signed staging payment, expiry, OWNER correction and rollback paths before re-enabling writes.

Fresh empty fixture databases may be prepared by `dev/prepare-runtime.php`. Existing orders require the guarded migration first. DDL is resumable but not transactionally reversible on MySQL; if deployment fails, retain the additive schema and restore compatible code, or restore the verified full backup under a maintenance window. Do not drop audit history as a rollback shortcut. Production migrations, role assignment, real provider calls and deployment were not executed during this task.

## Regression evidence

P0 unit tests cover role presets, legacy mappings, contradictory states, completion and reason validation. P0 integration tests use real isolated PHP 8.2/MariaDB transactions, signed ECDSA callbacks, direct HTTP RBAC/CSRF requests, audit rollback, replay, refund, numeric stock races and read-only CLI reconciliation. Bank HTTP uses staging mocks; no real payments, messages or Nova Poshta documents are created.

```sh
export PATH=/workspace/php-runtime/root/usr/bin:$PATH
export RUBIZH_TEST_MYSQL_SOCKET=/workspace/php-runtime/mysql/mysql.sock
node --test tests/p0-unit.test.mjs tests/p0-integration.test.mjs
```

The retained php8.4 executable path used by older tests is a compatibility wrapper for the actual PHP 8.2.34 interpreter and its 20220829 modules. Local MariaDB is 10.11.18 on a Unix socket with networking disabled. It is a development fixture, not production credentials or a test of the hosting provider itself.

Verified final run: 142 tests passed, 0 failed, 0 skipped. Of these, 22 are P0 unit tests and 14 are P0 integration tests; 106 existing compatibility checks also passed. Changed PHP files: 22 linted successfully; git diff --check passed. Log: `/workspace/reports/p0-verified.log`. Runtime setup was replayed with frozen npm lockfiles and verified Debian artifacts, and the fixture database was stopped/restarted through the saved startup helper before the final test run.

```
P0_RESERVATION_FIX=PASS
P0_FINANCIAL_RBAC=PASS
P0_CONFIRMATION_REVALIDATION=PASS
P0_INVOICE_REVALIDATION=PASS
P0_LEGACY_V3_RECONCILIATION=PASS
UNIT_TESTS=22/22 (P0)
INTEGRATION_TESTS=14/14 (P0)
BLOCKERS=NONE for local P0 development verification
```

These statuses certify the local implementation and tests. Production activation still requires the documented backup, migration, role configuration and hosting-specific staging verification. Broader CRM implementation remains a subsequent phase.
