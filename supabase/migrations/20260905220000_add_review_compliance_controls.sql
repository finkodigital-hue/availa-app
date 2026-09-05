-- Review publication consent and accountable, reason-based moderation.

alter table public.customer_reviews
  add column if not exists publication_consent_at timestamptz,
  add column if not exists publication_consent_version text,
  add column if not exists moderation_reason text,
  add column if not exists moderation_note text;

alter table public.customer_reviews
  add constraint customer_reviews_moderation_reason_check
  check (
    moderation_reason is null or moderation_reason in (
      'personal_information',
      'abusive_or_illegal',
      'irrelevant',
      'suspected_fraud'
    )
  ),
  add constraint customer_reviews_moderation_note_length_check
  check (moderation_note is null or char_length(moderation_note) <= 500);

create table public.review_moderation_events (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.customer_reviews(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  action text not null check (action in ('remove', 'restore')),
  reason text check (
    reason is null or reason in (
      'personal_information',
      'abusive_or_illegal',
      'irrelevant',
      'suspected_fraud'
    )
  ),
  note text check (note is null or char_length(note) <= 500),
  acted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index review_moderation_events_review_idx
  on public.review_moderation_events(review_id, created_at desc);

grant select on public.review_moderation_events to authenticated;
grant all on public.review_moderation_events to service_role;
alter table public.review_moderation_events enable row level security;

create policy "Owners can read review moderation history"
  on public.review_moderation_events for select to authenticated
  using (public.is_business_owner(business_id));

drop function if exists public.set_customer_review_visibility(uuid, boolean);

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

drop function if exists public.submit_customer_review(text, integer, text);

create or replace function public.submit_customer_review(
  p_token_hash text,
  p_rating integer,
  p_body text,
  p_consent_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.booking_action_tokens%rowtype;
  v_booking public.bookings%rowtype;
  v_review_id uuid;
begin
  if p_rating not between 1 and 5
     or char_length(btrim(coalesce(p_body, ''))) not between 2 and 1000
     or p_consent_version <> 'review-publication-v1' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_content');
  end if;

  select * into v_token
  from public.booking_action_tokens
  where token_hash = p_token_hash and action = 'review'
  for update;

  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if v_token.used_at is not null then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
  if v_token.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;

  select * into v_booking from public.bookings where id = v_token.booking_id for update;
  if not found or v_booking.status <> 'completed' or v_booking.ends_at > now() then
    return jsonb_build_object('ok', false, 'reason', 'not_completed');
  end if;

  select id into v_review_id from public.customer_reviews where booking_id = v_booking.id;
  if v_review_id is not null then
    update public.booking_action_tokens set used_at = now() where id = v_token.id;
    return jsonb_build_object('ok', false, 'reason', 'already_submitted');
  end if;

  insert into public.customer_reviews (
    business_id,
    booking_id,
    customer_id,
    rating,
    body,
    reviewer_name,
    publication_consent_at,
    publication_consent_version
  ) values (
    v_booking.business_id,
    v_booking.id,
    v_booking.customer_id,
    p_rating,
    btrim(p_body),
    coalesce(nullif(btrim(v_booking.customer_name), ''), 'Customer'),
    now(),
    p_consent_version
  ) returning id into v_review_id;

  update public.booking_action_tokens set used_at = now() where id = v_token.id;
  return jsonb_build_object('ok', true, 'review_id', v_review_id);
end;
$$;

revoke all on function public.submit_customer_review(text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_customer_review(text, integer, text, text)
  to service_role;
