# CRM domain map

| Domain | Authoritative source |
|---|---|
| Orders | `rubizh_customer_orders` |
| Historical contact and total components | `rubizh_order_details` |
| Order item snapshots | `rubizh_customer_orders.items_json` |
| Financial line allocation / supplier routing | `rubizh_order_fulfillment_lines` |
| Unresolved selections | `rubizh_order_request_selections` |
| Accounts | `rubizh_accounts` |
| Verified identities | `rubizh_customer_identities` |
| Proven account/order ownership | `rubizh_account_orders` |
| Legacy contact profiles | `rubizh_customers` (displayed separately; no guessed merge) |
| Payments | Existing `rubizh_mono_invoices`, signed `rubizh_mono_events` and audited bank-transfer proof |
| Shipments | Existing `rubizh_order_shipments`, `rubizh_np_order_confirmations`, NP cache/audit |
| Reservations | Existing `rubizh_stock_reservations` |
| MODEL / COLOR / SIZE / REAL SKU / offers / prices / stock | Existing PIM → SITE contract v3 |

CRM adds staff users, role permissions, assignments, immutable notes/audit, physical return requests, refund operations, sender profile configuration, contact normalization evidence and the migration journal. Refund operation records reference existing invoice/order IDs; they are provider intents and facts, not another payment balance. Physical returns reference exact historical line numbers and quantities. Financial allocation evidence references successful refund operations, never a fabricated payment state.

Checkout retains raw and normalized phone in the historical contact snapshot. New contact evidence is written in its existing checkout transaction when CRM has been prepared. Existing historical raw strings cannot be reconstructed if SITE previously discarded them. `phone-identity-backfill.php --plan` reports valid normalization, existing ownership evidence, ambiguous matches, multiple accounts and different emails; it performs zero identity merges and zero writes. Phone equality alone never changes `rubizh_account_orders`.
