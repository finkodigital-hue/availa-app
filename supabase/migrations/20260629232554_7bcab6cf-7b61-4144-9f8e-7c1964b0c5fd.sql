
REVOKE EXECUTE ON FUNCTION public.is_business_owner(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_business_owner(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
