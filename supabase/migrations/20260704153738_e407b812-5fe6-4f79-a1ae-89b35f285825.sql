ALTER TABLE public.businesses ALTER COLUMN brand_color SET DEFAULT '#8E2A38';
UPDATE public.businesses SET brand_color = '#8E2A38' WHERE brand_color = '#C2410C';