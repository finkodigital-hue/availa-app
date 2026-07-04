
CREATE TABLE public.service_recipe_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX service_recipe_items_service_id_idx ON public.service_recipe_items(service_id);
CREATE INDEX service_recipe_items_business_id_idx ON public.service_recipe_items(business_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_recipe_items TO authenticated;
GRANT ALL ON public.service_recipe_items TO service_role;

ALTER TABLE public.service_recipe_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages recipe items"
ON public.service_recipe_items
FOR ALL
TO authenticated
USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));
