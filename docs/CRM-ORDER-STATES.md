# Canonical states and historical compatibility

The single read-only projector is `shop/order-state.php`. All staff order DTOs use it. Raw historical statuses remain intact. A v3 contradiction is flagged rather than silently overwritten.

| Legacy order | Canonical order |
|---|---|
| new + snapshot requiring confirmation | WAITING_CONFIRMATION |
| new without sufficient evidence | null + LEGACY_REVIEW_REQUIRED |
| confirmed / processing / partly shipped / shipped / delivered | CONFIRMED |
| cancelled | CANCELLED |
| completed | COMPLETED, with paid/delivery conflict checks |
| returned / partly returned / unknown | review required |

| Legacy payment | Canonical payment |
|---|---|
| pending / failed + active bank intent | PAYMENT_PENDING |
| pending / failed without an active invoice | UNPAID |
| paid | PAID |
| refunded | REFUNDED |
| cod / unknown | review required |

V3 adds PARTIALLY_REFUNDED. Legacy `paid` remains compatible with that explicit state.

Fulfillment comes from independent parcel facts and exact quantity coverage: NOT_READY, READY_TO_SHIP, TTN_CREATED, SHIPPED, IN_TRANSIT, DELIVERED. A TTN alone does not prove transport or delivery. Every parcel must be delivered and every line covered before aggregate DELIVERED. Returned, manual and unknown historical shipment facts flag review. The contract does not add an invented PARTIALLY_SHIPPED v3 state; individual parcels and remaining allocations show partial coverage.

`dev/reconcile-order-states.php --plan` opens a READ ONLY transaction and lists total records, legacy records, safe mappings, ambiguous mappings and conflicts. It does not bootstrap or migrate.

`dev/backfill-crm-order-states.php --plan` produces a hash-bound safe backfill plan. Apply requires the exact database name, that plan hash, a verified off-webroot backup and prepared CRM schema. All relevant order locks are acquired and the plan is checked again inside the transaction. Only safe empty presentation columns are filled; old statuses, items, customer links and contract versions do not change. Existing matching annotations are reported as already_mapped. Ambiguities and conflicts are never backfilled.
