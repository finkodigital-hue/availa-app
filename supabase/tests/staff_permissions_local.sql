-- Run after `supabase db reset`: psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/staff_permissions_local.sql
begin;
do $$
declare owner_id uuid:=gen_random_uuid(); worker_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid(); bid uuid; sid uuid; token text;
begin
 insert into auth.users(id,email) values(owner_id,'owner-rbac@test.local'),(worker_id,'worker-rbac@test.local'),(outsider_id,'other-rbac@test.local');
 insert into businesses(owner_id,name,slug) values(owner_id,'RBAC salon','rbac-salon-test') returning id into bid;
 insert into staff(business_id,name,email) values(bid,'A Worker','worker-rbac@test.local') returning id into sid;
 insert into staff_memberships(business_id,staff_id,user_id,access_role) values(bid,sid,worker_id,'front_desk');

 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claim.sub',worker_id::text,true);
 assert public.has_business_permission(bid,'calendar.manage'), 'front desk should manage calendar';
 assert not public.has_business_permission(bid,'staff.manage'), 'front desk must not manage staff';
 assert exists(select 1 from businesses where id=bid), 'member should see workspace';

 perform set_config('request.jwt.claim.sub',outsider_id::text,true);
 assert not public.is_business_member(bid), 'outsider must not become a member';
 assert not exists(select 1 from staff_memberships where business_id=bid), 'outsider must not read memberships';
end $$;
rollback;
