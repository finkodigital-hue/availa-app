-- Cover foreign-key lookups across every terminal attempt state.
SET lock_timeout = '5s';
SET statement_timeout = '30s';
CREATE INDEX IF NOT EXISTS terminal_payment_booking_idx ON public.terminal_payment_attempts(booking_id);
CREATE INDEX IF NOT EXISTS terminal_payment_reader_idx ON public.terminal_payment_attempts(reader_id);
CREATE INDEX IF NOT EXISTS terminal_payment_initiator_idx ON public.terminal_payment_attempts(initiated_by_user_id);
RESET lock_timeout;
RESET statement_timeout;
