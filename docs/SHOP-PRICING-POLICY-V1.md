# Pricing policy v1 — review branch, 8 October 2026

This change implements the supplied SHOP-PRICING-TZ for the shop. It does not apply the MODEL/COLOR/SKU migration, merge legacy cards, change production, or calculate supplier costs. PIM remains the authority for procurement, mandatory RRP, manual exceptions and allowed amounts.

## Contract and storage

Protected POST `/api/pim/sync` accepts product and variant `pricing_policy_version: 1`, settings version 1 and margin floor 15, variant `price`/`site_price`, `minimum_sale_price`, `kit_price` and `wholesale[].price`. Retail must agree between price/site_price. Supported v1 bounds and special prices are validated before storage. Missing/invalid bounds disable special prices; null kit price disables the special kit mode. An inconsistent price below a valid floor rejects the entire batch. Unknown product/SKU ownership is rejected rather than moved to another card.

Schema 4 adds server-only `rubizh_catalog_pricing` and converts existing retail/kit columns to DECIMAL(14,2). It is an additive code migration; no production SQL was executed here. Schema preparation is serialized and is performed before the pricing transaction. Prepare schema using the repository's CLI runtime preparation before opening a deployed version to traffic. Existing canonical taxonomy, locks, IDs, photos, supplier associations and old orders are retained.

Product, variants, private policy, category relations, hide decisions and kit definitions are saved in one InnoDB batch transaction. A failed row rolls back previous rows and returns status:error for every requested product. Retry does not create duplicates. Successful v1 results acknowledge the policy version; protected status advertises the capability. Unchanged batches preserve the pricing catalog version. All official checkout and batch paths lock the same catalog-version row before reading/writing catalog rows, so a checkout cannot observe half a price update.

Public data includes allowed retail/kit/wholesale amounts and discounts, never the floor, procurement or margin rules. Actual wholesale discount is computed only for display, floored to 0.1%; the supplied amount remains authoritative. Stored private restrictions also participate in the product hash, so a changed floor is not mistaken for an unchanged public product.

## Checkout and display

The active client is assets/shop-client.2026100803.js. Selected SKU determines retail, available kit price and both displayed wholesale amounts. Kits sum the selected PIM prices × quantities, without the old 3–13% quantity ladder. Unsupported legacy kit discounts fall back to retail and are labelled accordingly. Fixed «−13%» advertising was removed.

The shop previously handled wholesale by manager quotation, with no automatic quantity eligibility rules. Those rules are preserved: displaying a wholesale amount does not grant it. An authenticated buyer may use a tier only when a server-private `shop_wholesale_customers` map authorizes their account ID to a zero-based tier index. The client cannot supply the grant. Empty/default configuration requires manager approval; no invented quantity thresholds were added.

`POST /shop/checkout-quote.php` uses the same CSRF, current catalog resolution and price validation as checkout. Promo validation uses this server quote, not a browser floor. Retail promo prices are checked against the private minimum. Promos on kit/wholesale are rejected; discounts do not stack implicitly. Quote errors do not create orders, payments or reservations.

Checkout accepts product_id, SKU, positive quantity, price_mode (retail/kit/wholesale) and kit_group. It ignores submitted amounts/floors/percentages. Optional submitted size/color must match the actual SKU. Current publication, available size, availability and quantities are checked again. Catalog entries not synced in the configured freshness window (default 48 hours) require an updated availability confirmation; this is a catalog freshness guard, not proof that the upstream supplier feed itself is fresh.

Custom kit pricing requires all selected SKU to have permitted PIM kit prices and at least two selected units. Named ready kits additionally require the complete saved product/SKU/color/quantity definition. Ready-kit items preserve explicit qty and optional SKU. Two separate plate SKU units are billed twice; an explicitly packaged pair is billed by the actual pack SKU quantity. No title-based pack conversion is performed. PIM must supply confirmed composition/quantity: this patch cannot discover whether an undocumented item includes plates, and does not replace the pending PIM/kit-engine work.

Amounts are computed in integer kopecks, including fractional m² quantities. `PRICE_CHANGED` returns HTTP 409 and a new quote requiring confirmation; `DISCOUNT_NOT_ALLOWED`, `INVALID_VARIANT`, `INVALID_KIT` and `UNAVAILABLE` are returned as machine-readable reasons. Orders store SKU, qty, unit/line amount, price mode, catalog version and request state. Existing checkout-key locking and uniqueness prevent a second order on retry. Payment creation remains after manager stock confirmation and uses the persisted order total.

Explicit `ORDER_ON_REQUEST` is a manager request, including zero stock, with no invented stock reservation. Confirmed preorder keeps a separate line request state. Reservations are created only for in-stock lines with a numeric quantity. Unknown stock remains a manager check, not a confirmed quantity. No SMS, email, bank invoice or waybill was sent during validation.

## Validation and rollout boundary

New tests cover PIM control vectors 1590/1340/1370 and 14710/13340/13700, RRP/manual floors, both authorized wholesale levels, rejected self-authorization and stacking, invalid/null constraints, exact cents, two separate plates versus a pack, ready-kit membership and public/private separation. An isolated PHP+MariaDB HTTP test exercises version ACK, decimal size prices, repeat sync, whole-batch rollback, version lock contention, price/floor tampering, stale quote, checkout idempotency and zero-stock request reservations. Mobile browser tests exercise SKU wholesale switching and exact kit totals. Existing regression tests run with a temporary database; they are not production load certification.

The review branch contains 13 new tests (10 pricing policy checks, one HTTP/database scenario with multiple assertions, two mobile browser checks) and 103 existing regression tests: 116 tests in total. Nine pre-existing local MODEL-migration tests are outside this pricing commit; the broader workspace run passed all 125 with no skips. Decimal catalog card amounts and fractional price filters are also checked through the real API, not only in the unit calculator.

The final branch run passed all 116 with no failures or skips; see [the full validation log](SHOP-PRICING-VALIDATION-20261008.md). For reproducible validation use an isolated MariaDB socket and run:

```
RUBIZH_TEST_MYSQL_SOCKET=/tmp/rubizh-mariadb/mysql.sock node --test --test-concurrency=1 tests/*.test.mjs
```

Sequential test files avoid concurrent load-test fixtures competing for the development machine's work quotas; each HTTP fixture still checks concurrent requests internally. Missing database prerequisites cause explicit skips, not a passed database check.

Before production installation, review this branch and coordinate a PIM payload containing v1 fields. Until supplied, legacy products remain retail-only. Back up the existing database and private settings outside www before schema preparation. Do not roll back to an older unguarded pricing engine while continuing v1 discounts: pause checkout and restore the approved code/database together. Live installation, real provider payment/email acceptance, fresh supplier stock and MODEL grouping remain separate work; this review does not authorize their mass application.
