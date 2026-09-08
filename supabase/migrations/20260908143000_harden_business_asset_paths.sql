-- Keep private business-assets paths tenant-scoped.  The public gallery and
-- staff endpoints use the service role to mint signed URLs, so this
-- constraint prevents a row for one salon from pointing at another salon's
-- private object. NOT VALID lets an existing installation migrate safely;
-- new and updated rows are checked immediately, and old invalid rows are
-- ignored by the defensive route checks until they are corrected.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.business_media'::regclass
      AND conname = 'business_media_path_business_prefix'
  ) THEN
    ALTER TABLE public.business_media
      ADD CONSTRAINT business_media_path_business_prefix
      CHECK (
        path LIKE (business_id::text || '/%')
        AND position('..' in path) = 0
        AND position(chr(92) in path) = 0
      ) NOT VALID;
  END IF;
END
$$;
