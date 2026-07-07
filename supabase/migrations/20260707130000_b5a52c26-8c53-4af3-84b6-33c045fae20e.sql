
-- Fix a ledger/accounting drift: the previous version recorded the recipe's
-- requested quantity even when actual stock was lower (deduction gets
-- clamped to 0 by GREATEST elsewhere), so the ledger no longer matched what
-- was really removed. A later quick-adjust + un-complete cycle would then
-- reconstruct the WRONG original stock level, drifting upward by the
-- clamped shortfall. Recording LEAST(recipe qty, stock on hand) at
-- completion time keeps the ledger equal to what was actually applied, so
-- adjust/reversal math stays exact.
CREATE OR REPLACE FUNCTION public.apply_booking_stock_deduction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO public.booking_stock_deductions (business_id, booking_id, inventory_item_id, quantity)
    SELECT sri.business_id, NEW.id, sri.inventory_item_id, LEAST(sri.quantity, ii.current_stock)
      FROM public.service_recipe_items sri
      JOIN public.inventory_items ii ON ii.id = sri.inventory_item_id
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
