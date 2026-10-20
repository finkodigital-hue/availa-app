-- The sweep performs multiple database/provider calls. pg_net's default
-- five-second timeout disconnects before completion and can cancel the Worker.
-- Keep the existing named job, cadence and Vault authentication; do not invoke
-- the sweep here. Two minutes remains well below the fifteen-minute interval.
select cron.schedule(
  'send-booking-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://bookzenvo.com/api/cron/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'cron_reminder_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
