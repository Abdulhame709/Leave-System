// Local synthetic-memory experiment: do not import this setup in deployed code.
import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { createProvisioningLab } from '../experiments/better-auth-poc/admin-lab.mjs';
import { exampleUsername } from '../experiments/better-auth-poc/poc.mjs';
import { canManageEmployee } from '../packages/authorization/src/employee-policy.ts';

function cookieHeader(response: Response) {
  return new Headers({ cookie: response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ') });
}

test('local server-side provisioning works with synthetic identifiers while public signup is disabled', async () => {
  const { auth } = await createProvisioningLab();
  const password = randomBytes(24).toString('hex');
  const username = exampleUsername('orga', '42');
  const signUp = await auth.api.signUpEmail({
    body: { name: 'Synthetic', email: 'test@example.invalid', username, password },
    asResponse: true,
  });
  assert.equal(signUp.status, 400);

  // This direct server call bypasses session checks when no request is passed.
  // It must only ever be invoked after independent authorization in real code.
  const created = await auth.api.createUser({
    body: { name: 'Synthetic', email: 'test@example.invalid', password, data: { username } },
  });
  const login = await auth.api.signInUsername({ body: { username, password }, asResponse: true });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.id, created.user.id);

  const publicAdmin = await auth.handler(new Request('https://auth.example.test/api/auth/admin/create-user', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://auth.example.test' },
    body: JSON.stringify({ name: 'Synthetic', email: 'other@example.invalid', password }),
  }));
  assert.ok([401, 403].includes(publicAdmin.status));
});

test('local reset experiment exposes existing sessions until revoked; global admin is not tenant-scoped', async () => {
  const { auth } = await createProvisioningLab();
  const adminPassword = randomBytes(24).toString('hex');
  const oldPassword = randomBytes(24).toString('hex');
  const newPassword = randomBytes(24).toString('hex');
  const adminName = exampleUsername('orga', 'admin');
  const otherName = exampleUsername('orgb', '100');
  await auth.api.createUser({
    body: { name: 'Synthetic admin A', email: 'admin@example.invalid', password: adminPassword, role: 'admin', data: { username: adminName } },
  });
  const other = await auth.api.createUser({
    body: { name: 'Synthetic user B', email: 'other@example.invalid', password: oldPassword, data: { username: otherName } },
  });
  const adminLogin = await auth.api.signInUsername({ body: { username: adminName, password: adminPassword }, asResponse: true });
  const oldLogin = await auth.api.signInUsername({ body: { username: otherName, password: oldPassword }, asResponse: true });
  assert.equal(adminLogin.status, 200);
  assert.equal(oldLogin.status, 200);
  const adminHeaders = cookieHeader(adminLogin);
  const oldHeaders = cookieHeader(oldLogin);

  // The separate app-layer policy denies A's HR access to B's employee.
  assert.equal(canManageEmployee(
    { organizationId: 'org-a', employeeId: 'admin-a', role: 'hr_officer', active: true },
    { organizationId: 'org-b', employeeId: 'user-b', managerEmployeeId: null },
  ), false);
  // Better Auth's global admin plugin has no knowledge of our tenant boundary:
  // this reset succeeds in the lab and is exactly why direct admin routes must
  // never be exposed in the real system without a verified tenant-aware guard.
  await auth.api.setUserPassword({ body: { userId: other.user.id, newPassword }, headers: adminHeaders });
  assert.equal((await auth.api.signInUsername({ body: { username: otherName, password: oldPassword }, asResponse: true })).status, 401);
  assert.equal((await auth.api.signInUsername({ body: { username: otherName, password: newPassword }, asResponse: true })).status, 200);
  assert.equal((await auth.api.getSession({ headers: oldHeaders }))?.user.id, other.user.id);
  await auth.api.revokeUserSessions({ body: { userId: other.user.id }, headers: adminHeaders });
  assert.equal(await auth.api.getSession({ headers: oldHeaders }), null);
});
