import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  resetCredentialsAtomically, sessionMatchesCredentialVersion, ResetDenied,
  type ResetTransaction, type TransactionalResetStore, type LockedTargetAccount,
  type LockedMembership, type VerifiedActor,
} from '../packages/security/src/credential-reset.ts';

type State = {
  actors: LockedMembership[];
  targets: (LockedTargetAccount & { hash: string })[];
  sessions: { principalId: string; credentialVersion: number; organizationId: string }[];
  audits: { organizationId: string; actorPrincipalId: string; targetPrincipalId: string; event: 'password_reset' }[];
};
const hr: VerifiedActor = { organizationId: 'org-a', principalId: 'hr-a' };
const fixture = (): State => ({
  actors: [
    { organizationId: 'org-a', principalId: 'hr-a', role: 'hr_officer', active: true },
    { organizationId: 'org-a', principalId: 'manager-a', role: 'direct_manager', active: true },
    { organizationId: 'org-a', principalId: 'admin-a', role: 'organization_admin', active: true },
    { organizationId: 'org-b', principalId: 'hr-b', role: 'hr_officer', active: true },
    { organizationId: 'org-a', principalId: 'inactive-a', role: 'hr_officer', active: false },
  ],
  targets: [
    { organizationId: 'org-a', employeeId: 'employee-a', principalId: 'user-a', active: true, credentialVersion: 1, ownership: 'exclusive', hash: 'old-hash' },
    { organizationId: 'org-b', employeeId: 'employee-b', principalId: 'user-b', active: true, credentialVersion: 4, ownership: 'exclusive', hash: 'other-hash' },
  ],
  sessions: [
    { organizationId: 'org-a', principalId: 'user-a', credentialVersion: 1 },
    { organizationId: 'org-b', principalId: 'user-a', credentialVersion: 1 },
    { organizationId: 'org-b', principalId: 'user-b', credentialVersion: 4 },
  ],
  audits: [],
});

class FakeTransactionalStore implements TransactionalResetStore {
  state: State = fixture();
  failAt: '' | 'rotate' | 'revoke' | 'audit' | 'version' = '';
  private tail: Promise<void> = Promise.resolve();
  async transaction<T>(work: (tx: ResetTransaction) => Promise<T>): Promise<T> {
    // This simulated mutex/snapshot is NOT a PostgreSQL or distributed test.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.tail;
    this.tail = previous.then(() => gate);
    await previous;
    const draft = structuredClone(this.state);
    const tx: ResetTransaction = {
      lockActorMembership: async (actor) => draft.actors.find((m) => m.organizationId === actor.organizationId && m.principalId === actor.principalId) ?? null,
      lockTargetAccount: async (org, id) => {
        const found = draft.targets.find((a) => a.organizationId === org && a.employeeId === id);
        return found ? { ...found } : null;
      },
      replaceHashAndIncrementVersion: async (target, hash) => {
        const row = draft.targets.find((a) => a.organizationId === target.organizationId && a.principalId === target.principalId);
        if (!row || row.credentialVersion !== target.credentialVersion) throw new Error('stale');
        row.hash = hash;
        row.credentialVersion += 1;
        if (this.failAt === 'rotate') throw new Error('failure');
        return this.failAt === 'version' ? row.credentialVersion + 1 : row.credentialVersion;
      },
      revokeAllSessions: async (principal) => {
        draft.sessions = draft.sessions.filter((s) => s.principalId !== principal);
        if (this.failAt === 'revoke') throw new Error('failure');
      },
      appendResetAudit: async (event) => {
        draft.audits.push(event);
        if (this.failAt === 'audit') throw new Error('failure');
      },
    };
    try {
      const result = await work(tx);
      this.state = draft;
      return result;
    } finally { release(); }
  }
}

test('authorized reset rotates credential, globally revokes sessions and appends non-secret audit together', async () => {
  const store = new FakeTransactionalStore();
  await resetCredentialsAtomically(store, hr, 'employee-a', 'test-hash-new');
  assert.equal(store.state.targets[0].hash, 'test-hash-new');
  assert.equal(store.state.targets[0].credentialVersion, 2);
  assert.deepEqual(store.state.sessions.map((s) => s.principalId), ['user-b']);
  assert.deepEqual(store.state.audits, [{ organizationId: 'org-a', actorPrincipalId: 'hr-a', targetPrincipalId: 'user-a', event: 'password_reset' }]);
  assert.equal(JSON.stringify(store.state.audits).includes('test-hash-new'), false);
});

