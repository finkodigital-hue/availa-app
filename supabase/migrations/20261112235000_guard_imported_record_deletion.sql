-- Cached clients used sequential DELETEs instead of the safe undo RPC. Deny
-- those writes in the database too. This trigger MUST remain SECURITY INVOKER:
-- current_user is authenticated/anon for REST writes, but the trusted function
-- owner inside vetted SECURITY DEFINER undo/erasure routines. JWT role claims
-- and caller-controlled settings are deliberately not used as bypass flags.
create function public.guard_imported_record_mutation()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public,pg_temp as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_table_name='import_batches' then
      raise exception 'Import history cannot be deleted directly. Use the safe import undo workflow.';
    end if;
    if old.import_batch_id is not null then
      if tg_op='DELETE' then
        raise exception 'Imported records cannot be deleted directly. Use safe import undo or the customer erasure workflow.';
      end if;
      if new.import_batch_id is distinct from old.import_batch_id then
        raise exception 'Import provenance cannot be removed or replaced directly.';
      end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.guard_imported_record_mutation() from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['bookings','customers','services','staff'] loop
    execute format('create trigger guard_imported_record_mutation before update or delete on public.%I for each row execute function public.guard_imported_record_mutation()',t);
  end loop;
end $$;
-- Batch deletion would otherwise SET NULL on all imported rows and evade the
-- row-level provenance check through privileged referential-integrity actions.
create trigger guard_imported_batch_deletion before delete on public.import_batches
for each row execute function public.guard_imported_record_mutation();
notify pgrst,'reload schema';
