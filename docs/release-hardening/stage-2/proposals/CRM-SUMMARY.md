# Unapplied CRM proposals

CRM backend staff/ and api/staff/ inside SITE remains byte-for-byte unchanged from pinned baseline. Frontend dependency /workspace/onboarding/dependencies/crm.rubizh remains pinned b0e2f9359a05ec835a83d64bb9bcdc2c97487a50. No proposal applied.

PHP-01 (MEDIUM, confirmed in pinned raw): reject array-valued scalar query fields and sanitize TypeError/ValueError responses. [CRM-PHP-01.patch](CRM-PHP-01.patch) passes applicability/PHP syntax only, not a changed-CRM regression suite. Before application add authenticated HTTP array-input regressions for orders/payments/shipments/returns/custom periods: require400 generic message/no paths, unchanged normal searches. Unexpected non-type exceptions need a broader explicit safe-error policy; this patch makes no blanket readiness claim.

ARCH-05 / FPAY-03: uniform refund evidence and unknown-operation reconciliation require confirmed provider semantics. Source ignores cancelList under invoice success; no live bank evidence established that combination. Proposed work: provider-verified matrix, immutable correlated evidence with duplicate/conflict tests, and manager/OWNER reconciliation state+audit design. No patch guessing a bank money state is supplied.

LOG-06 / ARCH-06: CRM delivery-ref verification and a unified order/shipment/customer projection need owner design, preserving SITE domain/role/version checks. No financial policy, role or CRM migration changed.

CRM-FE-01 (MEDIUM, CANDIDATE): rapid assign/note/invoice under parallel load produced a safe STALE_ORDER409 while frontend invalidations were settling. Explicit refresh restores current action state. Investigate query invalidation completion, disabling money actions during current-order fetch and consistent read/version snapshots; add a deterministic rapid-action regression before choosing a CRM patch. SITE tests now exercise the real refresh recovery; CRM source remains unchanged.
