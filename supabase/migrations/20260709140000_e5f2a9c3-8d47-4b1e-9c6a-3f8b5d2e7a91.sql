-- The customers list page joins bookings per customer (to show visit
-- counts). With no index on bookings.customer_id, that join forces a full
-- scan of the bookings table for every customer row — invisible with a
-- handful of demo bookings, but a statement-timeout with a real business's
-- history (surfaced by importing ~45k real appointments during testing).
CREATE INDEX IF NOT EXISTS bookings_customer_id_idx ON public.bookings(customer_id) WHERE customer_id IS NOT NULL;
