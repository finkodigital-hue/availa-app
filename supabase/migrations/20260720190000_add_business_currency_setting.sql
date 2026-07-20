-- Currency is set per business. GBP is the new default for Bookzenvo.
-- Existing USD rows were created by the old, hard-coded default rather than a
-- business-level choice, so move them to GBP. Businesses can change it again
-- at any time from Settings > Business.
ALTER TABLE public.businesses
  ALTER COLUMN currency SET DEFAULT 'GBP';

UPDATE public.businesses
SET currency = 'GBP'
WHERE currency IS NULL OR lower(currency) = 'usd';

ALTER TABLE public.businesses
  ALTER COLUMN currency SET NOT NULL;
