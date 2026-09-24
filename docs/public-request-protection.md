# Public request protection — 24 September 2026

Shared database counters protect public booking, appointment/gift-card Checkout, waitlist registration and authentication attempts through the website gateway. Per-source limits span application instances and business IDs, with separate action categories.

| Action | Per UTC minute | Per UTC day |
|---|---:|---:|
| Free booking/appointment Checkout | 20 | 200 |
| Gift-card Checkout | 10 | 100 |
| Waitlist | 3 | 20 |
| Website authentication | 30 | 600 |

Session refresh/logout are excluded. Supabase's native authentication controls remain necessary for direct Supabase requests. Existing business/contact, payment reservation, AI/SMS limits remain. Shared networks can reach these safeguards and need support; they are not plan entitlements. Distributed botnets and volumetric attacks require additional provider controls and staging load tests.

Production uses Cloudflare's `CF-Connecting-IP`, rejecting missing/malformed values without trusting visitor-supplied forwarded headers. A daily HMAC-SHA256 key uses a server-only existing secret and purpose label. Raw addresses, emails and user agents are not stored in the new table. Counters expire after two days and are removed by bounded request cleanup and the protected scheduler. New gift-card order request keys derive from this keyed source instead of a plain address hash; order records have their own retention policy.

The table and counter/cleanup functions are service-role-only. Protection failures stop the action with a generic message. HTTP routes return 429 with Retry-After for exhaustion or 503 for unavailable protection; server functions return a safe retry message.

## Rollout order

1. Apply `20260924001000_public_request_limits.sql`.
2. Deploy the server limiter and server-credential free-booking call; verify its live release marker.
3. Apply `20260924002000_public_writes_through_server.sql`, removing direct anonymous/member execution of booking/waitlist write RPCs. Discovery remains public. Older application rollback requires a reviewed compatibility plan; do not silently reopen the bypass.

32 isolated assertions cover windows, sources/scopes, expiry, direct access, daily HMAC rotation, spoofed forwarded headers, missing configuration and safe failures. Complete application-schema tests also reject direct booking/waitlist writes and verify the server still creates a booking with authoritative price/duration. No live spam burst, customer message, payment or DDoS certification is claimed.

Reference: [Cloudflare HTTP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/) documents the visitor header and Worker subrequest caveats. This assumption is specific to the current Cloudflare-hosted deployment; changing hosting requires review.
