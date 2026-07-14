-- Defense-in-depth: a business must never be linked as its own rented
-- professional. The client already blocks this (invite.$token.tsx), but
-- accept_professional_invitation is SECURITY DEFINER and reachable directly
-- via RPC, so the guard belongs here too.
CREATE OR REPLACE FUNCTION public.accept_professional_invitation(
  _token text,
  _pro_business_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.professional_invitations%ROWTYPE;
  v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite FROM public.professional_invitations
   WHERE token = _token AND status = 'pending' AND expires_at > now()
   LIMIT 1;
  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Invitation is no longer valid';
  END IF;

  IF v_invite.salon_business_id = _pro_business_id THEN
    RAISE EXCEPTION 'A business cannot rent a chair from itself';
  END IF;

  SELECT owner_id INTO v_owner FROM public.businesses WHERE id = _pro_business_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'You do not own this business';
  END IF;

  INSERT INTO public.salon_professionals (
    salon_business_id, pro_business_id, status, chair_label, rent_mode,
    rent_amount_cents, commission_percent, agreement_start, agreement_end, rent_due_day
  ) VALUES (
    v_invite.salon_business_id, _pro_business_id, 'active', v_invite.chair_label,
    v_invite.rent_mode, v_invite.rent_amount_cents, v_invite.commission_percent,
    v_invite.agreement_start, v_invite.agreement_end, v_invite.rent_due_day
  ) ON CONFLICT DO NOTHING;

  UPDATE public.professional_invitations
     SET status = 'accepted',
         accepted_at = now(),
         accepted_business_id = _pro_business_id
   WHERE id = v_invite.id;

  RETURN v_invite.id;
END $$;

GRANT EXECUTE ON FUNCTION public.accept_professional_invitation(text, uuid) TO authenticated;
