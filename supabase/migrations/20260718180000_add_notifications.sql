CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('booking_created', 'booking_cancelled')),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_business_created_idx ON public.notifications (business_id, created_at DESC);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner reads own notifications"
ON public.notifications FOR SELECT TO authenticated
USING (is_business_owner(business_id));

CREATE POLICY "owner marks own notifications read"
ON public.notifications FOR UPDATE TO authenticated
USING (is_business_owner(business_id))
WITH CHECK (is_business_owner(business_id));

-- New booking -> notification. Fires on every insert (online, walk-in, or
-- custom-blocked time) so the owner has one feed for "something landed on
-- the calendar" without needing to poll it themselves.
CREATE OR REPLACE FUNCTION public.notify_booking_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'cancelled' THEN
    INSERT INTO public.notifications (business_id, type, title, body, link)
    VALUES (
      NEW.business_id,
      'booking_created',
      'New booking: ' || COALESCE(NEW.customer_name, 'Walk-in'),
      to_char(NEW.starts_at, 'Dy, Mon DD') || ' at ' || to_char(NEW.starts_at, 'HH12:MI am'),
      '/calendar'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_created ON public.bookings;
CREATE TRIGGER trg_notify_booking_created
AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_booking_created();

-- Booking cancelled -> notification. Only fires on the transition into
-- 'cancelled', not every update to a cancelled row.
CREATE OR REPLACE FUNCTION public.notify_booking_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    INSERT INTO public.notifications (business_id, type, title, body, link)
    VALUES (
      NEW.business_id,
      'booking_cancelled',
      'Booking cancelled: ' || COALESCE(NEW.customer_name, 'Walk-in'),
      to_char(NEW.starts_at, 'Dy, Mon DD') || ' at ' || to_char(NEW.starts_at, 'HH12:MI am'),
      '/calendar'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_cancelled ON public.bookings;
CREATE TRIGGER trg_notify_booking_cancelled
AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_booking_cancelled();
