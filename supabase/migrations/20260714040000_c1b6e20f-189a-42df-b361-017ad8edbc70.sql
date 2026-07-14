-- Step 3 of the customisable public booking page: the public /book/$slug
-- page needs to read a business's saved layout regardless of who's viewing
-- it. The original page_layouts policies only let the owner read their own
-- row (for the editor) — same "public reads ..." pattern already used for
-- business_hours, staff, services, etc.
GRANT SELECT ON public.page_layouts TO anon;

CREATE POLICY "public reads page layout"
ON public.page_layouts FOR SELECT
TO anon
USING (true);

CREATE POLICY "public reads page layout authed"
ON public.page_layouts FOR SELECT
TO authenticated
USING (true);
