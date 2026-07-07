
-- Ledger of what stock was actually deducted per booking/item, so a completion
-- can be reversed exactly (even if the recipe changes later) and so an owner
-- can tweak the actual amount used after the fact. Also the foundation for
-- future usage-rate forecasting (a timestamped consumption log).
CREATE TABLE public.booking_stock_deductions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_stock_deductions_booking_id_idx ON public.booking_stock_deductions(booking_id);
CREATE INDEX booking_stock_deductions_business_id_idx ON public.booking_stock_deductions(business_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_stock_deductions TO authenticated;
GRANT ALL ON public.booking_stock_deductions TO service_role;

ALTER TABLE public.booking_stock_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages stock deductions"
ON public.booking_stock_deductions
FOR ALL
TO authenticated
USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

-- Replace the blind-deduction trigger with one that records a ledger row per
-- item, and reverses using that ledger (not live recipe values) if a booking
-- is ever un-completed.
CREATE OR REPLACE FUNCTION public.apply_booking_stock_deduction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO public.booking_stock_deductions (business_id, booking_id, inventory_item_id, quantity)
    SELECT sri.business_id, NEW.id, sri.inventory_item_id, sri.quantity
      FROM public.service_recipe_items sri
     WHERE sri.service_id = NEW.service_id;

    UPDATE public.inventory_items ii
       SET current_stock = GREATEST(0, ii.current_stock - bsd.quantity)
      FROM public.booking_stock_deductions bsd
     WHERE bsd.booking_id = NEW.id
       AND bsd.inventory_item_id = ii.id;
  ELSIF OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed' THEN
    UPDATE public.inventory_items ii
       SET current_stock = ii.current_stock + bsd.quantity
      FROM public.booking_stock_deductions bsd
     WHERE bsd.booking_id = OLD.id
       AND bsd.inventory_item_id = ii.id;

    DELETE FROM public.booking_stock_deductions WHERE booking_id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_stock_deduction ON public.bookings;
CREATE TRIGGER bookings_stock_deduction
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.apply_booking_stock_deduction();

-- Lets the owner correct the actual amount used for one deducted item after
-- completion, applying only the delta to current_stock. Runs as the calling
-- user (not SECURITY DEFINER): existing RLS on both tables already limits
-- owners to their own business's rows, so no extra checks are needed here.
CREATE OR REPLACE FUNCTION public.adjust_booking_stock_deduction(
  p_deduction_id uuid,
  p_new_quantity numeric
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_quantity numeric;
  v_item_id uuid;
BEGIN
  IF p_new_quantity IS NULL OR p_new_quantity < 0 THEN
    RAISE EXCEPTION 'Quantity must be zero or greater';
  END IF;

  SELECT quantity, inventory_item_id INTO v_old_quantity, v_item_id
    FROM public.booking_stock_deductions
   WHERE id = p_deduction_id
   FOR UPDATE;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'Deduction record not found';
  END IF;

  UPDATE public.inventory_items
     SET current_stock = GREATEST(0, current_stock - (p_new_quantity - v_old_quantity))
   WHERE id = v_item_id;

  UPDATE public.booking_stock_deductions
     SET quantity = p_new_quantity
   WHERE id = p_deduction_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_booking_stock_deduction(uuid, numeric) TO authenticated;
