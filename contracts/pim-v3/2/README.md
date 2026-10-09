# PIM → SITE contract 3 — exact wire (snapshot 2)

`wire.exact.json` is **byte-for-byte output of the shipped PIM exporter**
`pimSiteWire()` (`pim.rubizh/app/lib/final-workflow.inc.js`), produced by
`app/tools/export-wire-fixture.cjs`. The catalog *input* of that run is a
representative synthetic catalog (M-WIN STATUS, UKR-TEC Prom days/`!`,
Tactical Belt unconfirmed, size range without SKU, two-color galleries); the
envelope, field names and values are the exporter's. A PIM test regenerates it
and requires byte equality. `wire.schema.json` pins the envelope; every
`products[]` item also satisfies `../1/category-size-export.schema.json`.

## Envelope (fixed)

```text
contract_version 3 · version 3 · pricing_policy_version 1 · category_catalog_version 2
size_catalog_version 1 · inventory_policy_version 1 · order_policy_version 1 · model_colors_version 1
pim_version · currency UAH · generated_at · catalog_revision · category_catalog_hash
categories[] (143 PIM IDs) · products[] (READY MODELs only) · hide_ids[] (explicit only)
```

The envelope is `products[]`. There is no `models[]` key; the synthetic
`models[]` wrapper of snapshot 1 is test-only.

## Transport

`POST /api/pim/sync` with the PIM bearer key, in chunks of at most 200 models:
same `batch_id` (`PB-<catalog_revision>-<content hash>`), `chunk_index`,
`chunk_count`; `categories` only in chunk 0, `hide_ids` only in the last chunk.
SITE stages chunks privately, validates the whole batch, then writes once in a
transaction. Final ACK: `status:"COMMITTED"`, `contract_version:3`,
`catalog_revision`, `results[{id,status}]` for every sent model and exact
`hidden_ids`. Same chunk again → stored ACK (`replayed:true`); same `batch_id`
with different bytes → `409 BATCH_HASH_CONFLICT`; any invalid model → whole
batch rejected with per-model codes, no catalog write. Absence of a model is
never a hide.

`GET /api/pim/status` advertises the contract above only when the operator set
`'pim_v3_sync'=>true` in the private config **and** the additive schema is
applied (`meta pim_v3_schema=2`); otherwise only `pricing_policy_version:1`.
PIM refuses to publish unless every version matches and `envelope:"products"`.

## Private vs public

Server-only fields (stored privately, never in a browser DTO): `minimum_sale_price`,
`discount_margin_floor_pct`, `stock`/`stock_quantity`, inventory policy/source/
observation metadata, `fulfillment_supplier_id`, `fulfillment_supplier`,
`fulfillment_supplier_sku`. Public DTO (`shop/pim-v3-read.php`) is a whitelist:
colors with galleries and SKU lists, real SKU with size, typed availability,
three permissions, lead time, public prices, request-only size options.
