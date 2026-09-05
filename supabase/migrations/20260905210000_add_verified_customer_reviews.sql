-- Verified customer reviews. Reviews can only be submitted with a single-use
-- token tied to a completed booking. Owners may publish or hide reviews, but
-- cannot edit ratings or customer comments.

alter table public.booking_action_tokens
  drop constraint if exists booking_action_tokens_action_check;
alter table public.booking_action_tokens
  add constraint booking_action_tokens_action_check
  check (action in ('confirm', 'cancel', 'reschedule', 'review'));

alter table public.bookings
  add column if not exists review_request_sent_at timestamptz;

alter table public.businesses
  add column if not exists review_requests_enabled boolean not null default true,
  add column if not exists reviews_enabled_at timestamptz not null default now();

create table public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 2 and 1000),
  reviewer_name text not null,
  source text not null default 'bookzenvo' check (source in ('bookzenvo', 'google', 'import')),
  verified boolean not null default true,
  status text not null default 'published' check (status in ('published', 'hidden')),
  submitted_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_by uuid references auth.users(id) on delete set null
);

create index customer_reviews_business_status_idx
  on public.customer_reviews(business_id, status, submitted_at desc);
create index customer_reviews_customer_idx on public.customer_reviews(customer_id);

grant select on public.customer_reviews to authenticated;
grant all on public.customer_reviews to service_role;
alter table public.customer_reviews enable row level security;

create policy "Owners can read customer reviews"
  on public.customer_reviews for select to authenticated
  using (public.is_business_owner(business_id));

create or replace function public.set_customer_review_visibility(
  p_review_id uuid,
  p_visible boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  select business_id into v_business_id
  from public.customer_reviews
  where id = p_review_id;

  if v_business_id is null or not public.is_business_owner(v_business_id) then
    raise exception 'Review not found';
  end if;

  update public.customer_reviews
  set status = case when p_visible then 'published' else 'hidden' end,
      hidden_at = case when p_visible then null else now() end,
      hidden_by = case when p_visible then null else auth.uid() end
  where id = p_review_id;
end;
$$;

revoke all on function public.set_customer_review_visibility(uuid, boolean) from public, anon;
grant execute on function public.set_customer_review_visibility(uuid, boolean) to authenticated;

create or replace function public.submit_customer_review(
  p_token_hash text,
  p_rating integer,
  p_body text
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
  if p_rating not between 1 and 5 or char_length(btrim(coalesce(p_body, ''))) not between 2 and 1000 then
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
    business_id, booking_id, customer_id, rating, body, reviewer_name
  ) values (
    v_booking.business_id,
    v_booking.id,
    v_booking.customer_id,
    p_rating,
    btrim(p_body),
    coalesce(nullif(btrim(v_booking.customer_name), ''), 'Customer')
  ) returning id into v_review_id;

  update public.booking_action_tokens set used_at = now() where id = v_token.id;
  return jsonb_build_object('ok', true, 'review_id', v_review_id);
end;
$$;

revoke all on function public.submit_customer_review(text, integer, text) from public, anon, authenticated;
grant execute on function public.submit_customer_review(text, integer, text) to service_role;

-- Erasure removes the review itself instead of leaving customer-written text
-- behind. Financial booking and payment records remain anonymised as before.
create or replace function public.delete_reviews_before_customer_erasure()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name = 'Deleted customer' and new.email is null
     and (old.name is distinct from new.name or old.email is distinct from new.email) then
    delete from public.customer_reviews where customer_id = old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists delete_reviews_on_customer_erasure on public.customers;
create trigger delete_reviews_on_customer_erasure
before update on public.customers
for each row execute function public.delete_reviews_before_customer_erasure();
