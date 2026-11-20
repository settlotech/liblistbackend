-- Destructive maintenance script. Run manually only when a full application-data reset is intended.
-- This is deliberately not included in database/initDatabase.js startup migrations.
BEGIN;

DO $$
DECLARE
    table_list TEXT;
BEGIN
    SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY schemaname, tablename)
    INTO table_list
    FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      AND schemaname NOT LIKE 'pg_%';

    IF table_list IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || table_list || ' RESTART IDENTITY CASCADE';
    END IF;
END
$$;

COMMIT;
