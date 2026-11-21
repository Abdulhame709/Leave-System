import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { canReadEmployee, canManageEmployee, type Actor, type EmployeeRecord, type Role } from '../packages/authorization/src/employee-policy.ts';

const subject: EmployeeRecord = { organizationId: 'org-a', employeeId: 'employee-a', managerEmployeeId: 'manager-a' };
const actor = (role: Role, employeeId = 'other-a', organizationId = 'org-a'): Actor => ({ role, employeeId, organizationId, active: true });

test('employee can view only their own profile', () => {
  assert.equal(canReadEmployee(actor('employee', 'employee-a'), subject), true);
  assert.equal(canReadEmployee(actor('employee'), subject), false);
  assert.equal(canManageEmployee(actor('employee', 'employee-a'), subject), false);
});
test('manager can view their direct reports, not unrelated staff', () => {
  assert.equal(canReadEmployee(actor('direct_manager', 'manager-a'), subject), true);
  assert.equal(canReadEmployee(actor('direct_manager', 'different-manager'), subject), false);
  assert.equal(canReadEmployee(actor('direct_manager', 'manager-a'), { ...subject, managerEmployeeId: null }), false);
  assert.equal(canManageEmployee(actor('direct_manager', 'manager-a'), subject), false);
});
test('HR officer and organization administrator can read and manage profile within their organization', () => {
  for (const role of ['hr_officer', 'organization_admin'] as const) {
    assert.equal(canReadEmployee(actor(role), subject), true);
    assert.equal(canManageEmployee(actor(role), subject), true);
  }
});
test('HR manager gets no general profile or edit access via report-only role', () => {
  assert.equal(canReadEmployee(actor('hr_manager'), subject), false);
  assert.equal(canManageEmployee(actor('hr_manager'), subject), false);
  assert.equal(canReadEmployee(actor('hr_manager', 'employee-a'), subject), true);
});
test('platform administrator cannot use the employee profile policy', () => {
  assert.equal(canReadEmployee(actor('platform_admin', 'employee-a'), subject), false);
  assert.equal(canManageEmployee(actor('platform_admin', 'employee-a'), subject), false);
});
test('all roles are denied across organizations, even for matching employee or manager IDs', () => {
  for (const role of ['employee', 'direct_manager', 'hr_officer', 'hr_manager', 'organization_admin', 'platform_admin'] as const) {
    for (const id of ['employee-a', 'manager-a', 'other-a']) {
      assert.equal(canReadEmployee(actor(role, id, 'org-b'), subject), false);
      assert.equal(canManageEmployee(actor(role, id, 'org-b'), subject), false);
    }
  }
});
test('inactive accounts are denied, including HR and the employee themselves', () => {
  for (const user of [actor('hr_officer'), actor('employee', 'employee-a'), actor('organization_admin')]) {
    assert.equal(canReadEmployee({ ...user, active: false }, subject), false);
    assert.equal(canManageEmployee({ ...user, active: false }, subject), false);
  }
});
test('missing identity and organization values fail closed', () => {
  assert.equal(canReadEmployee(actor('hr_officer', ''), subject), false);
  assert.equal(canManageEmployee(actor('organization_admin', '  '), subject), false);
  assert.equal(canReadEmployee(actor('hr_officer', 'id', ''), { ...subject, organizationId: '' }), false);
  assert.equal(canReadEmployee(actor('hr_officer'), { ...subject, employeeId: '' }), false);
});

test('unknown roles fail closed even for the employee’s own record', () => {
  const unknown = { ...actor('employee', 'employee-a'), role: 'unknown' as Role };
  assert.equal(canReadEmployee(unknown, subject), false);
  assert.equal(canManageEmployee(unknown, subject), false);
});
