# PIM → SITE private contract: supplier payouts (version 1)

Owner decision OD-4.1 (2026-10-16): the cost for CRM «Валовий прибуток» comes from PIM.

- **What:** the supplier payout per SKU — PIM `calc()` payout (`offers[supplier].payout`, else `.cost`) — in kopecks.
- **Not public:** a separate private contract, never inside the public catalog (`contracts/pim-v3/2` wire, `products[]`).
  The PIM exporter `pimSitePrivateCosts()` is separate from `pimSiteWire()`; the wire fixture hash does not change.
- **Transport:** `POST /api/pim/costs` with the PIM bearer key (current or, during a rotation, the next key), JSON body
  `schema.json`, at most 20 000 rows and 2 MB. Sent by PIM after a COMMITTED publication (not in review mode).
- **SITE:** validates strictly (unknown keys, duplicate SKUs, non-integer or negative values → 422; nothing is written),
  then upserts `rubizh_crm_sku_costs(sku, cost_minor, source='pim', observed_at)` in one transaction. Rows are never
  deleted by a batch (orders keep their cost). The body is never logged. `api/lib.php catalog_public_data` still strips
  cost/payout keys from every public response.
- **Who sees it:** CRM `dashboard.finance` — OWNER and ACCOUNTANT (`contracts/crm/crm-api.json`). The formula in
  `docs/crm/05-CRM_ANALYTICS_FORMULAS.md` is unchanged: while any sold SKU has no cost — «Немає даних собівартості від PIM».
- **Tests:** SITE `tests/stage5-pim-costs.test.mjs`; PIM `app/tests/stage5-private-costs.test.cjs` (exporter output = the exact fixture
  for its synthetic catalog, wire unchanged).

`fixture.json` is the exact output of the PIM exporter on the synthetic catalog of the wire fixture (not owner data) — a copy of PIM `app/contracts/fixtures/pim-site-private-costs-v1.exact.json`.
