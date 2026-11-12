-- Undo an import as one transaction. Fingerprints contain no plaintext customer
-- fields and allow future imports to refuse undo after anyone edits a row.
create table public.import_row_fingerprints (
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  table_name text not null check (table_name in ('bookings','customers','services','staff')),
  row_id uuid not null,
  fingerprint text not null,
  primary key (batch_id, table_name, row_id)
);
alter table public.import_row_fingerprints enable row level security;
revoke all on public.import_row_fingerprints from public, anon, authenticated;
create policy "server managed import fingerprints" on public.import_row_fingerprints
  for all to anon, authenticated using (false) with check (false);

create function public.guard_import_batch_insert()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare batch public.import_batches%rowtype;
begin
  if new.import_batch_id is null then return new; end if;
  select * into batch from public.import_batches where id=new.import_batch_id for share;
  if not found or batch.business_id is distinct from new.business_id or batch.status <> 'processing' then
    raise exception 'Import unavailable: this batch is not accepting records. Start a new import.';
  end if;
  return new;
end $$;
create function public.capture_import_row_fingerprint()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  if new.import_batch_id is not null then
    insert into public.import_row_fingerprints(batch_id,table_name,row_id,fingerprint)
    values(new.import_batch_id,tg_table_name,new.id,md5(to_jsonb(new)::text));
  end if;
  return new;
end $$;
-- These fingerprints remain personal-data-derived metadata. Erasure, edits,
-- and deletion discard them rather than retaining a historical row identifier.
create function public.discard_import_row_fingerprint()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  if old.import_batch_id is not null then
    delete from public.import_row_fingerprints where batch_id=old.import_batch_id and table_name=tg_table_name and row_id=old.id;
  end if;
  return null;
end $$;
revoke all on function public.guard_import_batch_insert(),public.capture_import_row_fingerprint(),public.discard_import_row_fingerprint() from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['bookings','customers','services','staff'] loop
    execute format('create trigger guard_import_batch_insert before insert on public.%I for each row execute function public.guard_import_batch_insert()',t);
    execute format('create trigger capture_import_row_fingerprint after insert on public.%I for each row execute function public.capture_import_row_fingerprint()',t);
    execute format('create trigger discard_import_row_fingerprint after update or delete on public.%I for each row execute function public.discard_import_row_fingerprint()',t);
  end loop;
end $$;

create function public.rollback_import_batch(p_batch_id uuid,p_business_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare
  batch public.import_batches%rowtype;
  target_table text;
  relation record;
  join_condition text;
  ignore_internal text;
  has_dependency boolean;
  changed boolean;
begin
  if auth.uid() is null or not public.session_has_required_assurance()
     or not exists(select 1 from public.businesses where id=p_business_id and owner_id=auth.uid()) then
    raise exception 'Only the verified business owner can undo imports';
  end if;
  select * into batch from public.import_batches where id=p_batch_id and business_id=p_business_id for update;
  if not found then raise exception 'Import not found'; end if;
  if batch.status='rolled_back' then return; end if;
  if batch.status not in ('completed','failed') then
    raise exception 'This import may still be running. It cannot be undone yet.';
  end if;

  -- FOR UPDATE also prevents a new FK reference being inserted while we inspect
  -- dependencies. Acquire all row locks before any deletion or cascade occurs.
  foreach target_table in array array['bookings','customers','services','staff'] loop
    execute format('select 1 from public.%I where import_batch_id=$1 and business_id=$2 order by id for update',target_table)
      using p_batch_id,p_business_id;
    execute format('select exists(select 1 from public.%I r left join public.import_row_fingerprints f on f.batch_id=$1 and f.table_name=$3 and f.row_id=r.id where r.import_batch_id=$1 and r.business_id=$2 and (f.fingerprint is null or f.fingerprint<>md5(to_jsonb(r)::text)))',target_table)
      into changed using p_batch_id,p_business_id,target_table;
    if changed then
      raise exception 'This import contains edited records or predates safe undo tracking. Nothing was removed; review the records individually.';
    end if;
  end loop;

  -- Inspect effective FKs, not a fixed list that would miss later features.
  -- Only rows removed by this same batch are internal dependencies. Any other
  -- dependent row (including CASCADE/SET NULL health, staff/rent/payment links)
  -- blocks undo rather than allowing silent deletion or orphaning.
  foreach target_table in array array['bookings','customers','services','staff'] loop
    for relation in
      select c.oid,c.conrelid,n.nspname as child_schema,t.relname as child_table,c.conkey,c.confkey
      from pg_constraint c join pg_class t on t.oid=c.conrelid
      join pg_namespace n on n.oid=t.relnamespace
      where c.contype='f' and c.confrelid=to_regclass('public.'||target_table)
    loop
      select string_agg(format('child.%I=parent.%I',ca.attname,pa.attname),' and ' order by k.ordinality)
      into join_condition
      from unnest(relation.conkey,relation.confkey) with ordinality as k(child_key,parent_key,ordinality)
      join pg_attribute ca on ca.attrelid=relation.conrelid and ca.attnum=k.child_key
      join pg_attribute pa on pa.attrelid=to_regclass('public.'||target_table) and pa.attnum=k.parent_key;
      ignore_internal := '';
      if relation.child_schema='public' and relation.child_table=any(array['bookings','customers','services','staff']) then
        ignore_internal := ' and not (child.import_batch_id is not distinct from $1 and child.business_id is not distinct from $2)';
      end if;
      execute format('select exists(select 1 from %I.%I child join public.%I parent on %s where parent.import_batch_id=$1 and parent.business_id=$2%s)',relation.child_schema,relation.child_table,target_table,join_condition,ignore_internal)
        into has_dependency using p_batch_id,p_business_id;
      if has_dependency then
        raise exception 'Other records now depend on this import. Nothing was removed; review the linked records first.';
      end if;
    end loop;
  end loop;

  foreach target_table in array array['bookings','customers','services','staff'] loop
    execute format('delete from public.%I where import_batch_id=$1 and business_id=$2',target_table)
      using p_batch_id,p_business_id;
  end loop;
  delete from public.import_row_fingerprints where batch_id=p_batch_id;
  update public.import_batches set status='rolled_back',rolled_back_at=now()
    where id=p_batch_id and business_id=p_business_id;
end $$;
revoke all on function public.rollback_import_batch(uuid,uuid) from public,anon;
grant execute on function public.rollback_import_batch(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
