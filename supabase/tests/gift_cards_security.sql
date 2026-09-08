-- Focused permission assertions for 20260908163000_add_secure_gift_cards.sql.
-- Run after migrations with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/gift_cards_security.sql
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.gift_card_orders'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.gift_cards'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.gift_card_transactions'::regclass) THEN
    RAISE EXCEPTION 'Gift card tables must have RLS enabled';
  END IF;

  IF has_table_privilege('anon', 'public.gift_cards', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', 'public.gift_card_orders', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', 'public.gift_card_transactions', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'Anonymous users must not access gift card records';
  END IF;

  IF has_table_privilege('authenticated', 'public.gift_cards', 'INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.gift_card_orders', 'INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.gift_card_transactions', 'INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'Authenticated browsers must not mutate gift card value or ledger rows';
  END IF;

  IF has_function_privilege('anon', 'public.create_gift_card_order(uuid,uuid,integer,text,text,text,text,text,text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_gift_card_order(uuid,uuid,integer,text,text,text,text,text,text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fulfill_gift_card_purchase(uuid,uuid,integer,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fulfill_gift_card_purchase(uuid,uuid,integer,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.issue_gift_card(uuid,integer,text,text,text,text,text,text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.issue_gift_card(uuid,integer,text,text,text,text,text,text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.redeem_gift_card(uuid,uuid,text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.redeem_gift_card(uuid,uuid,text,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Gift card value-changing RPCs must be service-role only';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.fulfill_gift_card_purchase(uuid,uuid,integer,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.issue_gift_card(uuid,integer,text,text,text,text,text,text,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.redeem_gift_card(uuid,uuid,text,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Service role is missing a required gift card RPC permission';
  END IF;
END;
$$;

SELECT 'gift card RLS and RPC permissions passed' AS result;
