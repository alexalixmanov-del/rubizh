# PIM v3 — foundation contract snapshot 1

This is an offline foundation, not a declaration of SITE v3 support. The existing
status/sync/API/checkout entry points do not include these helpers.

`category-size-export.schema.json` and `canonical-categories.json` are byte-for-byte
snapshots of PIM `27fb26056563eb1fcf144ffdb2ba9ab264fa9313`; their SHA256 hashes are
in `manifest.json`. All 143 category identities and parents are retained here.
The active SITE taxonomy remains unchanged. No category/URL mapping is guessed.

`pimV3ValidateJson()` accepts a private offline envelope with integer
`contract_version=3`, `pricing_policy_version=1`, and `models[]`.
This envelope is **not** an enabled wire endpoint. It validates every keyword in
the pinned draft-07 schema with JSON object/array distinction, and rejects unknown
schema keywords. It is not a general JSON Schema library. Errors contain paths
and codes, not submitted values/private data.

The documented SITE extension also requires explicit MODEL identity (`id=model_id`),
marketing name, separate ACTIVE/HIDDEN/ARCHIVED publication state, typed colors
using PIM `colors[].id`, owned SKU and galleries, scoped size catalogs/options,
and retained pricing v1 fields on each real SKU. Numeric stock must fit the
existing two-decimal quantity contract. ASCII identities must fit 64 bytes;
unsupported IDs are rejected rather than truncated or renamed. Case collisions
are rejected conservatively for the existing case-insensitive catalog keys.
Limits: 8 MiB JSON, 1,000 models per offline envelope; each model has at most
5,000 variants, 256 colors, 256 size catalogs, 1,024 request options, and 256
allowed sizes per catalog. Future sync must define its own negotiated chunks.

The pinned PIM exporter currently loses per-SKU pricing v1 fields (audit G02),
so it is not certified as a compatible live payload by these synthetic fixtures.
Missing private floors disable discounts using existing pricing v1; they are never
reconstructed. Missing SKU pricing version/price/site_price is rejected. Quantities
and STATUS/FEED_PRESENCE null stock stay distinct. Observation age and stale flags
are metadata, not an authorization TTL in this offline validator.

`pimV3PublicDto()` validates first and serializes only whitelisted fields plus
existing computed public pricing. It omits supplier bindings, `colors[].sources`,
raw/procurement prices, private floors, proof, provenance and arbitrary nested
objects. It is a DTO foundation, **not** a public-read eligibility/payment resolver:
publication, category readiness, usable local media, explicit expiration and current
DB ownership must still be enforced by the later read/checkout adapter. URL checks
are syntax restrictions, not a download/SSRF authorization or evidence of usable media.
No outbound HTTP or public route is implemented here.

`pimV3ValidateMappingJson(mapping, batch)` validates versioned explicit `entries[]`,
owned targets, proof-reference presence, local product URL syntax, and null targets
for UNKNOWN/NEEDS_DECISION. It creates no mapping guesses, transfers or redirects.
Proof existence/authenticity, alias collision/cycle checks, authoritative SKU ownership
against DB, and the full live-catalog LOST_* reconciliation remain later gates.
Reference presence alone is not SAFE_AUTO evidence.

The approved mixed-cart policy is recorded in the manifest and pure policy helper:
any PREORDER / ORDER_ON_REQUEST / SIZE_CONFIRMATION_REQUIRED / manager-confirmation
line sends the whole order to WAITING_CONFIRMATION, followed by one payment after
confirmation. No automatic split. Existing checkout behavior is untouched.

Migration entry point: `dev/migrate-pim-v3.php`, CLI only. It requires `--isolated`,
`--database=fixture_pim_v3_<8–32 hex>`, a Unix socket matching the explicitly set
`RUBIZH_TEST_MYSQL_SOCKET`, and a prepared schema4/runtime baseline. `--plan` (default)
reads metadata only. `--apply` adds nullable/LEGACY columns and inactive relations,
uses an advisory lock and records SQL/object hashes in an isolated journal. Drift,
unjournaled existing objects or incompatible baseline types/collations require review.
MySQL DDL can commit implicitly: it is not represented as transactional/reversible
DDL. An interrupted unjournaled step is deliberately not silently repaired.

This CLI never loads live configuration, accepts network DSNs or migrates a production
database. Retrying after code rollback leaves additive structures in place; never use
DROP/restore of an old DB to roll back new customer orders. Production deployment,
data ingestion, transfer, publication and restore are outside Commit 1.
