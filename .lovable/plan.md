# Independent Professionals (Chair Rental)

End-to-end delivery, sequenced into 5 milestones. Each milestone is shippable on its own and I'll verify before moving on.

## Model (the load-bearing decision)

Every professional — employee OR independent — is a `staff` row on **exactly one** `businesses` row (their own). An independent pro creates their own `businesses` row when they accept an invite. A new `salon_professionals` link table connects the salon business to the pro's business.

```text
businesses (salon)  ──┐
                      ├──> salon_professionals ──> businesses (pro's own)
                      │         (rent terms,           │
                      │          permissions,          ├─> staff (Sarah)
                      │          status)               ├─> services
                      │                                ├─> customers
staff (Emma, Jordan)  ┘                                └─> bookings
```

Bookings, customers, services always live on the **owning** business. The salon's calendar aggregates: own staff bookings + linked-and-visible pros' bookings via a security-definer function that respects each pro's permission flags. Nothing about a pro's business is ever readable via RLS from the salon side.

## Milestone 1 — Foundation: invites, link table, dual dashboard

New tables (all with GRANTs + RLS):
- `professional_invitations` (salon_business_id, email, token, status, expires_at, rent terms snapshot)
- `salon_professionals` (salon_business_id, pro_business_id, status, permissions jsonb, rent fields, agreement dates, chair label)
- `rent_payments` (salon_professionals_id, period_start, period_end, amount_cents, status, paid_at)

Flows:
- Salon: **Team** page (renamed from Staff internally kept; UI shows "Team" with two tabs — Employees / Independent professionals). Invite by email, revoke, view status.
- Pro accept: `/invite/:token` — signs up, creates their own `businesses` row (reuses onboarding), the link flips to `active`.
- On sign-in, if a user owns >1 business (rare) or is linked as a pro, we show a business switcher in the header. Otherwise identical to today.

RLS: `salon_professionals` readable by both sides; writable only by salon owner (permissions column writable by pro).

## Milestone 2 — Shared calendar & public booking

- New RPC `get_salon_calendar(salon_business_id, from, to)` (SECURITY DEFINER, checks caller is salon owner, returns bookings from salon + every linked pro whose permissions allow calendar visibility). Independent pros' bookings surface with a lock icon and hide customer/notes when permission is off.
- Salon calendar UI: pros appear as columns alongside employees, distinct color, "independent" chip.
- Public `/book/:slug` (salon slug): pro list = salon staff + linked pros' staff. Service list = union (deduped by name for display, but each option carries which business owns it). Time slots respect the owning pro's `staff_hours`, `blocked_dates`, and existing bookings.
- `create_public_booking` becomes `create_public_booking_v2` — routes the booking to the correct owning business based on the selected pro. Customer row is created on the owning business.
- Salon owners can create/move a pro's booking only if that pro's permissions allow it (checked in an updated `enforce_booking_change_window`-style trigger).

## Milestone 3 — Stripe Connect payments

- Salon and each pro connect their own Stripe account (Standard Connect) via OAuth. Store `stripe_account_id` per business.
- Server route `/api/public/stripe/oauth/callback` completes the connection.
- Checkout: server fn creates a Stripe Checkout Session using `stripe_account: <owning business's account>` — money lands directly in that account. Salon never touches pro funds.
- Webhook `/api/public/stripe/webhook`: signature-verified, upserts into `payments` scoped to the owning business.

You'll need: **Stripe secret key** (platform) + **Stripe webhook signing secret** — I'll request via add_secret at this milestone, not now.

## Milestone 4 — Rent management

- Salon `/rent` page: per-pro rent terms (weekly / monthly / % of revenue / fixed commission), agreement dates, due day.
- `rent_payments` ledger with "Mark paid / Record payment / Outstanding". A daily server route (`/api/public/cron/generate-rent`) generates upcoming rent rows from active agreements — you'll wire pg_cron or an external scheduler to hit it.
- Salon-only visibility. Pros see only what they owe (a stripped-down view of their own rows), never salon totals.

## Milestone 5 — Permission toggles & isolated reports

- Per-pro permission UI (on the pro's Settings): calendar visible, salon can book, salon can move, availability visible. Revenue / reports / customer notes are hardcoded private — no toggle.
- Reports and analytics scoped strictly to `current business`. Assistant context builder already scopes by business; audit and lock down.
- Final RLS sweep and a security scan.

## Technical notes

- `useMyBusiness` becomes `useCurrentBusiness` returning `{ business, role: 'salon_owner' | 'independent_pro', linkedSalons, linkedPros }`. Business switcher writes selected id to localStorage; server fns read it from a header the attacher adds.
- All new tables: `GRANT ... TO authenticated`, `GRANT ALL ... TO service_role`, RLS on, policies scoped via `is_business_owner` and a new `is_linked_pro_of(salon_id)` security-definer helper.
- Zero cross-business SELECT policies — the salon's aggregate calendar goes only through the SECURITY DEFINER RPC, which filters columns by permission.
- Public booking stays anon-writeable only through the RPC.

## What I'd like to confirm before I start Milestone 1

1. Rent model: is a pro on **one** rent term at a time (weekly OR monthly OR %) or can they be combined (e.g. weekly base + % commission)?
2. Independent pro's public presence: should they appear only on the salon's `/book/:slug`, or also get their own `/book/:their-slug` standalone page? Spec says "customers should never notice Sarah owns a separate business," which suggests salon-only — confirm.
3. On invite acceptance: do we reuse the full existing onboarding wizard (business name, hours, services, etc.) for the pro, or a slimmed-down version (name + timezone only, defaults for the rest)?

I'll wait for those three answers, then start with Milestone 1.
