-- Lets a customer, from their self-service portal, ask a business to
-- export or delete the personal data held about them (a lightweight
-- GDPR/CCPA-style "right to know / right to be forgotten" request). The
-- business owner sees and resolves these from their Customers page.
--
-- request_customer_data_action() mirrors the existing
-- get_portal_customer_records() pattern: SECURITY DEFINER, scoped by the
-- caller's verified JWT email (public.current_user_email()), so a portal
-- customer never needs direct table access to customers/businesses to
-- file a request.

CREATE TABLE public.customer_data_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('export', 'deletion')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX customer_data_requests_business_status_idx
  ON public.customer_data_requests (business_id, status);

GRANT SELECT, UPDATE ON public.customer_data_requests TO authenticated;
GRANT ALL ON public.customer_data_requests TO service_role;

ALTER TABLE public.customer_data_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner reads own data requests"
ON public.customer_data_requests FOR SELECT TO authenticated
USING (is_business_owner(business_id));

CREATE POLICY "owner resolves own data requests"
ON public.customer_data_requests FOR UPDATE TO authenticated
USING (is_business_owner(business_id))
WITH CHECK (is_business_owner(business_id));

CREATE OR REPLACE FUNCTION public.request_customer_data_action(p_kind text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_email text := current_user_email();
  v_count integer := 0;
BEGIN
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_kind NOT IN ('export', 'deletion') THEN
    RAISE EXCEPTION 'Invalid request kind';
  END IF;

  INSERT INTO customer_data_requests (business_id, customer_id, email, kind)
  SELECT c.business_id, c.id, v_email, p_kind
  FROM customers c
  WHERE lower(c.email) = v_email
    AND NOT EXISTS (
      SELECT 1 FROM customer_data_requests r
      WHERE r.business_id = c.business_id AND r.email = v_email
        AND r.kind = p_kind AND r.status = 'pending'
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_customer_data_action(text) FROM public;
GRANT EXECUTE ON FUNCTION public.request_customer_data_action(text) TO authenticated;
