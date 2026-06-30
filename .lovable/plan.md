# Luma → Premium Business Platform

A focused, shippable upgrade across five areas. Built in one pass with production-quality code, mobile-first responsive layouts, and a cohesive editorial-light look that matches Luma's existing branding.

## 1. Multi-Staff Calendar (new primary screen)

Replace `src/routes/_authenticated/calendar.tsx` with a staff-column scheduler.

- **Views**: Day (staff columns), Week (date columns, staff filter), Month (event grid).
- **Layout**: sticky header with staff avatar + name + service-color legend; 15-min grid; current-time indicator; smooth scroll; pinch/scroll-friendly on mobile (horizontal swipe between staff on Day view).
- **Bookings**: rendered as colored blocks using each service's `color_hex`; height = duration; show customer + service + time.
- **Interactions**:
  - Tap empty slot → opens existing `NewBookingDialog` prefilled with staff + time.
  - Tap booking → details sheet with **Edit, Reschedule, Cancel, Mark complete, Mark no-show**.
  - **Drag-and-drop** bookings between staff columns and time slots (HTML5 DnD). Updates `staff_id` + `starts_at`/`ends_at` atomically; respects service duration and buffers; rolls back on conflict.
- **Walk-In**: prominent "New walk-in" button in the page header, also accessible from any empty cell.
- **Performance**: single query for day/week range, memoized layout, virtualization-friendly structure.

## 2. Staff Availability & Time Off

Builds on existing `staff_hours` and `blocked_dates` tables.

- **Per-staff weekly hours**: existing `StaffHoursEditor` becomes the canonical schedule editor; surface it as a tab on the staff detail dialog and on a new `/staff/$id` route.
- **Time Off**: extend `blocked_dates` with a `kind` enum (`holiday | vacation | sick | break | training | other`) and an optional `title`. New "Time off" tab per staff with a list + "Add time off" dialog (date range, all-day toggle, kind, optional note). These already block the calendar and booking slots via `useAvailableSlots`.

## 3. Staff ↔ Services

Already modelled via `service_staff` and edited through `StaffServicesEditor`. Two fixes:

- Public booking page (`book.$slug.tsx`) filters staff by selected service using `service_staff` (skip filter when service has no links → "anyone").
- Calendar booking dialog filters the staff dropdown the same way.

## 4. Walk-In Booking Flow (fast path)

Polish `NewBookingDialog` for receptionist speed:

- Step 1: pick staff + time (prefilled from cell tap).
- Step 2: customer search across **name / email / phone** with debounced query; "Create new customer" inline if no match (name + phone minimum).
- Step 3: pick service (only services the staff performs).
- Submit → booking appears immediately via query invalidation.

## 5. Premium Dashboard (new home)

Rebuild `src/routes/_authenticated/dashboard.tsx` as the post-login landing page with these sections:

- **Today's Overview** — Revenue, Bookings, Upcoming, Cancelled, New customers, Avg booking value.
- **Revenue analytics** — Range toggle (Today / Week / Month / Year). Revenue trend (area chart) + Booking trend (bar chart) using `recharts`.
- **Staff performance** — Cards per staff: revenue, bookings, avg value, avg duration, utilisation %. Sort by revenue / bookings / utilisation / repeat customers.
- **Service analytics** — Table of most popular services with bookings, revenue, avg price, avg duration.
- **Customer analytics** — New vs returning split, top spenders, lapsed customers (no booking in 60 days), lifetime value.
- **Business insights** — Auto-generated: busiest/quietest day + time, best staff, best service.
- **Monthly goals** — Editable Revenue / Bookings / Customer targets with progress bars. New `business_goals` table.

All charts use `recharts` (already shadcn-compatible) with branded colors from existing CSS tokens.

## 6. Navigation refresh

Update `AppShell` sidebar order and add missing entries:

`Dashboard · Calendar · Bookings · Customers · Staff · Services · Payments · Reports · Settings · Assistant`

- **Bookings**: new list view (`/bookings`) with filters (status, staff, date range) — table on desktop, cards on mobile.
- **Payments**: new page (`/payments`) listing rows from existing `payments` table with status badges, totals, and refund action stub.
- **Reports**: dedicated `/reports` route hosting deeper analytics (revenue export CSV, staff/service breakdowns) — surfaces the dashboard charts at larger sizes with date pickers.

## Database changes (single migration)

1. `ALTER TABLE blocked_dates ADD COLUMN kind text DEFAULT 'other', ADD COLUMN title text`.
2. `CREATE TABLE business_goals` (business_id, month date, revenue_cents_target, bookings_target, customers_target) with RLS scoped to business owner + standard GRANTs.

## Out of scope this turn

Realtime calendar updates, recurring time-off, payments refund API call, CSV import. Hooks are left in place to add later.

## Technical notes

- DnD via native HTML5 drag events (no new dep) with optimistic update + rollback toast on conflict.
- Charts via `recharts` (add if missing).
- All new pages reuse `PageHeader`, `Skeleton`, `EmptyState`, branding tokens — no hardcoded colors.
- Mobile-first: Day view defaults to single-staff swipeable on <640px; dashboard uses 1-col → 2-col → 4-col grids.
