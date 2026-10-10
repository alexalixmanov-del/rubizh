# Rollback

Before release, retain the previous complete SITE/static artifact and a verified fresh backup. Rollback normally means disable staff access and restore the preceding application artifact; keep additive schema and immutable histories. Do not drop CRM tables, refunds, notes or audit, and do not restore a stale database over orders accepted after the backup.

If a provider operation is processing/unknown, preserve its intent and reconcile it against the provider before any retry. Old code must not bypass an existing CRM refund ledger. Prefer a compatible rollback artifact that retains `shop/crm-bridge.php` and the financial safeguards even while the CRM UI is disabled. Restoring pre-hardening payment mutation code is a maintenance-only rollback, not permission to resume financial operations.

For data corruption, isolate writes/workers first, prove a restore on another database, identify post-backup orders/payments and reconcile them with the authoritative provider records before an approved recovery. Staff sessions should be revoked when rolling back an auth/security change. Keep all bank/NP references and audit evidence.

The automated fixture rehearsal runs the original SITE domain files against the additive schema, checks existing order reads and unchanged historical entities, and separately proves full backup restoration. This demonstrates schema/code compatibility in an isolated synthetic database. It does not simulate production cutover or issue real refunds/TTNs. Production recovery time and live-worker coordination must be checked on approved hosting staging.
