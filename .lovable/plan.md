# Luma Polish & Functionality Update

Scope: targeted polish — no rip-and-replace. Existing CRUD, Supabase, Stripe, auth, integrations stay untouched. I'll work in phases so you can review between batches.

---

## Phase 1 — Foundations (Global)

**Bottom nav + floating add (mobile)**
- Fix z-index/stacking so the floating `+` always sits above the bar and page content (currently the bar's `mx-2 rounded-t-3xl` clips behind it on some viewports).
- Increase touch targets to 44px min, add safe-area padding properly, refine glass blur + shadow.
- Add a global spacer utility so pages never hide content behind the bar.

**Responsive audit pass**
- Convert problematic flex header rows to the `grid-cols-[minmax(0,1fr)_auto]` pattern with `min-w-0` / `shrink-0` / `truncate` (per project guideline).
- Audit Dashboard, Reports, Payments, Bookings, Customers, Staff, Services, Settings for overflow on 360–414px widths.
- Make all tables horizontally scrollable inside a `overflow-x-auto` wrapper with sticky first column where useful.
- Replace `h-screen` with `h-dvh` where found.

**Accessibility quick wins**
- Add `aria-label` to all icon-only buttons.
- Visible focus rings via `focus-visible:ring-2 ring-primary/40`.
- Color-contrast sweep on `text-muted-foreground` over pastels.

---

## Phase 2 — Calendar & Opening Hours

**Calendar**
- Render only between earliest open → latest close across the week (derived from `business_hours`), with a 1-hour pad. No more 12am–11pm dead space.
- Sticky staff headers (already partial — fix on iOS Safari).
- Live current-time indicator only on today's column.
- Better overlapping booking handling: side-by-side fan-out within a slot rather than stacking.
- Tighter mobile day view: single-staff swipeable column with pill selector at top.

**Opening Hours settings page (new)**
- New tab in Settings → "Hours" rebuilt:
  - Per-day enable/disable.
  - **Multiple periods per day** (e.g. 9–13, 14–18) → requires a small schema change: replace single open/close with a `periods jsonb` column on `business_hours` (kept backward-compatible by reading legacy `open_time`/`close_time` as a single period).
- Slot engine (`src/lib/slots.ts`) updated to iterate over periods.

---

## Phase 3 — Bookings

**Guided multi-step booking dialog**
Rebuild `new-booking-dialog.tsx` as a 7-step wizard with progress bar:
1. Customer (live search of existing + inline "Create customer" without leaving)
2. Service
3. Staff (filtered by service)
4. Date & Time (with the redesigned strip)
5. Payment / deposit (uses existing payment columns; no Stripe logic changes)
6. Notes (public + private)
7. Confirmation summary

**Custom / staff-only bookings**
- Add a "Custom booking" toggle inside the wizard (visible only to staff/owner — public booking page unchanged).
- Schema: add `is_custom boolean`, `custom_title text`, `custom_color text` to `bookings`. Service/customer become optional when `is_custom`.
- Calendar shows them with a dashed border + "Custom" pill.

**Booking cards**
- Add icon row (VIP, Deposit, Walk-in, Notes, Online) — already partly there; standardize and add to week/month views.
- Tighten typography & spacing.

---

## Phase 4 — Staff & Customers

**Staff profile page (new route)**
- `/staff/$id` with tabs: Information · Availability · Services · Performance · Holidays · Documents (stub).
- Replace long-press editing on the staff list with explicit Edit/Availability/Services/Performance/Holiday/Delete buttons (kebab menu on mobile).

**Staff performance filters**
- Date-range presets (Today, Yesterday, This/Last Week, This/Last Month, YTD, Custom) + comparison period toggle. Recharts updates in place.

**Customer enrichments**
- Add structured fields to `customers`: `hair_type`, `allergies`, `color_formula`, `medical_notes`, `preferred_staff_id`, plus existing notes for private internal.
- Improved search (already exists) + better duplicate hints in the merge dialog.

---

## Phase 5 — Dashboard polish

- Wrap chart containers in `min-w-0` + `ResponsiveContainer` height clamps.
- Business Insights card converts to horizontal scroll on mobile instead of clipping.
- Stat cards use `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` with proper truncation.

---

## Phase 6 — QA

Use Playwright via shell at 390×844 (mobile), 820×1180 (tablet), 1440×900 (desktop) to:
- Screenshot every authenticated route.
- Verify floating + button is clickable on mobile.
- Verify calendar scroll, booking wizard flow, opening-hours save.
- Capture any remaining overflow/clipping and patch.

---

## Database changes (single migration in Phase 2/3)

1. `business_hours.periods jsonb` — array of `{open, close}` (nullable; legacy columns kept).
2. `bookings.is_custom boolean default false`, `custom_title text`, `custom_color text`; relax `service_id`/`customer_id` to nullable when custom.
3. `customers` add `hair_type`, `allergies`, `color_formula`, `medical_notes`, `preferred_staff_id uuid references staff`.

All additive, RLS unchanged, existing data untouched.

---

## What I will NOT touch
- Stripe Connect / payments logic.
- Resend / Twilio / Google Calendar integrations.
- Auth flows, RLS policies, edge functions, AI assistant.
- Public booking page behaviour (only visual polish if needed).
- Demo seed data.

---

## Delivery order

I'll ship in this order, pausing after each so you can sanity-check:

1. Phase 1 (foundations + bottom nav fix) — fastest visible win.
2. Phase 2 (calendar + opening hours, incl. migration).
3. Phase 3 (booking wizard + custom bookings, incl. migration).
4. Phase 4 (staff profile + customer fields, incl. migration).
5. Phase 5 + 6 (dashboard polish + QA sweep).

Reply **"go"** to start Phase 1, or tell me to reorder / drop any phase.