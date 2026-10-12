# Unapplied PIM proposals

Base: PIM `21198461f8ebb2eadef6dcd6fb77a50a8a038ea9`. PIM source remains unchanged; 682/682 baseline tests passed locally. The complete patches were checked with `git apply --check` and were not applied. The public PIMC-P1 file is a notice, not an executable patch; its complete proposal and reproduction remain private.

| ID | Severity | Status / proposed correction |
|---|---|---|
| PIMC-P1 | HIGH | CONFIRMED / PIM OWNER DECISION; details private until corrected |
| PIMC-P2 | MEDIUM | Prior raw report: stale-stock policy; owner proposal, no patch in this checkpoint |
| PIMC-P3 | MEDIUM | Apply invalid/broken photo evidence consistently to color galleries |
| PIMC-P4 | MEDIUM | Keep request-only size assortment scoped to its color |
| PIMC-C1 | LOW | Correct stale manifest hash for the exact wire fixture |

PIMC-P3/P4 contain proposed regression tests. Applicability does not establish corrected runtime behavior: the PIM owner must apply/review the changes, rebuild `app/rubizh_pim.html` with the repository tool, and run the relevant publication/inventory/size suites. No SITE prices, provider activation or production data were changed.
