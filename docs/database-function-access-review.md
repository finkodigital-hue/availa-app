# Database function access review — 26 September 2026

Read-only production inspection found 23 public-schema security-definer functions executable by anonymous callers. Every function returned by that query had an explicit search path. This narrow result does not clear the advisor's separate invoker-function, storage-policy or public-view findings.

`notification_preference_enabled(uuid,text)` was an internal trigger helper but could disclose a business's notification flags to arbitrary callers. Repository call-site review found only security-definer trigger callers. Migration 20260926001000 removes public, anonymous and authenticated direct execution; server access and those trigger callers remain.

Seven identity-dependent operations also inherited PUBLIC execution: professional-invitation acceptance, customer export/visit statistics, portal bookings/customer records, customer data-action requests and staff-invitation revocation. Their internal identity checks remain; anonymous/PUBLIC grants are removed and authenticated/server execution is explicit. Public storefront discovery and token-based invitation lookup remain unchanged.

All 133 application migrations replay locally. Nine new assertions verify the exact grants and that a payment-failure notification still reaches the local feed through its trigger. The existing full-schema owner/customer/invitation checks continue to pass. This is not a full Supabase runtime, provider-send test or independent security review.

Remaining advisor work includes a reviewed inventory of public security-definer projections, invoker functions with mutable search paths, storage listing policy, effective MFA/recovery settings and realistic cross-tenant/provider journeys. Do not clear warnings in bulk or switch public availability views to invoker mode without checking storefront behaviour.
