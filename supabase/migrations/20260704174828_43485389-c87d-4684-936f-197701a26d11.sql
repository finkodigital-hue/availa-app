
-- Independent Professionals: foundation tables (Milestone 1)

-- Invitations sent by salon owners to pros
CREATE TABLE public.professional_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL,
  email text NOT NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  chair_label text,
  rent_mode text NOT NULL DEFAULT 'none' CHECK (rent_mode IN ('none','weekly','monthly','percentage','fixed_commission')),
  rent_amount_cents integer,
  commission_percent numeric(5,2),
  agreement_start date,
  agreement_end date,
  rent_due_day smallint,
  message text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  accepted_at timestamptz,
  accepted_business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX professional_invitations_salon_idx ON public.professional_invitations(salon_business_id);
CREATE INDEX professional_invitations_email_idx ON public.professional_invitations(lower(email));
CREATE INDEX professional_invitations_token_idx ON public.professional_invitations(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_invitations TO authenticated;
GRANT SELECT, UPDATE ON public.professional_invitations TO anon; -- to look up by token
GRANT ALL ON public.professional_invitations TO service_role;

ALTER TABLE public.professional_invitations ENABLE ROW LEVEL SECURITY;

-- Salon owner can manage their invitations
CREATE POLICY "salon owner manages invitations"
  ON public.professional_invitations FOR ALL
  TO authenticated
  USING (public.is_business_owner(salon_business_id))
  WITH CHECK (public.is_business_owner(salon_business_id));

-- Anyone with the token can read a pending invitation (for the accept flow)
CREATE POLICY "public can read by token"
  ON public.professional_invitations FOR SELECT
  TO anon, authenticated
  USING (status = 'pending' AND expires_at > now());


-- Link between a salon business and an independent pro's business
CREATE TABLE public.salon_professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  pro_business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  chair_label text,
  color text,
  display_order integer NOT NULL DEFAULT 0,
  -- Permissions the pro grants the salon owner. Revenue/reports/customer-notes are NEVER exposed.
  permissions jsonb NOT NULL DEFAULT '{
    "salon_can_view_calendar": true,
    "salon_can_book": false,
    "salon_can_move": false,
    "salon_can_view_availability": true
  }'::jsonb,
  -- Rent terms (can combine base + commission)
  rent_mode text NOT NULL DEFAULT 'none' CHECK (rent_mode IN ('none','weekly','monthly','percentage','fixed_commission')),
  rent_amount_cents integer,
  commission_percent numeric(5,2),
  agreement_start date,
  agreement_end date,
  rent_due_day smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_business_id, pro_business_id)
);

CREATE INDEX salon_professionals_salon_idx ON public.salon_professionals(salon_business_id);
CREATE INDEX salon_professionals_pro_idx ON public.salon_professionals(pro_business_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salon_professionals TO authenticated;
GRANT ALL ON public.salon_professionals TO service_role;

ALTER TABLE public.salon_professionals ENABLE ROW LEVEL SECURITY;

-- Salon owner can see and manage all their links
CREATE POLICY "salon owner manages links"
  ON public.salon_professionals FOR ALL
  TO authenticated
  USING (public.is_business_owner(salon_business_id))
  WITH CHECK (public.is_business_owner(salon_business_id));

-- The pro (owner of pro_business_id) can see and update their own link (permissions only, enforced by trigger)
CREATE POLICY "pro reads own link"
  ON public.salon_professionals FOR SELECT
  TO authenticated
  USING (public.is_business_owner(pro_business_id));

CREATE POLICY "pro updates own link"
  ON public.salon_professionals FOR UPDATE
  TO authenticated
  USING (public.is_business_owner(pro_business_id))
  WITH CHECK (public.is_business_owner(pro_business_id));

-- Trigger: pro can only modify permissions column; salon owner unrestricted
CREATE OR REPLACE FUNCTION public.enforce_salon_professionals_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_business_owner(NEW.salon_business_id) THEN
    RETURN NEW;
  END IF;
  -- pro path: only permissions may change
  IF NEW.salon_business_id IS DISTINCT FROM OLD.salon_business_id
     OR NEW.pro_business_id IS DISTINCT FROM OLD.pro_business_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.chair_label IS DISTINCT FROM OLD.chair_label
     OR NEW.rent_mode IS DISTINCT FROM OLD.rent_mode
     OR NEW.rent_amount_cents IS DISTINCT FROM OLD.rent_amount_cents
     OR NEW.commission_percent IS DISTINCT FROM OLD.commission_percent
     OR NEW.agreement_start IS DISTINCT FROM OLD.agreement_start
     OR NEW.agreement_end IS DISTINCT FROM OLD.agreement_end
     OR NEW.rent_due_day IS DISTINCT FROM OLD.rent_due_day
  THEN
    RAISE EXCEPTION 'Only the salon owner can change these fields';
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.enforce_salon_professionals_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER salon_professionals_update_guard
BEFORE UPDATE ON public.salon_professionals
FOR EACH ROW EXECUTE FUNCTION public.enforce_salon_professionals_update();

CREATE TRIGGER salon_professionals_set_updated_at
BEFORE UPDATE ON public.salon_professionals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER professional_invitations_set_updated_at
BEFORE UPDATE ON public.professional_invitations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- Helper: is the current user the pro linked to a given salon?
CREATE OR REPLACE FUNCTION public.is_linked_pro_of(_salon_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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

REVOKE EXECUTE ON FUNCTION public.is_linked_pro_of(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_linked_pro_of(uuid) TO authenticated;


-- Rent ledger
CREATE TABLE public.rent_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_professional_id uuid NOT NULL REFERENCES public.salon_professionals(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'due' CHECK (status IN ('due','paid','waived','overdue')),
  due_date date,
  paid_at timestamptz,
  paid_method text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rent_payments_link_idx ON public.rent_payments(salon_professional_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rent_payments TO authenticated;
GRANT ALL ON public.rent_payments TO service_role;

ALTER TABLE public.rent_payments ENABLE ROW LEVEL SECURITY;

-- Salon owner sees & manages
CREATE POLICY "salon owner manages rent"
  ON public.rent_payments FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.salon_professionals sp
            WHERE sp.id = salon_professional_id
              AND public.is_business_owner(sp.salon_business_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.salon_professionals sp
            WHERE sp.id = salon_professional_id
              AND public.is_business_owner(sp.salon_business_id))
  );

-- Pro reads their own rent ledger (read-only)
CREATE POLICY "pro reads own rent"
  ON public.rent_payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.salon_professionals sp
            WHERE sp.id = salon_professional_id
              AND public.is_business_owner(sp.pro_business_id))
  );

CREATE TRIGGER rent_payments_set_updated_at
BEFORE UPDATE ON public.rent_payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
