-- Internal notification preferences are not public storefront data. Their
-- security-definer trigger callers retain access as the function owner.
revoke all on function public.notification_preference_enabled(uuid,text) from public,anon,authenticated;
grant execute on function public.notification_preference_enabled(uuid,text) to service_role;

-- These operations already enforce identity internally. Remove their inherited
-- PUBLIC/anonymous execute grants while preserving signed-in application use.
revoke execute on function public.accept_professional_invitation(text,uuid),
 public.customer_export_stats(uuid),public.customer_visit_counts(uuid),
 public.get_portal_bookings(),public.get_portal_customer_records(),
 public.request_customer_data_action(text),public.revoke_staff_account_invitation(uuid)
 from public,anon;
grant execute on function public.accept_professional_invitation(text,uuid),
 public.customer_export_stats(uuid),public.customer_visit_counts(uuid),
 public.get_portal_bookings(),public.get_portal_customer_records(),
 public.request_customer_data_action(text),public.revoke_staff_account_invitation(uuid)
 to authenticated,service_role;
notify pgrst,'reload schema';
