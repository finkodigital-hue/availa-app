
CREATE OR REPLACE FUNCTION public.apply_booking_stock_deduction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    UPDATE public.inventory_items ii
       SET current_stock = ii.current_stock - sri.quantity
      FROM public.service_recipe_items sri
     WHERE sri.service_id = NEW.service_id
       AND sri.inventory_item_id = ii.id;
  ELSIF OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed' THEN
    UPDATE public.inventory_items ii
       SET current_stock = ii.current_stock + sri.quantity
      FROM public.service_recipe_items sri
     WHERE sri.service_id = OLD.service_id
       AND sri.inventory_item_id = ii.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_stock_deduction ON public.bookings;
CREATE TRIGGER bookings_stock_deduction
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.apply_booking_stock_deduction();
