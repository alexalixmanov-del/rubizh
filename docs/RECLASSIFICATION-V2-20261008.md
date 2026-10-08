# Reclassification v2 — first stage, before the new kit engine

The catalogue is classified again from the sold object and its relationships. Old automatic category relations are comparison data, not classification evidence. The new kit engine is deliberately not included or activated in this release.

## Canonical identity and evidence

`shop/canonical-taxonomy.json`, version `20261008-v2`, is the single dictionary. Protected `GET /api/pim/categories` returns its version, aliases and categories. `bags_tactical → bags_backpacks` and `pouches_ifak → pouches_medical` remain explicit deprecated aliases; old URLs and banner mappings continue to resolve.

The semantic parser scores noun phrases in the primary object, separates relational tails and supplied components, and applies type relationships before selecting a category. It distinguishes rechargeable flashlights from batteries, medical pouches from magazine dump pouches, protective elements for RPS from RPS itself, and costumes from their included trousers. Attributes are preserved; explicit missing season, protection class and plate dimensions can be derived from the name. Unknown information is not manufactured. This is a deterministic linguistic parser, not a language model or a measured whole-catalogue accuracy score.

Manual locks win over imports. Confirmed PIM categories retain authority; contrary semantic evidence records `CATEGORY_ANOMALY`. Supplier fallback is limited to an unambiguous leaf whose sold object agrees with the category; broad mixed branches do not become automatic rules. Manual correction does not create a supplier-wide rule.

## Review and apply

`dev/reclassify-catalog-v2.php` defaults to dry-run. It connects without implicit schema migration, reads every product, checks protected fingerprints, and exports private `dry-run.json`, `all-products.csv`, `changes.csv` and a SHA256 sidecar. Reports include the old category, proposal, supplier context, evidence, semantic fields and review status. CSV formula-like text is escaped. Nothing is applied by generating a report.

The installer deploys source, repairs public photo permissions/queues, prepares existing runtime/indexes and runs a fresh dry-run. **It never invokes Reclassification v2 apply.** The uploaded task requires: “НЕ применять сразу. Сначала dry run. Показать…”. A fresh live report must be reviewed before the separate apply command:

```sh
php dev/reclassify-catalog-v2.php --apply --report-file=/PRIVATE/REPORT/dry-run.json --sha256=REVIEWED_SHA256
```

Apply serializes against PIM imports, recomputes the plan, rejects changed data or decisions, creates a private complete database/media backup, changes canonical relations/decisions/aliases, records an audit and activates `classifier_version=semantic-v2`. It verifies exact row fingerprints for products, variants, photos, legacy categories, fulfillment and supplier articles before commit. Orders and accounts are not rewritten. Review items keep their existing category and get a review decision; future automatic recommendations must exclude unresolved decisions.

```sh
php dev/reclassify-catalog-v2.php --rollback=/PRIVATE/BACKUP/taxonomy-...
```

Rollback restores only category tables and classification metadata, retains audit history, and rejects any later product/category change. It does not restore account/order tables or replace the entire database. Filesystem media backup is recovery evidence, not deleted or overwritten by the category rollback.

## Validation scope

A restored snapshot dated 7 October contains 2,457 products, 7,336 variants and 15,037 photo records. The fixture does **not** contain live customer data or actual private supplier-identity rows. Its supplier-identity tables are empty; separate seeded MariaDB tests verify supplier identities and manual/PIM authorities.

The regression fixture contains 360 real product names across 61 leaf categories and 18 roots, with labels based on sold-object identities. Corrections to ambiguous or erroneous fixture labels are annotated. It is a regression fixture, not a calibrated production accuracy sample or administrator approval for mass rules. Additional adversarial cases check phrase relationships and false substring matches. MariaDB tests cover read-only dry-run, checksum/staleness rejection, apply, category-only rollback and later-import refusal. Full-snapshot apply/rollback is tested only in the isolated database.

## Photo speed and size selection in this release

Background jobs previously inherited `umask 077`; newly generated public WebP files could be `0600` and folders `0700`, preventing nginx from serving them. The photo writer now atomically publishes only generated public images with files `0644` and folders `0755`. Repair is restricted to the expected hashed public-photo paths; it does not make private configuration or customer files readable.

GD writes main images up to 1600px and 480px WebP thumbnails. The existing minute cache worker processes a bounded batch (8 photos / 12 seconds), then warms caches, within an overall 45-second budget. It reuses a single worker lock and does not install a second cron job. The first visible catalogue images get loading priority. A measured sample reduced a 996,577-byte supplier PNG to a 15,092-byte thumbnail. This sample is not a promise that every photo is 66 times smaller or that hosting/network latency disappears. Old images need the background queue to finish; images requiring access to suppliers are verified on hosting after installation.

The full product page deduplicates visible size labels for the selected colour while retaining distinct SKU offers. Colour changes refresh size availability and cart uses the chosen exact SKU. This does not infer missing sizes and is not the new kit engine.

Security/admission limits remain in place from the preceding release. No 10,000-buyer capacity claim is made for shared hosting. External database/backups and Telegram/email monitoring remain paused and unconfigured.

A reviewed individual correction can be locked explicitly from CLI before regenerating the report:

```sh
php dev/reclassify-catalog-v2.php --lock --product-id=PRODUCT_ID --category-id=CANONICAL_LEAF_ID --reason='Administrator reviewed the sold object'
```

This changes one category and adds an audit event. It does not train or activate a supplier-wide rule. The external PIM user interface has not been modified; its protected dictionary API and import behavior are implemented in this repository.
