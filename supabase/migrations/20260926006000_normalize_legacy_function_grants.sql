-- Production verification found two old helpers still carrying direct anon
-- grants even though their original migrations revoked PUBLIC, while the
-- token-gated professional invitation lookup had lost its intended anon
-- grant. Normalize all three explicitly so provider default privileges or
-- historical manual drift cannot decide the application boundary.

revoke execute on function public.is_linked_pro_of(uuid) from public, anon;
revoke execute on function public.merge_customers(uuid, uuid) from public, anon;
grant execute on function public.is_linked_pro_of(uuid) to authenticated, service_role;
grant execute on function public.merge_customers(uuid, uuid) to authenticated, service_role;

revoke execute on function public.get_invitation_by_token(text) from public, anon, authenticated;
grant execute on function public.get_invitation_by_token(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
