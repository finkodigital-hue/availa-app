
CREATE OR REPLACE FUNCTION public.is_linked_pro_of(_salon_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.salon_professionals sp
    JOIN public.businesses b ON b.id = sp.pro_business_id
    WHERE sp.salon_business_id = _salon_business_id
      AND sp.status = 'active'
      AND b.owner_id = auth.uid()
  );
$$;

-- The permissions-update guard is trigger-only; strip execute privileges from clients.
REVOKE EXECUTE ON FUNCTION public.enforce_salon_professionals_update() FROM PUBLIC, anon, authenticated;
