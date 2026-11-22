/**
 * Server-side reset contract under development; NOT connected to Better Auth,
 * Neon, or a public API. All identities must come from a verified server session
 * and all transaction methods must be implemented against a trusted database.
 * A browser-supplied role, organization, or password hash is never trusted.
 */
export type ResetRole = 'employee' | 'direct_manager' | 'hr_officer' | 'hr_manager' | 'organization_admin';

export interface VerifiedActor {
  principalId: string;
  organizationId: string;
}

export interface LockedMembership {
  principalId: string;
  organizationId: string;
  role: ResetRole;
  active: boolean;
}

export interface LockedTargetAccount {
  principalId: string;
  employeeId: string;
  organizationId: string;
  active: boolean;
  credentialVersion: number;
  /** Must be computed authoritatively across all organizations, not under tenant-only RLS. */
  ownership: 'exclusive' | 'shared' | 'unknown';
}

export interface ResetTransaction {
  /** Lock membership/permissions so concurrent changes cannot grant a stale reset. */
  lockActorMembership(actor: VerifiedActor): Promise<LockedMembership | null>;
  /** Lock credential and ownership invariant across ALL organizations until commit;
   * membership/account creation and transfer must take the same lock. Select
   * the target only from the verified actor's organization. */
  lockTargetAccount(organizationId: string, employeeId: string): Promise<LockedTargetAccount | null>;
  /** Update hash and atomically increment account version, conditional on expectedVersion. */
  replaceHashAndIncrementVersion(target: LockedTargetAccount, passwordHash: string): Promise<number>;
  /** Revoke every session for the principal, not just sessions labelled with the current tenant. */
  revokeAllSessions(principalId: string): Promise<void>;
  /** Insert a security event in the same transaction, without a hash or password. */
  appendResetAudit(event: { organizationId: string; actorPrincipalId: string; targetPrincipalId: string; event: 'password_reset' }): Promise<void>;
}

export interface TransactionalResetStore {
  /** Must COMMIT all operations on success and ROLLBACK all on any exception. */
  transaction<T>(work: (tx: ResetTransaction) => Promise<T>): Promise<T>;
}

export class ResetDenied extends Error {
  constructor() {
    // Uniform error for missing targets and forbidden operations to reduce enumeration.
    super('Credential reset is not permitted');
    this.name = 'ResetDenied';
  }
}

/**
 * `passwordHash` must be created by the approved password-hashing provider on
 * the server. This function does not accept or hash passwords from the browser.
 * Idempotency, reset delivery, rate limiting, and a real DB adapter are not yet
 * implemented. Do not expose this function as an endpoint.
 */
export async function resetCredentialsAtomically(
  store: TransactionalResetStore,
  actor: VerifiedActor,
  targetEmployeeId: string,
  passwordHash: string,
): Promise<void> {
  if (!actor.principalId?.trim() || !actor.organizationId?.trim() || !targetEmployeeId?.trim() || !passwordHash?.trim()) {
    throw new ResetDenied();
  }
  await store.transaction(async (tx) => {
    const membership = await tx.lockActorMembership(actor);
    if (!membership || !membership.active || membership.organizationId !== actor.organizationId
      || membership.principalId !== actor.principalId
      || (membership.role !== 'hr_officer' && membership.role !== 'organization_admin')) throw new ResetDenied();

    const target = await tx.lockTargetAccount(actor.organizationId, targetEmployeeId);
    if (!target || !target.active || target.organizationId !== actor.organizationId
      || target.employeeId !== targetEmployeeId || !target.principalId?.trim()
      || target.ownership !== 'exclusive' || !Number.isSafeInteger(target.credentialVersion)
      || target.credentialVersion < 0 || target.credentialVersion >= Number.MAX_SAFE_INTEGER) throw new ResetDenied();

    const previousVersion = target.credentialVersion;
    const nextVersion = await tx.replaceHashAndIncrementVersion(target, passwordHash);
    if (nextVersion !== previousVersion + 1) throw new Error('Invalid credential version transition');
    await tx.revokeAllSessions(target.principalId);
    await tx.appendResetAudit({ organizationId: actor.organizationId, actorPrincipalId: actor.principalId, targetPrincipalId: target.principalId, event: 'password_reset' });
  });
}

/**
 * This is an additional version guard, not authentication: signature, expiry,
 * principal, tenant membership, account status, and server-side state must also
 * be verified. It prevents a stale session created concurrently with a reset
 * from becoming valid if enforced on EVERY protected request against authoritative DB state.
 * A login that verifies a password before a reset MUST bind its issued session
 * to the version observed with that password, or serialize issuance with reset.
 * Reading a new version after verifying an old password would defeat this guard.
 * In-flight authorized operations require their own synchronization policy;
 * this check alone does not cancel work already authorized.
 */
export function sessionMatchesCredentialVersion(
  session: { principalId: string; credentialVersion: number },
  account: { principalId: string; credentialVersion: number; active: boolean },
): boolean {
  return account.active === true && !!session.principalId?.trim() && session.principalId === account.principalId
    && Number.isSafeInteger(session.credentialVersion) && session.credentialVersion >= 0
    && Number.isSafeInteger(account.credentialVersion) && account.credentialVersion >= 0
    && session.credentialVersion === account.credentialVersion;
}