test('rejects unrelated tenant, insufficient role, inactive membership and absent principal with no changes', async () => {
  for (const [actor, target] of [
    [hr, 'employee-b'],
    [{ organizationId: 'org-a', principalId: 'manager-a' }, 'employee-a'],
    [{ organizationId: 'org-a', principalId: 'inactive-a' }, 'employee-a'],
    [{ organizationId: 'org-a', principalId: 'missing' }, 'employee-a'],
    [{ organizationId: 'org-b', principalId: 'hr-b' }, 'employee-a'],
  ] as [VerifiedActor, string][]) {
    const store = new FakeTransactionalStore();
    const before = structuredClone(store.state);
    await assert.rejects(resetCredentialsAtomically(store, actor, target, 'test-hash'), ResetDenied);
    assert.deepEqual(store.state, before);
  }
});

test('shared, unverified or inactive target accounts are never reset by a tenant administrator', async () => {
  for (const condition of ['shared', 'unknown', 'inactive'] as const) {
    const store = new FakeTransactionalStore();
    if (condition === 'inactive') store.state.targets[0].active = false;
    else store.state.targets[0].ownership = condition;
    const before = structuredClone(store.state);
    await assert.rejects(resetCredentialsAtomically(store, hr, 'employee-a', 'test-hash'), ResetDenied);
    assert.deepEqual(store.state, before);
  }
});

test('blank or malformed context is rejected', async () => {
  const store = new FakeTransactionalStore();
  await assert.rejects(resetCredentialsAtomically(store, { organizationId: '', principalId: 'hr-a' }, 'employee-a', 'hash'), ResetDenied);
  await assert.rejects(resetCredentialsAtomically(store, hr, '', 'hash'), ResetDenied);
  await assert.rejects(resetCredentialsAtomically(store, hr, 'employee-a', ''), ResetDenied);
});

test('simulated failure at any step rolls back password, version, sessions and audit', async () => {
  for (const step of ['rotate', 'version', 'revoke', 'audit'] as const) {
    const store = new FakeTransactionalStore();
    const before = structuredClone(store.state);
    store.failAt = step;
    await assert.rejects(resetCredentialsAtomically(store, hr, 'employee-a', 'test-hash'));
    assert.deepEqual(store.state, before);
  }
});

test('stale concurrent session is rejected by version guard', () => {
  const account = { principalId: 'user-a', credentialVersion: 2, active: true };
  assert.equal(sessionMatchesCredentialVersion({ principalId: 'user-a', credentialVersion: 1 }, account), false);
  assert.equal(sessionMatchesCredentialVersion({ principalId: 'user-a', credentialVersion: 2 }, account), true);
  assert.equal(sessionMatchesCredentialVersion({ principalId: 'user-b', credentialVersion: 2 }, account), false);
  assert.equal(sessionMatchesCredentialVersion({ principalId: 'user-a', credentialVersion: 2 }, { ...account, active: false }), false);
  assert.equal(sessionMatchesCredentialVersion({ principalId: 'user-a', credentialVersion: -1 }, { ...account, credentialVersion: -1 }), false);
});

test('two separate simulated concurrent resets serialize and advance credential version twice', async () => {
  const store = new FakeTransactionalStore();
  await Promise.all([
    resetCredentialsAtomically(store, hr, 'employee-a', 'hash-1'),
    resetCredentialsAtomically(store, { organizationId: 'org-a', principalId: 'admin-a' }, 'employee-a', 'hash-2'),
  ]);
  assert.equal(store.state.targets[0].credentialVersion, 3);
  assert.equal(store.state.targets[0].hash, 'hash-2');
  assert.equal(store.state.audits.length, 2);
});

test('fails closed even when a faulty adapter returns another membership or target', async () => {
  for (const mismatch of ['actor', 'target'] as const) {
    const store: TransactionalResetStore = {
      transaction: async (work) => work({
        lockActorMembership: async () => ({ ...fixture().actors[0], organizationId: mismatch === 'actor' ? 'org-b' : 'org-a' }),
        lockTargetAccount: async () => ({ ...fixture().targets[0], organizationId: mismatch === 'target' ? 'org-b' : 'org-a' }),
        replaceHashAndIncrementVersion: async () => { throw new Error('must not update'); },
        revokeAllSessions: async () => { throw new Error('must not revoke'); },
        appendResetAudit: async () => { throw new Error('must not audit'); },
      }),
    };
    await assert.rejects(resetCredentialsAtomically(store, hr, 'employee-a', 'test-hash'), ResetDenied);
  }
});
