# Staff authentication and permissions

Staff users have independent IDs, bcrypt hashes and the `rubizh_staff` PHP session. Customer OTP, Google or an email allowlist cannot create a staff session. Cookies are HttpOnly, SameSite=Strict and Secure over HTTPS, scoped to `/api/staff`. Login rotates the session and CSRF token. Absolute expiry is eight hours, idle expiry thirty minutes; enabled status and session_version are checked on every request. Staff changes revoke existing sessions. Passwords use 12–72 bytes, respecting bcrypt's byte limit. Failed logins have account/IP throttles and hashed security audit identifiers.

All mutations check CSRF and exact same-origin scheme/host. HTTPS is required; a spoofed X-Forwarded-Proto does not grant it. HTTP is permitted only for loopback staging fixtures. The backend permission check is authoritative even if a frontend action is hidden.

| Permission | OWNER | MANAGER | LOGISTICS | READ_ONLY |
|---|---|---|---|---|
| payment.view | yes | yes | yes | yes |
| payment.invoice.create / resend | yes | eligible confirmed order | no | no |
| payment.refund.request / execute | yes | no | no | no |
| payment.manual_reconcile | yes | no | no | no |
| order.price_override / total_override | yes | no | no | no |
| financial.audit.view | yes | no | no | no |
| order.confirm | yes | yes; cannot approve reprice | no | no |
| shipment.manage | yes | no | yes | no |
| order assignment | yes | yes | no | no |
| note.create | yes | yes | yes | no |
| return.create | yes | yes | no | no |
| physical return transitions | yes | yes | transit / received only | no |
| inventory decision / refund allocation | yes | no | no | no |
| settings / staff mutations | yes | no | no | no |

Financial corrections require OWNER, a mandatory reason and immutable old/new domain audit. Staff audits and internal notes have database UPDATE/DELETE rejection triggers. The owner audit feed reads the existing financial domain audit alongside staff activity; others cannot read its financial corrections. The last enabled OWNER cannot be disabled or downgraded.

Provision the first staff user with `dev/staff-user.php`; give the password through stdin, never a command argument, Git or a report. Roles are administrative configuration, not a client-supplied claim. The private hosting DB account should allow runtime DML but have no DDL or trigger removal permissions; use a separate migration operator.
