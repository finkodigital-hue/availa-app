-- Older functions pre-date the private-by-default function policy introduced
-- in 20260902120000. PostgreSQL grants EXECUTE to PUBLIC when a function is
-- created unless that default is explicitly revoked. Keep only the RPCs that
-- are intentionally reachable before sign-in and remove direct access to
-- member-only RPCs and trigger implementation details.

revoke execute on function public.adjust_booking_stock_deduction(uuid, numeric) from public, anon;
revoke execute on function public.create_staff_booking(uuid, uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, integer, integer, integer, text, text, boolean, boolean, text, text, text, integer, integer, text) from public, anon;
revoke execute on function public.ensure_business_hours(uuid) from public, anon;
revoke execute on function public.generate_rent_payment(uuid) from public, anon;
revoke execute on function public.move_booking(uuid, timestamptz, timestamptz, uuid) from public, anon;
revoke execute on function public.reassign_staff_bookings(uuid, uuid, boolean) from public, anon;
revoke execute on function public.reschedule_booking(uuid, timestamptz) from public, anon;

-- Trigger functions are invoked by their installed triggers. They are not an
-- application API and do not need direct execution grants for browser roles.
revoke execute on function public.delete_reviews_before_customer_erasure() from public, anon, authenticated;
revoke execute on function public.enforce_staff_plan_limit() from public, anon, authenticated;
revoke execute on function public.enforce_staff_plan_limit_on_activate() from public, anon, authenticated;
revoke execute on function public.enqueue_calendar_sync() from public, anon, authenticated;
revoke execute on function public.invalidate_tokens_on_reschedule() from public, anon, authenticated;
revoke execute on function public.notify_booking_cancelled() from public, anon, authenticated;
revoke execute on function public.notify_booking_created() from public, anon, authenticated;
revoke execute on function public.notify_consultation_signed() from public, anon, authenticated;
revoke execute on function public.notify_low_stock() from public, anon, authenticated;
revoke execute on function public.notify_payment_failed() from public, anon, authenticated;
revoke execute on function public.record_support_ticket_change() from public, anon, authenticated;
revoke execute on function public.reset_reminder_state_on_reschedule() from public, anon, authenticated;
revoke execute on function public.set_google_calendar_connection_updated_at() from public, anon, authenticated;
revoke execute on function public.sync_booking_to_google_calendar() from public, anon, authenticated;

-- Pin the remaining legacy mutable paths. pg_temp is deliberately last so a
-- caller cannot shadow an intended object with a temporary object.
alter function public.adjust_booking_stock_deduction(uuid, numeric) set search_path = public, pg_temp;
alter function public.invalidate_tokens_on_reschedule() set search_path = public, pg_temp;
alter function public.reset_reminder_state_on_reschedule() set search_path = public, pg_temp;
alter function public.set_google_calendar_connection_updated_at() set search_path = public, pg_temp;
