CREATE TABLE public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('idea', 'issue', 'other')),
  message TEXT NOT NULL CHECK (char_length(trim(message)) BETWEEN 5 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can submit their own feedback"
ON public.feedback FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (business_id IS NULL OR public.is_business_owner(business_id))
);
