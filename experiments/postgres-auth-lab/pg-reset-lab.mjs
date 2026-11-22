// DISPOSABLE LAB ONLY. Not a production Neon adapter. Uses privileged access,
// has no verified HTTP session, no RLS integration, and no safe login issuance.
// ALL membership changes must first lock the same user row, or ownership can race.
export function makeLabResetStore(pool, afterStep = async () => {}) {
  return {
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx = {
          async lockActorMembership(actor) {
            const { rows } = await client.query(`SELECT organization_id, principal_id, role, active
              FROM lab_membership WHERE organization_id=$1 AND principal_id=$2 FOR UPDATE`, [actor.organizationId, actor.principalId]);
            const row = rows[0];
            return row ? {organizationId: row.organization_id, principalId: row.principal_id, role: row.role, active: row.active} : null;
          },
          async lockTargetAccount(org, employee) {
            const found = await client.query(`SELECT m.principal_id, m.organization_id, m.employee_id
              FROM lab_membership m WHERE m.organization_id=$1 AND m.employee_id=$2 AND m.active`, [org, employee]);
            if (!found.rowCount) return null;
            const m = found.rows[0];
            // Every membership creation/transfer/delete must lock this user first.
            await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [m.principal_id]);
            const locked = await client.query(`SELECT m.active, c.active AS account_active, c.version,
                (SELECT count(*)::int FROM lab_membership all_m WHERE all_m.principal_id=m.principal_id) AS memberships
              FROM lab_membership m JOIN lab_credentials c ON c.principal_id=m.principal_id
              WHERE m.organization_id=$1 AND m.employee_id=$2 AND m.principal_id=$3 FOR UPDATE OF m, c`, [org, employee, m.principal_id]);
            if (!locked.rowCount) return null;
            const row = locked.rows[0];
            return { principalId: m.principal_id, employeeId: m.employee_id, organizationId: m.organization_id,
              active: row.active && row.account_active, credentialVersion: row.version,
              ownership: row.memberships === 1 ? 'exclusive' : 'shared' };
          },
          async replaceHashAndIncrementVersion(target, hash) {
            const account = await client.query(`UPDATE "account" SET password=$1, "updatedAt"=now()
              WHERE "userId"=$2 AND "providerId"='credential' AND password IS NOT NULL`, [hash, target.principalId]);
            if (account.rowCount !== 1) throw new Error('Credential account is missing or ambiguous');
            const version = await client.query('UPDATE lab_credentials SET version=version+1 WHERE principal_id=$1 AND version=$2 RETURNING version', [target.principalId, target.credentialVersion]);
            if (version.rowCount !== 1) throw new Error('Credential version conflict');
            await afterStep('rotate');
            return version.rows[0].version;
          },
          async revokeAllSessions(principalId) {
            await client.query('DELETE FROM "session" WHERE "userId"=$1', [principalId]);
            await afterStep('revoke');
          },
          async appendResetAudit(event) {
            await client.query(`INSERT INTO lab_reset_audit (organization_id, actor_principal_id, target_principal_id, event)
              VALUES ($1,$2,$3,$4)`, [event.organizationId, event.actorPrincipalId, event.targetPrincipalId, event.event]);
            await afterStep('audit');
          },
        };
        const result = await work(tx);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
  };
}
