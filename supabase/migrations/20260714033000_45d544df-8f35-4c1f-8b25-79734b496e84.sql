-- Foundation for the customisable public booking page (step 1 of 4):
-- storage for the block layout itself, plus a history log of AI-assisted edits.
-- No editor UI or AI wiring yet — just the schema.

CREATE TABLE public.page_layouts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  blocks jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX page_layouts_business_id_idx ON public.page_layouts(business_id);

GRANT SELECT, INSERT, UPDATE ON public.page_layouts TO authenticated;
GRANT ALL ON public.page_layouts TO service_role;

ALTER TABLE public.page_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner reads own page layout"
ON public.page_layouts FOR SELECT
TO authenticated
USING (public.is_business_owner(business_id));

CREATE POLICY "owner inserts own page layout"
ON public.page_layouts FOR INSERT
TO authenticated
WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY "owner updates own page layout"
ON public.page_layouts FOR UPDATE
TO authenticated
USING (public.is_business_owner(business_id))
WITH CHECK (public.is_business_owner(business_id));

CREATE TRIGGER page_layouts_set_updated_at
BEFORE UPDATE ON public.page_layouts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- History log of page-layout edits (manual or, later, AI-assisted). Kept
-- even if the layout is later reset, so prompt_before/after is nullable
-- independent of page_layouts' lifecycle.
CREATE TABLE public.page_edit_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  prompt text,
  blocks_before jsonb,
  blocks_after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX page_edit_history_business_id_idx ON public.page_edit_history(business_id);

-- Append-only audit log: owners can read and add entries, never edit them.
GRANT SELECT, INSERT ON public.page_edit_history TO authenticated;
GRANT ALL ON public.page_edit_history TO service_role;

ALTER TABLE public.page_edit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner reads own page edit history"
ON public.page_edit_history FOR SELECT
TO authenticated
USING (public.is_business_owner(business_id));

CREATE POLICY "owner inserts own page edit history"
ON public.page_edit_history FOR INSERT
TO authenticated
WITH CHECK (public.is_business_owner(business_id));
