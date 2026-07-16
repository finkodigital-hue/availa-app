
-- The Page Builder's first-run gating now relies solely on
-- businesses.wizard_completed (dropping the "no page_layouts yet" check,
-- which broke "Re-run setup wizard" for businesses that already have a
-- page — see the app-side fix in page-builder.tsx). Backfill true for every
-- business that already has a non-empty page layout, so pre-existing
-- businesses don't suddenly get shown the wizard.
UPDATE public.businesses b
SET wizard_completed = true
WHERE b.wizard_completed = false
  AND EXISTS (
    SELECT 1 FROM public.page_layouts pl
    WHERE pl.business_id = b.id
      AND jsonb_array_length(pl.blocks) > 0
  );
