-- A reviewer may withdraw publication. Keep that reason in the audit trail.

alter table public.customer_reviews
  drop constraint if exists customer_reviews_moderation_reason_check;
alter table public.customer_reviews
  add constraint customer_reviews_moderation_reason_check
  check (
    moderation_reason is null or moderation_reason in (
      'customer_request',
      'personal_information',
      'abusive_or_illegal',
      'irrelevant',
      'suspected_fraud'
    )
  );

alter table public.review_moderation_events
  drop constraint if exists review_moderation_events_reason_check;
alter table public.review_moderation_events
  add constraint review_moderation_events_reason_check
  check (
    reason is null or reason in (
      'customer_request',
      'personal_information',
      'abusive_or_illegal',
      'irrelevant',
      'suspected_fraud'
    )
  );

create or replace function public.moderate_customer_review(
  p_review_id uuid,
  p_action text,
  p_reason text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select business_id into v_business_id
  from public.customer_reviews
  where id = p_review_id;

  if v_business_id is null or not public.is_business_owner(v_business_id) then
    raise exception 'Review not found';
  end if;

  if p_action not in ('remove', 'restore') then
    raise exception 'Invalid moderation action';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'Moderation note is too long';
  end if;
  if p_action = 'remove' and (
    p_reason is null or p_reason not in (
      'customer_request',
      'personal_information',
      'abusive_or_illegal',
      'irrelevant',
      'suspected_fraud'
    )
  ) then
    raise exception 'A valid moderation reason is required';
  end if;

  if p_action = 'remove' then
    update public.customer_reviews
    set status = 'hidden',
        hidden_at = now(),
        hidden_by = auth.uid(),
        moderation_reason = p_reason,
        moderation_note = v_note
    where id = p_review_id;
  else
    update public.customer_reviews
    set status = 'published',
        hidden_at = null,
        hidden_by = null,
        moderation_reason = null,
        moderation_note = null
    where id = p_review_id;
  end if;

  insert into public.review_moderation_events (
    review_id, business_id, action, reason, note, acted_by
  ) values (
    p_review_id,
    v_business_id,
    p_action,
    case when p_action = 'remove' then p_reason else null end,
    v_note,
    auth.uid()
  );
end;
$$;

revoke all on function public.moderate_customer_review(uuid, text, text, text)
  from public, anon;
grant execute on function public.moderate_customer_review(uuid, text, text, text)
  to authenticated;
