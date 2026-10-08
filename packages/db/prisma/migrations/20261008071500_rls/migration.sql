-- Row Level Security multi-tenant (escrita à mão; não gerada pelo diff do schema).
--
-- Modelo:
--  * O código de sistema/admin liga como dono das tabelas (postgres) e não é afetado pelo RLS.
--  * Todo o acesso feito em nome de um restaurante usa `withTenant(restaurantId, fn)`
--    (packages/db/src/tenant.ts), que numa transação faz:
--        SET LOCAL ROLE mesapay_app;  set_config('app.restaurant_id', <id>, true)
--    O papel mesapay_app NÃO ignora RLS, por isso só vê/escreve linhas desse restaurante.
--  * RLS fica ativo em TODAS as tabelas: sem política, os papéis anon/authenticated do
--    Supabase (PostgREST) não conseguem ler nada diretamente.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mesapay_app') THEN
    CREATE ROLE mesapay_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

-- Permite ao utilizador das migrações/app fazer SET ROLE mesapay_app.
DO $$
BEGIN
  EXECUTE format('GRANT mesapay_app TO %I', current_user);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'GRANT mesapay_app ignorado: %', SQLERRM;
END
$$;

GRANT USAGE ON SCHEMA public TO mesapay_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mesapay_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mesapay_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mesapay_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO mesapay_app;

-- Função auxiliar: restaurante do contexto atual (NULL se não definido → nenhuma linha visível).
CREATE OR REPLACE FUNCTION app_restaurant_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.restaurant_id', true), '') $$;
GRANT EXECUTE ON FUNCTION app_restaurant_id() TO mesapay_app;

ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Restaurant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaasUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Testimonial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OwnerUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Table" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TableSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Guest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuOptionGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Printer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PrintJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyStat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Restaurant" FOR ALL TO mesapay_app
  USING ("id" = app_restaurant_id()) WITH CHECK ("id" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "OwnerUser" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "Table" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "TableSession" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "Guest" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "Category" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "MenuItem" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "MenuOptionGroup" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "MenuOption" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "Order" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "OrderItem" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "Payment" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "PaymentAllocation" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "Staff" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "Printer" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "PrintJob" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "Subscription" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "DailyStat" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
CREATE POLICY tenant_isolation ON "AuditLog" FOR ALL TO mesapay_app
  USING ("restaurantId" = app_restaurant_id()) WITH CHECK ("restaurantId" = app_restaurant_id());
