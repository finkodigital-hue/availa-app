# Production-Readiness Implementation Plan

Scope is large. I'll group into one migration + focused frontend/feature work, then a QA pass. Everything aligns with the existing Luma stack (TanStack Start, Supabase, Tailwind, "Editorial Light" UI).

## 1. Database migration (single migration)

New/changed schema:
- `customers`: add `phone_normalized` (generated/managed), unique `(business_id, lower(email))` and `(business_id, phone_normalized)` partial indexes for safe matching.
- `staff`: add `active` boolean (default true) for soft-disable; keep delete but UI uses disable.
- `staff_hours`: new table — per-staff weekday open/close/closed, mirrors `business_hours` shape. RLS via `is_business_owner`.
- `service_staff`: already exists — wire UI.
- `services`: add `buffer_before_min`, `buffer_after_min`, `color` (already partially present — verify and fill gaps).
- `bookings`: add `source` enum ('online','walkin','manual'), `notify_customer` boolean default true.
- `business_media`: new table for gallery — `business_id`, `kind` ('cover','logo','interior','team','portfolio'), `path` (storage key), `sort_order`, `created_at`. RLS owner write / public read.
- Trigger on `auth.users` insert (extend `handle_new_user`): link any `customers` rows with matching email to the new `auth_user_id` (preserve history when a guest later signs up).
- Slot computation: keep client logic in `src/lib/slots.ts` but extend to honor `buffer_before_min`/`buffer_after_min` and per-staff hours fallback to business hours.

Storage:
- Reuse `business-assets` bucket. Add policies allowing owners to upload under `{business_id}/...` and public read for gallery (signed URLs OK; simplest is allow public SELECT on `business-assets` for paths under businesses with `published=true` — but bucket is private, so use signed URLs in `book.$slug.tsx`).

## 2. Walk-in / Manual Bookings

- New dialog `NewBookingDialog` reachable from Calendar header ("New booking") and Dashboard quick action.
- Steps: Customer (search w/ debounce against `customers` by name/email/phone) → pick service → pick staff → pick date/time (reuse `useAvailableSlots`) → notes + "Send confirmation email/SMS" toggle.
- Customer search: if no match, inline "Create new customer" form (name/email/phone), dedup on insert by `(business_id, lower(email))` / phone_normalized; on conflict return existing.
- Insert booking with `source='walkin'`, `notify_customer=<toggle>`.
- Calendar + lists show a "Walk-in" badge.

## 3. Staff Management

Expand `_authenticated/staff.tsx`:
- Edit existing fields (already partial) + photo upload (storage `business-assets/staff/{id}.jpg`, signed URL for display).
- "Active" toggle (soft-disable) replaces destructive default; Delete moves behind a confirm dialog and is blocked if bookings exist (then suggest disable).
- "Working hours" tab inside edit dialog — 7-day editor like business hours, persists to `staff_hours`.
- "Services" tab — multi-select chips writing `service_staff`.

## 4. Business Preview Mode

- "Preview booking page" button in app shell + Settings header.
- New route `/_authenticated/preview` with a device toggle (mobile 393 / desktop 1280) rendering `book.$slug.tsx` in an `<iframe>` pointing at `/book/{slug}?preview=1`.
- Booking page reads `preview=1` to disable real submissions (button shows "Preview — bookings disabled").

## 5. Business Gallery

- New Settings section "Gallery" with sections per `kind`: Cover (1), Logo (1), Interior/Team/Portfolio (many).
- Upload via Supabase Storage → insert `business_media` row.
- Drag-and-drop reorder using `@dnd-kit/sortable` (add dep) → batch update `sort_order`.
- Delete with confirm.
- Image optimisation: client-side resize/compress to max 1920px webp before upload (canvas).
- Booking page: hero uses cover, header uses logo, "Gallery" strip shows interior+portfolio.

## 6. Custom Service Durations

- Services form: ensure duration uses 5-min step, buffer before/after inputs (5-min), color picker, staff multi-select.
- Slot engine: subtract buffers from availability windows when computing `useAvailableSlots`.

## 7. Customer Linking

- DB trigger on customer insert/update normalises phone (`regexp_replace(phone, '\D', '', 'g')`) into `phone_normalized`.
- Unique partial indexes prevent dupes per business.
- `handle_new_user` extended: `UPDATE customers SET auth_user_id = NEW.id WHERE auth_user_id IS NULL AND lower(email) = lower(NEW.email)`.
- "Merge customers" utility on customers page: pick two → moves bookings, concatenates notes, deletes loser inside a transaction (RPC `merge_customers(winner, loser)` SECURITY DEFINER, owner-checked).

## 8. UI Improvements

- Replace `confirm()` calls with `<AlertDialog>` for destructive actions.
- Add skeletons to Calendar and Customers pages.
- Polish empty states for Gallery, Staff hours, Services.
- Toast on every mutation success/failure (sonner — already in place).
- Mobile: ensure dialogs use `sm:max-w-*` + scroll; calendar list view on small screens.

## 9. QA

- `bun run build` and `tsgo` clean.
- Drive Playwright through owner flow: create walk-in, disable staff, upload gallery image, preview page, book as customer; capture screenshots.
- Verify RLS by querying with anon key for negative cases.

## Out of scope

- Stripe/Resend/Twilio/Google integrations (paused awaiting credentials).
- Cross-business customer merging (kept per-business).

## Technical Notes

- New deps: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
- All new tables get `GRANT` + RLS in the same migration.
- Storage bucket `business-assets` remains private; booking page uses `createSignedUrl` (1h) cached via React Query.
- Slot logic stays client-side for now; trigger-side double-booking guard remains on `bookings` via existing unique exclusion (verify).

Proceed?
