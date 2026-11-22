-- Disposable test. Role, grants, membership fixtures, and data are rolled back.
-- The fixture loader must be allowed to bypass RLS; the tested role must not.
BEGIN;
CREATE ROLE leave_member_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT leave_member_test TO CURRENT_USER WITH SET TRUE;
GRANT USAGE ON SCHEMA leave_app TO leave_member_test;
GRANT EXECUTE ON FUNCTION leave_app.current_organization_id() TO leave_member_test;
GRANT EXECUTE ON FUNCTION leave_app.current_principal_id() TO leave_member_test;
-- Deliberately broad privileges here test RLS independently of GRANTs.
-- Never give these permissions to the real application role.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA leave_app TO leave_member_test;

INSERT INTO leave_app.organizations (id, code, name) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'demo-a', 'Demo A'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'demo-b', 'Demo B');
INSERT INTO leave_app.branches (organization_id, id, name) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'A branch'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'B branch');
INSERT INTO leave_app.departments (organization_id, id, branch_id, name) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'A dept'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'B dept');
INSERT INTO leave_app.employees (organization_id, id, employee_code, name_ar, department_id) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000001', 'manager', 'مدير وهمي', '33333333-3333-3333-3333-333333333333'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000002', 'emp', 'موظف وهمي', '33333333-3333-3333-3333-333333333333'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000003', 'hr', 'موارد وهمي', '33333333-3333-3333-3333-333333333333'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000004', 'hr-manager', 'مدير موارد وهمي', '33333333-3333-3333-3333-333333333333'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000005', 'disabled', 'معطل وهمي', '33333333-3333-3333-3333-333333333333'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000006', 'admin', 'مسؤول مؤسسة وهمي', '33333333-3333-3333-3333-333333333333'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000001', 'emp', 'موظف ب وهمي', '44444444-4444-4444-4444-444444444444');
UPDATE leave_app.employees SET manager_id = '10000000-0000-0000-0000-000000000001'
 WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND id = '10000000-0000-0000-0000-000000000002';
INSERT INTO leave_app.organization_memberships (organization_id, principal_id, employee_id, role, active) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'manager-a', '10000000-0000-0000-0000-000000000001', 'direct_manager', true),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'employee-a', '10000000-0000-0000-0000-000000000002', 'employee', true),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'hr-a', '10000000-0000-0000-0000-000000000003', 'hr_officer', true),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'hr-manager-a', '10000000-0000-0000-0000-000000000004', 'hr_manager', true),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'disabled-a', '10000000-0000-0000-0000-000000000005', 'employee', false),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin-a', '10000000-0000-0000-0000-000000000006', 'organization_admin', true),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'employee-b', '20000000-0000-0000-0000-000000000001', 'employee', true);

SET LOCAL ROLE leave_member_test;
SELECT set_config('app.current_organization_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
SELECT set_config('app.current_principal_id', '', true);
DO $$ DECLARE n int; t text; BEGIN
 FOREACH t IN ARRAY ARRAY['organizations','branches','departments','employees','organization_memberships'] LOOP
  EXECUTE format('SELECT count(*) FROM leave_app.%I',t) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'missing principal leaked rows: %',t; END IF;
 END LOOP;
END $$;

SELECT set_config('app.current_principal_id', 'employee-a', true);
DO $$ DECLARE n int; BEGIN
 SELECT count(*) INTO n FROM leave_app.employees; IF n <> 1 THEN RAISE EXCEPTION 'employee self scope failed'; END IF;
 SELECT count(*) INTO n FROM leave_app.organization_memberships; IF n <> 1 THEN RAISE EXCEPTION 'membership self scope failed'; END IF;
 SELECT count(*) INTO n FROM leave_app.departments; IF n <> 1 THEN RAISE EXCEPTION 'department tenant scope failed'; END IF;
 UPDATE leave_app.employees SET name_ar = 'wrong'; GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 0 THEN RAISE EXCEPTION 'employee update should be denied'; END IF;
 BEGIN
  INSERT INTO leave_app.organization_memberships (organization_id,principal_id,employee_id,role) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','attacker','10000000-0000-0000-0000-000000000002','organization_admin');
  RAISE EXCEPTION 'membership write unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('app.current_principal_id', 'manager-a', true);
DO $$ DECLARE n int; BEGIN
 SELECT count(*) INTO n FROM leave_app.employees; IF n <> 2 THEN RAISE EXCEPTION 'manager direct reports scope failed'; END IF;
 SELECT count(*) INTO n FROM leave_app.employees WHERE employee_code='hr'; IF n <> 0 THEN RAISE EXCEPTION 'manager saw unrelated employee'; END IF;
END $$;

SELECT set_config('app.current_principal_id', 'hr-a', true);
DO $$ DECLARE n int; BEGIN
 SELECT count(*) INTO n FROM leave_app.employees; IF n <> 6 THEN RAISE EXCEPTION 'HR scope failed'; END IF;
 SELECT count(*) INTO n FROM leave_app.organization_memberships; IF n <> 1 THEN RAISE EXCEPTION 'HR read other memberships'; END IF;
END $$;

SELECT set_config('app.current_principal_id', 'admin-a', true);
DO $$ DECLARE n int; BEGIN
 SELECT count(*) INTO n FROM leave_app.employees; IF n <> 6 THEN RAISE EXCEPTION 'organization admin scope failed'; END IF;
END $$;

SELECT set_config('app.current_principal_id', 'hr-manager-a', true);
DO $$ DECLARE n int; BEGIN
 SELECT count(*) INTO n FROM leave_app.employees; IF n <> 1 THEN RAISE EXCEPTION 'report-only HR manager profile scope failed'; END IF;
END $$;

SELECT set_config('app.current_principal_id', 'disabled-a', true);
DO $$ DECLARE n int; BEGIN
 SELECT count(*) INTO n FROM leave_app.employees; IF n <> 0 THEN RAISE EXCEPTION 'disabled principal saw data'; END IF;
 SELECT count(*) INTO n FROM leave_app.organizations; IF n <> 0 THEN RAISE EXCEPTION 'disabled principal saw organization'; END IF;
END $$;

-- A legitimate principal cannot impersonate a different tenant by changing context.
SELECT set_config('app.current_principal_id', 'employee-a', true);
SELECT set_config('app.current_organization_id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
DO $$ DECLARE n int; BEGIN
 SELECT count(*) INTO n FROM leave_app.employees; IF n <> 0 THEN RAISE EXCEPTION 'cross-tenant employee leak'; END IF;
 SELECT count(*) INTO n FROM leave_app.organizations; IF n <> 0 THEN RAISE EXCEPTION 'cross-tenant organization leak'; END IF;
END $$;
SELECT set_config('app.current_principal_id', 'employee-b', true);
DO $$ DECLARE n int; BEGIN
 SELECT count(*) INTO n FROM leave_app.employees; IF n <> 1 THEN RAISE EXCEPTION 'tenant B self scope failed'; END IF;
 SELECT count(*) INTO n FROM leave_app.organizations; IF n <> 1 THEN RAISE EXCEPTION 'tenant B organization scope failed'; END IF;
END $$;
SELECT set_config('app.current_organization_id', '', true);
DO $$ DECLARE n int; BEGIN
 SELECT count(*) INTO n FROM leave_app.employees; IF n <> 0 THEN RAISE EXCEPTION 'missing tenant context leaked data'; END IF;
END $$;
ROLLBACK;
