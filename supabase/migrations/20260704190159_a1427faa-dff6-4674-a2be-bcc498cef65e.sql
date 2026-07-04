REVOKE ALL ON FUNCTION public.is_salon_owner_of_pro(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.salon_pro_permission(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_salon_owner_of_pro(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.salon_pro_permission(uuid, text) TO service_role;
