-- A rescheduled appointment needs a reminder for its new time, even if an
-- SMS reminder was already sent for the original time. Consent remains tied
-- to the same booking; only the send marker is reset.
create or replace function public.reset_reminder_state_on_reschedule()
returns trigger language plpgsql as $$
begin
  if new.starts_at is distinct from old.starts_at then
    new.reminder_sent_at := null;
    new.sms_reminder_sent_at := null;
    new.client_confirmed_at := null;
  end if;
  return new;
end $$;
