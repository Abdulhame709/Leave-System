-- Run only in a disposable database as a test role allowed to CREATE ROLE.
-- A deliberately over-privileged non-owner role is granted table permissions
-- below solely to exercise RLS; NEVER apply these grants to the real application.
BEGIN;
CREATE ROLE leave_rls_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
-- PostgreSQL 16+ does not necessarily grant SET ROLE to the creator.
-- This temporary grant and the role are both rolled back with the test.
GRANT leave_rls_test TO CURRENT_USER WITH SET TRUE;
GRANT USAGE ON SCHEMA leave_app TO leave_rls_test;
GRANT EXECUTE ON FUNCTION leave_app.current_organization_id() TO leave_rls_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA leave_app TO leave_rls_test;

-- Fixture loading explicitly switches tenant context: works under FORCE RLS.
SELECT set_config('app.current_organization_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
INSERT INTO leave_app.organizations (id, code, name) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'Demo A');
INSERT INTO leave_app.branches (organization_id, id, name) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'A branch');
INSERT INTO leave_app.departments (organization_id, id, branch_id, name) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'A department');
INSERT INTO leave_app.employees (organization_id, id, employee_code, name_ar, department_id) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', '1', 'موظف أ', '22222222-2222-2222-2222-222222222222');
SELECT set_config('app.current_organization_id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
INSERT INTO leave_app.organizations (id, code, name) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B', 'Demo B');
INSERT INTO leave_app.branches (organization_id, id, name) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', 'B branch');
INSERT INTO leave_app.departments (organization_id, id, branch_id, name) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', 'B department');
INSERT INTO leave_app.employees (organization_id, id, employee_code, name_ar, department_id) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '66666666-6666-6666-6666-666666666666', '1', 'موظف ب', '55555555-5555-5555-5555-555555555555');

SET LOCAL ROLE leave_rls_test;
SELECT set_config('app.current_organization_id', '', true);
DO $$
DECLARE n int; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations','branches','departments','employees'] LOOP
    EXECUTE format('SELECT count(*) FROM leave_app.%I', t) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'missing context leaked rows from %', t; END IF;
  END LOOP;
  BEGIN
    INSERT INTO leave_app.organizations (id, code, name) VALUES ('99999999-9999-9999-9999-999999999999', 'X', 'wrong');
    RAISE EXCEPTION 'insert without context succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT set_config('app.current_organization_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
DO $$
DECLARE n int; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations','branches','departments','employees'] LOOP
    EXECUTE format('SELECT count(*) FROM leave_app.%I', t) INTO n;
    IF n <> 1 THEN RAISE EXCEPTION 'tenant A isolation failed on %: %', t, n; END IF;
  END LOOP;
  SELECT count(*) INTO n FROM leave_app.employees WHERE organization_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  IF n <> 0 THEN RAISE EXCEPTION 'tenant B employee visible'; END IF;
  UPDATE leave_app.employees SET name_ar = 'wrong' WHERE organization_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'cross-tenant update succeeded'; END IF;
  DELETE FROM leave_app.employees WHERE organization_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'cross-tenant delete succeeded'; END IF;
  BEGIN
    UPDATE leave_app.employees SET organization_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE employee_code = '1';
    RAISE EXCEPTION 'cross-tenant transfer succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO leave_app.branches (organization_id, id, name) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '77777777-7777-7777-7777-777777777777', 'wrong');
    RAISE EXCEPTION 'cross-tenant insert succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO leave_app.departments (organization_id, id, branch_id, name) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '88888888-8888-8888-8888-888888888888', '44444444-4444-4444-4444-444444444444', 'wrong');
    RAISE EXCEPTION 'cross-tenant foreign key succeeded';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;

SELECT set_config('app.current_organization_id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
DO $$
DECLARE n int; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations','branches','departments','employees'] LOOP
    EXECUTE format('SELECT count(*) FROM leave_app.%I', t) INTO n;
    IF n <> 1 THEN RAISE EXCEPTION 'tenant B isolation failed on %: %', t, n; END IF;
  END LOOP;
  SELECT count(*) INTO n FROM leave_app.employees WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF n <> 0 THEN RAISE EXCEPTION 'tenant A employee visible to B'; END IF;
  UPDATE leave_app.employees SET name_ar = 'wrong' WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'B cross-tenant update succeeded'; END IF;
  BEGIN
    INSERT INTO leave_app.branches (organization_id, id, name) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '99999999-9999-9999-9999-999999999999', 'wrong');
    RAISE EXCEPTION 'B cross-tenant insert succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;

-- Transaction-local tenant settings must not persist into the next transaction.
BEGIN;
SELECT set_config('app.current_organization_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
COMMIT;
BEGIN;
DO $$
BEGIN
  IF NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL THEN
    RAISE EXCEPTION 'tenant context leaked beyond transaction';
  END IF;
END $$;
ROLLBACK;
