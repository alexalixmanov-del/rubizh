# Existing integrations

MonoPay uses the existing `monoApi`, invoice table, signed webhook verification, public-key cache and event dedupe. CRM adds partial cancellation intents, extRef correlation and successful refund allocation evidence. It does not introduce a second transport or client-side payment validation. A status poll remains diagnostic; it cannot mark PAID. Timeout/unknown outcomes stop automatic retries. The original site refund endpoint cannot bypass the cumulative ledger.

Nova Poshta uses the existing directory verification, sender/counterparty/contact checks, `npDraft`, `npCreate`, `npReconcile`, `npRefresh`, aggregate order state, tracking and cron. CRM stores profiles with actual city, warehouse, cargo warehouse, counterparty, contact, phone and region. Incomplete profiles return SENDER_PROFILE_INCOMPLETE before a remote mutation. The existing adapter verifies refs against the provider's directory and business account at TTN creation.

The existing M-WIN profile names Ксаверівка, while the requested operational label names Вінниця. Migration preserves the audited existing value; OWNER can update city/region/refs after provider verification. It never substitutes guessed identifiers. The Tactical Belt region must also be confirmed. Known names or warehouse numbers are not API references.

PIM remains the inventory/catalog authority. CRM displays product and price snapshots from orders, and resolves requests using current real SKU candidates. No catalogue editing or supplier offer management is implemented in CRM.

The HTTP integration and browser tests use private fixture transports injected by server-side test files; no HTTP input enables a mock. They exercise the real SITE services, signed crypto verification and MySQL transactions. No real MonoPay cancellation or real NP TTN was issued. Live merchant cancellation contract, refund callback shape and NP business refs must be verified on owner-approved staging before rollout. No production credentials or outbound notifications were used.
