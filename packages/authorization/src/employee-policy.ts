/**
 * Phase 1 policy contract, not an authentication or security boundary.
 * The eventual server must obtain actor and employee information from verified,
 * trusted server-side records. The browser must never decide access, and DB
 * policies must be independently enforced and tested.
 */
export type Role =
  | 'employee'
  | 'direct_manager'
  | 'hr_officer'
  | 'hr_manager'
  | 'organization_admin'
  | 'platform_admin';

export interface Actor {
  organizationId: string;
  employeeId: string;
  role: Role;
  active: boolean;
}

export interface EmployeeRecord {
  organizationId: string;
  employeeId: string;
  managerEmployeeId: string | null;
}

function isInSameOrganization(actor: Actor, employee: EmployeeRecord): boolean {
  return actor.active === true
    && (actor.role === 'employee' || actor.role === 'direct_manager'
      || actor.role === 'hr_officer' || actor.role === 'hr_manager'
      || actor.role === 'organization_admin')
    && actor.organizationId.trim().length > 0
    && actor.employeeId.trim().length > 0
    && employee.organizationId.trim().length > 0
    && employee.employeeId.trim().length > 0
    && actor.organizationId === employee.organizationId;
}

/** Read employee directory/profile data, not medical files or requests. */
export function canReadEmployee(actor: Actor, employee: EmployeeRecord): boolean {
  if (!isInSameOrganization(actor, employee)) return false;
  if (actor.employeeId === employee.employeeId) return true;
  switch (actor.role) {
    case 'hr_officer':
    case 'organization_admin':
      return true;
    case 'direct_manager':
      return employee.managerEmployeeId === actor.employeeId;
    default:
      // HR managers have report-only access, not general employee profiles.
      return false;
  }
}

/**
 * HR and organization admins may manage employee profile data within the
 * organization. This does not grant role administration, account management,
 * medical access, deletion, or authorization to invoke an API.
 */
export function canManageEmployee(actor: Actor, employee: EmployeeRecord): boolean {
  if (!isInSameOrganization(actor, employee)) return false;
  return actor.role === 'hr_officer' || actor.role === 'organization_admin';
}
