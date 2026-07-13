-- Fresha import: batch tracking (rollback) + external-id idempotency

CREATE TABLE public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('staff','customers','services','bookings')),
  source TEXT NOT NULL DEFAULT 'fresha',
  source_filename TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  imported_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  duplicate_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'rolled_back')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rolled_back_at TIMESTAMPTZ
);

-- Non-unique: file-hash re-upload is detected and warned on in the app (with an
-- explicit "import anyway" override), not hard-blocked at the DB level — an
-- owner may legitimately undo an import and redo it from the same file.
CREATE INDEX import_batches_file_hash_idx ON public.import_batches(business_id, file_hash);
CREATE INDEX import_batches_business_idx ON public.import_batches(business_id, created_at DESC);
CREATE INDEX import_batches_session_idx ON public.import_batches(session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages import batches" ON public.import_batches FOR ALL TO authenticated
  USING (public.is_business_owner(business_id)) WITH CHECK (public.is_business_owner(business_id));

-- Tag rows created by an import so it can be rolled back by deleting
-- everything with a given import_batch_id.
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS staff_import_batch_idx ON public.staff(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_import_batch_idx ON public.customers(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS services_import_batch_idx ON public.services(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bookings_import_batch_idx ON public.bookings(import_batch_id) WHERE import_batch_id IS NOT NULL;

-- External ids (the source system's own identifiers) let a re-run of an
-- import — even from a slightly different, overlapping export — skip rows
-- that already exist instead of creating duplicates.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS customers_business_external_id_uniq
  ON public.customers (business_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS services_business_external_id_uniq
  ON public.services (business_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_business_external_id_uniq
  ON public.bookings (business_id, external_id) WHERE external_id IS NOT NULL;
