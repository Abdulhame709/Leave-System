import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { betterAuth } from 'better-auth';
import { hashPassword } from 'better-auth/crypto';
import { resetCredentialsAtomically, ResetDenied } from '../../packages/security/src/credential-reset.ts';
import { makeLabResetStore } from './pg-reset-lab.mjs';
import { guardedLabLogin, guardedLabSession } from './guarded-login-lab.mjs';

const url = process.env.PG_LAB_URL;
if (!url) throw new Error('PG_LAB_URL required; use a disposable local PostgreSQL database');
const parsed = new URL(url);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
    || parsed.pathname !== '/leave_lab_test' || parsed.search) {
  throw new Error('Lab requires a loopback-only, disposable leave_lab_test database without URL parameters');
}
const schema = `lab_${randomBytes(8).toString('hex')}`;
const owner = new pg.Pool({ connectionString: url });
const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });

// All passwords, addresses, actors, sessions and organizations are synthetic.
test('Better Auth + PostgreSQL transactional reset lab', async (t) => {
  let gate = null;
  await owner.query(`CREATE SCHEMA "${schema}"`);
  try {
    await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
    const auth = betterAuth({
      baseURL: 'https://lab.example.test', secret: randomBytes(32).toString('hex'), database: pool,
      emailAndPassword: {enabled: true}, telemetry: {enabled: false}, rateLimit: {enabled: false},
      session: {cookieCache: {enabled: false}},
      databaseHooks: {session: {create: {before: async (session) => {
        if (gate && session.userId === gate.userId) { gate.enter(); await gate.release; }
      }}}},
    });
    const oldPassword='OnlyForTests-old-password';
    const newPassword='OnlyForTests-new-password';
    async function signup(name) {
      const res = await auth.api.signUpEmail({body: {name, email: `${name}@example.invalid`, password: oldPassword}, asResponse: true});
      assert.equal(res.status, 200);
      return (await res.json()).user.id;
    }
    const hrId = await signup('hr');
    const hr2Id = await signup('hr2');
    const userId = await signup('user');
    const otherId = await signup('other');
    await pool.query(`INSERT INTO lab_credentials (principal_id) VALUES ($1),($2),($3),($4)`, [hrId,userId,otherId,hr2Id]);
    await pool.query(`INSERT INTO lab_membership (organization_id,employee_id,principal_id,role)
      VALUES ('a','hr',$1,'hr_officer'),('a','employee',$2,'employee'),('b','other-employee',$3,'employee'),('a','hr2',$4,'hr_officer')`, [hrId,userId,otherId,hr2Id]);
    const actor = {organizationId:'a', principalId:hrId};
    const store = makeLabResetStore(pool);
    const hash = await hashPassword(newPassword);
    async function snapshot() {
      return {
        account: (await pool.query(`SELECT "userId",password FROM "account" ORDER BY "userId"`)).rows,
        versions: (await pool.query('SELECT * FROM lab_credentials ORDER BY principal_id')).rows,
        sessions: (await pool.query('SELECT id, "userId", token FROM "session" ORDER BY id')).rows,
        audit: (await pool.query('SELECT organization_id,actor_principal_id,target_principal_id,event FROM lab_reset_audit ORDER BY id')).rows,
      };
    }
    await t.test('cross-tenant and shared account denied without writes', async () => {
      const before = await snapshot();
      await assert.rejects(resetCredentialsAtomically(store, actor, 'missing', hash), ResetDenied);
      await assert.rejects(resetCredentialsAtomically(store, actor, 'other-employee', hash), ResetDenied);
      await assert.rejects(resetCredentialsAtomically(store, {organizationId:'b',principalId:hrId}, 'employee', hash), ResetDenied);
      assert.deepEqual(await snapshot(), before);
      await pool.query(`INSERT INTO lab_membership (organization_id,employee_id,principal_id,role) VALUES ('b','shared',$1,'employee')`, [userId]);
      await assert.rejects(resetCredentialsAtomically(store, actor, 'employee', hash), ResetDenied);
      assert.deepEqual(await snapshot(), before);
      await pool.query(`DELETE FROM lab_membership WHERE organization_id='b' AND principal_id=$1`, [userId]);
    });
    await t.test('real SQL transaction rolls back each injected fault', async () => {
      for (const point of ['rotate','revoke','audit']) {
        const before = await snapshot();
        const failing = makeLabResetStore(pool, async (step) => { if (step === point) throw new Error('injected'); });
        await assert.rejects(resetCredentialsAtomically(failing, actor, 'employee', hash), /injected/);
        assert.deepEqual(await snapshot(), before);
      }
    });
    await t.test('reset deletes actual Better Auth sessions and changes actual credential', async () => {
      const login = await auth.api.signInEmail({body:{email:'user@example.invalid',password:oldPassword}, asResponse:true});
      assert.equal(login.status,200);
      const cookie = login.headers.getSetCookie().map((s)=>s.split(';')[0]).join('; ');
      assert.ok(await auth.api.getSession({headers:new Headers({cookie})}));
      await resetCredentialsAtomically(store, actor, 'employee', hash);
      assert.equal(await auth.api.getSession({headers:new Headers({cookie})}), null);
      assert.equal((await auth.api.signInEmail({body:{email:'user@example.invalid',password:oldPassword},asResponse:true})).status, 401);
      assert.equal((await auth.api.signInEmail({body:{email:'user@example.invalid',password:newPassword},asResponse:true})).status, 200);
      const result=await pool.query('SELECT version FROM lab_credentials WHERE principal_id=$1',[userId]);
      assert.equal(result.rows[0].version,2);
      assert.equal((await pool.query('SELECT 1 FROM lab_reset_audit')).rowCount,1);
      assert.ok((await pool.query('SELECT 1 FROM "session" WHERE "userId"=$1',[otherId])).rowCount > 0);
    });
    await t.test('concurrent resets serialize on real PostgreSQL', async () => {
      const before = (await pool.query('SELECT version FROM lab_credentials WHERE principal_id=$1',[userId])).rows[0].version;
      await Promise.all([
        resetCredentialsAtomically(store, actor, 'employee', hash),
        resetCredentialsAtomically(store, {organizationId:'a',principalId:hr2Id}, 'employee', hash),
      ]);
      assert.equal((await pool.query('SELECT version FROM lab_credentials WHERE principal_id=$1',[userId])).rows[0].version,before+2);
      assert.equal((await pool.query('SELECT 1 FROM lab_reset_audit')).rowCount,3);
    });
    await t.test('target lock blocks a concurrent cooperating membership change', async () => {
      let entered, release;
      const ready = new Promise(resolve => entered=resolve);
      const wait = new Promise(resolve => release=resolve);
      const pausing = makeLabResetStore(pool, async (step) => { if (step === 'rotate') { entered(); await wait; } });
      const reset = resetCredentialsAtomically(pausing, actor, 'employee', hash);
      try {
        await ready;
        const other = await pool.connect();
        try {
          await other.query('BEGIN');
          await assert.rejects(other.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE NOWAIT', [userId]), (err) => err.code === '55P03');
          await other.query('ROLLBACK');
        } finally { other.release(); }
      } finally { release(); }
      await reset;
    });
    await t.test('guarded lab session denies wrong organization, wrong password, and old session after reset', async () => {
      const cookie = await guardedLabLogin(pool, auth, 'user@example.invalid', newPassword);
      assert.ok(cookie);
      assert.ok(await guardedLabSession(pool, auth, cookie, 'a'));
      assert.equal(await guardedLabSession(pool, auth, cookie, 'b'), null);
      // A live but stale DB session must fail even if not deleted.
      await pool.query('UPDATE lab_credentials SET version=version+1 WHERE principal_id=$1', [userId]);
      assert.ok(await auth.api.getSession({headers:new Headers({cookie})}));
      assert.equal(await guardedLabSession(pool, auth, cookie, 'a'), null);
      const currentCookie = await guardedLabLogin(pool, auth, 'user@example.invalid', newPassword);
      assert.ok(currentCookie);
      assert.equal(await guardedLabLogin(pool, auth, 'user@example.invalid', oldPassword), null);
      await resetCredentialsAtomically(store, actor, 'employee', hash);
      assert.equal(await guardedLabSession(pool, auth, currentCookie, 'a'), null);
    });
    await t.test('guarded lab login rejects old-password session issued after reset', async () => {
      let entered, release;
      const ready = new Promise(resolve => entered=resolve);
      const wait = new Promise(resolve => release=resolve);
      gate = {userId, enter:entered, release:wait};
      const signingIn = guardedLabLogin(pool, auth, 'user@example.invalid', newPassword);
      try {
        await Promise.race([ready, new Promise((_,reject)=>{ const timer=setTimeout(()=>reject(new Error('login did not reach hook')),10000); timer.unref(); })]);
        await resetCredentialsAtomically(store, actor, 'employee', await hashPassword('OnlyForTests-race-password'));
      } finally { gate=null; release(); }
      assert.equal(await signingIn, null);
      assert.equal((await pool.query('SELECT 1 FROM "session" WHERE "userId"=$1',[userId])).rowCount, 0);
      assert.ok(await guardedLabLogin(pool, auth, 'user@example.invalid', 'OnlyForTests-race-password'));
    });
    await t.test('unmodified Better Auth login race demonstrates an unresolved stale-session vulnerability', async () => {
      let entered, release;
      const ready = new Promise(resolve => entered=resolve);
      const wait = new Promise(resolve => release=resolve);
      gate = {userId, enter:entered, release:wait};
      const signingIn = auth.api.signInEmail({body:{email:'user@example.invalid',password:'OnlyForTests-race-password'},asResponse:true});
      try {
        await Promise.race([ready, new Promise((_,reject)=>{ const timer=setTimeout(()=>reject(new Error('login did not reach hook')),10000); timer.unref(); })]);
        await resetCredentialsAtomically(store, actor, 'employee', await hashPassword('OnlyForTests-another-password'));
      } finally { gate=null; release(); }
      const res=await signingIn;
      assert.equal(res.status, 200);
      const cookie=res.headers.getSetCookie().map((s)=>s.split(';')[0]).join('; ');
      assert.ok(await auth.api.getSession({headers:new Headers({cookie})}), 'A stale login succeeded after reset; do not deploy');
      assert.equal(await guardedLabSession(pool, auth, cookie, 'a'), null, 'unregistered native session must fail guard');
    });
  } finally {
    gate=null;
    await pool.end();
    await owner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await owner.end();
  }
});
