// Lab protocol, NOT an HTTP handler and NOT safe for production. All native
// Better Auth HTTP routes MUST remain inaccessible if this protocol is tested.
// No cookie is returned to the caller until the DB transaction has committed.
export async function guardedLabLogin(pool, auth, email, password) {
  // Observe version before invoking Better Auth's password check. This version
  // must never be sampled after successful verification.
  const snapshot = await pool.query(`SELECT u.id, c.version FROM "user" u
    JOIN lab_credentials c ON c.principal_id=u.id WHERE u.email=$1 AND c.active`, [email]);
  if (snapshot.rowCount !== 1) return null; // timing/enumeration not addressed in this lab
  const { id, version } = snapshot.rows[0];
  const res = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  if (res.status !== 200) return null;
  const cookie = res.headers.getSetCookie().map((s) => s.split(';')[0]).join('; ');
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  if (!session || session.user.id !== id) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // This is the SAME user lock that reset uses; no cookie leaves the server
    // while reset and registration of this session are being ordered.
    await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [id]);
    const current = await client.query(`SELECT c.version FROM lab_credentials c
      JOIN "session" s ON s."userId"=c.principal_id
      WHERE c.principal_id=$1 AND c.active AND s.id=$2`, [id, session.session.id]);
    if (current.rowCount !== 1 || current.rows[0].version !== version) {
      await client.query('DELETE FROM "session" WHERE id=$1 AND "userId"=$2', [session.session.id, id]);
      await client.query('COMMIT');
      return null;
    }
    await client.query('INSERT INTO lab_session_versions (session_id,principal_id,credential_version) VALUES ($1,$2,$3)', [session.session.id,id,version]);
    await client.query('COMMIT');
    return cookie;
  } catch (error) {
    await client.query('ROLLBACK');
    // No cookie is returned on failure. A cleanup/reaper for orphan sessions
    // would be required in a real deployment; unregistered sessions fail guard.
    throw error;
  } finally { client.release(); }
}

export async function guardedLabSession(pool, auth, cookie, organizationId) {
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  if (!session) return null;
  const valid = await pool.query(`SELECT 1 FROM lab_session_versions v
    JOIN lab_credentials c ON c.principal_id=v.principal_id AND c.active AND c.version=v.credential_version
    JOIN "session" s ON s.id=v.session_id AND s."userId"=v.principal_id
    JOIN lab_membership m ON m.principal_id=v.principal_id AND m.organization_id=$3 AND m.active
    WHERE v.session_id=$1 AND v.principal_id=$2`, [session.session.id, session.user.id, organizationId]);
  return valid.rowCount === 1 ? session : null;
}
