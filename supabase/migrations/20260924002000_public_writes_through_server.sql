-- Deploy the server-side public limiter before applying this permission step.
-- Customers still book through the website. Legacy public keys cannot bypass
-- source controls by calling these mutating RPCs directly.
revoke all on function public.create_public_booking(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,integer,integer) from public,anon,authenticated;
grant execute on function public.create_public_booking(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,integer,integer) to service_role;
revoke all on function public.join_waitlist(text,text) from public,anon,authenticated;
grant execute on function public.join_waitlist(text,text) to service_role;
notify pgrst,'reload schema';
