-- Development foundation only. No password/session implementation, no grants
-- to an application login, and no write policies are introduced here.
-- A trusted backend must verify an authenticated principal before setting
-- these transaction-local values. Never accept either value from an HTTP body.
BEGIN;

CREATE TABLE leave_app.organization_memberships (
  organization_id uuid NOT NULL,
  principal_id text NOT NULL CHECK (principal_id = btrim(principal_id) AND length(principal_id) BETWEEN 1 AND 255),
  employee_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('employee', 'direct_manager', 'hr_officer', 'hr_manager', 'organization_admin')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (organization_id, principal_id),
  UNIQUE (organization_id, employee_id),
  FOREIGN KEY (organization_id, employee_id) REFERENCES leave_app.employees (organization_id, id)
);

CREATE FUNCTION leave_app.current_principal_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_principal_id', true), '')
$$;

ALTER TABLE leave_app.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_app.organization_memberships FORCE ROW LEVEL SECURITY;
-- A principal may query only their own active membership in the active tenant.
CREATE POLICY membership_self ON leave_app.organization_memberships FOR SELECT
  USING (organization_id = leave_app.current_organization_id()
     AND principal_id = leave_app.current_principal_id()
     AND active AND deleted_at IS NULL);

-- Replace tenant-only policies with membership-aware SELECT policies. No write
-- policy exists; management will require separate audited authorization design.
DROP POLICY tenant_organizations ON leave_app.organizations;
DROP POLICY tenant_branches ON leave_app.branches;
DROP POLICY tenant_departments ON leave_app.departments;
DROP POLICY tenant_employees ON leave_app.employees;

CREATE POLICY organization_member_read ON leave_app.organizations FOR SELECT
  USING (id = leave_app.current_organization_id() AND deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM leave_app.organization_memberships m
                WHERE m.organization_id = organizations.id));
CREATE POLICY branch_member_read ON leave_app.branches FOR SELECT
  USING (organization_id = leave_app.current_organization_id() AND deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM leave_app.organization_memberships m
                WHERE m.organization_id = branches.organization_id));
CREATE POLICY department_member_read ON leave_app.departments FOR SELECT
  USING (organization_id = leave_app.current_organization_id() AND deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM leave_app.organization_memberships m
                WHERE m.organization_id = departments.organization_id));
CREATE POLICY employee_authorized_read ON leave_app.employees FOR SELECT
  USING (organization_id = leave_app.current_organization_id() AND deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM leave_app.organization_memberships m
       WHERE m.organization_id = employees.organization_id
         AND (m.employee_id = employees.id
           OR m.role IN ('hr_officer', 'organization_admin')
           OR (m.role = 'direct_manager' AND employees.manager_id = m.employee_id))));

REVOKE ALL ON leave_app.organization_memberships FROM PUBLIC;
REVOKE ALL ON FUNCTION leave_app.current_principal_id() FROM PUBLIC;
COMMIT;
