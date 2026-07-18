CREATE TABLE public.support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL CHECK (char_length(trim(subject)) BETWEEN 3 AND 200),
  message TEXT NOT NULL CHECK (char_length(trim(message)) BETWEEN 5 AND 4000),
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal', 'urgent')),
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.support_requests TO authenticated;
GRANT ALL ON public.support_requests TO service_role;

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can submit their own support requests"
ON public.support_requests FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (business_id IS NULL OR public.is_business_owner(business_id))
);
