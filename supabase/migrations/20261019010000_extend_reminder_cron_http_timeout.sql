-- The reminder sweep now includes payment recovery, delivery retries and
-- review requests. pg_net's implicit HTTP timeout is only five seconds;
-- the database job can succeed after merely queueing a request while that
-- request times out and never records a successful application heartbeat.
--
-- Apply only after reviewing the pending production recipients. A successful
-- next tick may send due reminder and review-request messages.
select cron.schedule(
  'send-booking-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://bookzenvo.com/api/cron/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'cron_reminder_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
