-- Independent, permanent SMS kill switch for imported/demo workspaces.
-- The server reads this value fresh before every Twilio provider request and
-- fails closed unless the value is explicitly false.
alter table public.businesses
  add column if not exists sms_suppressed boolean not null default false;

comment on column public.businesses.sms_suppressed is
  'When true, no outbound SMS provider request may be made for this business.';

-- Testshop contains imported real-world records and must never contact them.
update public.businesses
set sms_suppressed = true
where slug = 'testshop';
