-- Exclude the global waitlist; include tenant consent and staff hours.
create or replace function public.export_owner_workspace(p_business_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_result jsonb;
  v_table text;
  v_rows jsonb;
  v_row_expression text;
  v_tables constant text[] := array[
    'staff','services','service_staff','customers','bookings','payments',
    'business_hours','business_hour_periods','blocked_dates','holiday_closures',
    'inventory_items','service_recipe_items','booking_stock_deductions',
    'business_media','page_layouts','page_edit_history','notifications',
    'customer_marketing_preferences','staff_hours','consultation_templates','consultation_template_services',
    'consultation_submissions','consultation_audit_events','customer_reviews',
    'review_moderation_events','customer_data_requests','import_batches'
  ];
begin
  select owner_id into v_owner from businesses where id = p_business_id;
  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'Workspace not found';
  end if;

  select jsonb_build_object(
    'formatVersion', 2,
    'generatedAt', now(),
    'business', to_jsonb(b) - array[
      'stripe_account_id','stripe_subscription_id','stripe_customer_id'
    ]
  ) into v_result
  from businesses b where b.id = p_business_id;

  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is not null then
      v_row_expression := case v_table
        when 'customers' then 'to_jsonb(t) - array[''auth_user_id'',''stripe_customer_id'']'
        when 'bookings' then 'to_jsonb(t) - array[''stripe_charge_id'',''stripe_payment_intent_id'']'
        when 'payments' then 'to_jsonb(t) - array[''stripe_charge_id'',''stripe_payment_intent_id'',''stripe_refund_id'']'
        when 'customer_marketing_preferences' then 'to_jsonb(t) - ''unsubscribe_token'''
        else 'to_jsonb(t)'
      end;
      execute format(
        'select coalesce(jsonb_agg(%s), ''[]''::jsonb) from public.%I t where business_id = $1',
        v_row_expression, v_table
      ) into v_rows using p_business_id;
      v_result := v_result || jsonb_build_object(v_table, v_rows);
    end if;
  end loop;
  return v_result;
end;
$$;

revoke all on function public.export_owner_workspace(uuid) from public, anon;
grant execute on function public.export_owner_workspace(uuid) to authenticated;
