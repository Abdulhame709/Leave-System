-- Foundation only. No login role is granted access: per-user authorization,
-- audit, idempotency and trusted identity propagation must be implemented first.
-- Run as a migration owner on an isolated development database, never production.
BEGIN;

CREATE SCHEMA leave_app;

CREATE TABLE leave_app.organizations (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code = btrim(code) AND length(code) BETWEEN 1 AND 50),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  timezone text NOT NULL DEFAULT 'Asia/Aden',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE leave_app.branches (
  organization_id uuid NOT NULL REFERENCES leave_app.organizations(id),
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (organization_id, id)
);

CREATE TABLE leave_app.departments (
  organization_id uuid NOT NULL,
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, branch_id) REFERENCES leave_app.branches (organization_id, id)
);
CREATE INDEX departments_branch_idx ON leave_app.departments (organization_id, branch_id);

CREATE TABLE leave_app.employees (
  organization_id uuid NOT NULL,
  id uuid NOT NULL,
  employee_code text NOT NULL CHECK (employee_code = btrim(employee_code) AND length(employee_code) BETWEEN 1 AND 100),
  name_ar text NOT NULL CHECK (length(btrim(name_ar)) > 0),
  name_en text,
  department_id uuid NOT NULL,
  manager_id uuid,
  hire_date date,
  external_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, employee_code),
  FOREIGN KEY (organization_id, department_id) REFERENCES leave_app.departments (organization_id, id),
  FOREIGN KEY (organization_id, manager_id) REFERENCES leave_app.employees (organization_id, id),
  CHECK (manager_id IS NULL OR manager_id <> id)
);
CREATE INDEX employees_department_idx ON leave_app.employees (organization_id, department_id);
CREATE INDEX employees_manager_idx ON leave_app.employees (organization_id, manager_id);

-- Missing/empty context denies access. Only a trusted backend may set this value,
-- from a verified principal and membership, within the same transaction as each
-- query. A DB credential able to issue arbitrary SQL can forge this setting.
-- RLS here is tenant-only; it does NOT enforce employee/manager/HR permissions.
CREATE FUNCTION leave_app.current_organization_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_organization_id', true), '')::uuid
$$;

ALTER TABLE leave_app.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_app.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE leave_app.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_app.branches FORCE ROW LEVEL SECURITY;
ALTER TABLE leave_app.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_app.departments FORCE ROW LEVEL SECURITY;
ALTER TABLE leave_app.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_app.employees FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_organizations ON leave_app.organizations
  USING (id = leave_app.current_organization_id())
  WITH CHECK (id = leave_app.current_organization_id());
CREATE POLICY tenant_branches ON leave_app.branches
  USING (organization_id = leave_app.current_organization_id())
  WITH CHECK (organization_id = leave_app.current_organization_id());
CREATE POLICY tenant_departments ON leave_app.departments
  USING (organization_id = leave_app.current_organization_id())
  WITH CHECK (organization_id = leave_app.current_organization_id());
CREATE POLICY tenant_employees ON leave_app.employees
  USING (organization_id = leave_app.current_organization_id())
  WITH CHECK (organization_id = leave_app.current_organization_id());

-- PostgreSQL grants PUBLIC execute on functions by default; keep the whole
-- schema unavailable until a restricted application role is explicitly set up.
REVOKE ALL ON SCHEMA leave_app FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA leave_app FROM PUBLIC;
REVOKE ALL ON FUNCTION leave_app.current_organization_id() FROM PUBLIC;
COMMIT;
