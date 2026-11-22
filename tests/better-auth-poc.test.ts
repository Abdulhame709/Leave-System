// Synthetic credentials and identities are generated inside the test; no network,
// Neon project, deployed Worker, or real employee information is involved.
import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { createExperimentalAuth, exampleUsername } from '../experiments/better-auth-poc/poc.mjs';

test('experiment encodes two identifiers without collisions for the sample format', () => {
  assert.notEqual(exampleUsername('a', 'bc'), exampleUsername('ab', 'c'));
  assert.notEqual(exampleUsername('orga', '100'), exampleUsername('orgb', '100'));
  for (const pair of [['', '100'], ['orga', ''], ['ORG', '100'], ['a-b', '100'], ['a', 'x'.repeat(21)]]) {
    assert.throws(() => exampleUsername(pair[0], pair[1]));
  }
});

test('Better Auth test-memory login keeps identically numbered employees distinct across two organizations', async () => {
  const { auth, memory } = await createExperimentalAuth();
  const passwordA = randomBytes(24).toString('hex');
  const passwordB = randomBytes(24).toString('hex');
  const usernameA = exampleUsername('orga', '100');
  const usernameB = exampleUsername('orgb', '100');
  const signUp = (email: string, username: string, password: string) => auth.api.signUpEmail({
    body: { email, name: 'Synthetic test user', username, password },
    asResponse: true,
  });
  const signIn = (username: string, password: string) => auth.api.signInUsername({
    body: { username, password },
    asResponse: true,
  });

  const a = await signUp('a@example.invalid', usernameA, passwordA);
  const b = await signUp('b@example.invalid', usernameB, passwordB);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const userA = (await a.json()).user.id;
  const userB = (await b.json()).user.id;
  assert.notEqual(userA, userB);
  assert.equal(memory.account.length, 2);
  for (const account of memory.account) {
    assert.notEqual(account.password, passwordA);
    assert.notEqual(account.password, passwordB);
  }

  const loginA = await signIn(usernameA, passwordA);
  assert.equal(loginA.status, 200);
  assert.equal((await loginA.json()).user.id, userA);
  const loginB = await signIn(usernameB, passwordB);
  assert.equal(loginB.status, 200);
  assert.equal((await loginB.json()).user.id, userB);
  assert.equal((await signIn(usernameB, passwordA)).status, 401);
  assert.equal((await signIn(usernameA, randomBytes(24).toString('hex'))).status, 401);
  assert.equal((await signIn(exampleUsername('unknown', '100'), passwordA)).status, 401);

  const cookies = loginA.headers.getSetCookie().map((cookie: string) => cookie.split(';')[0]).join('; ');
  assert.ok(cookies.length > 0);
  const session = await auth.api.getSession({ headers: new Headers({ cookie: cookies }) });
  assert.equal(session?.user.id, userA);
  await auth.api.signOut({ headers: new Headers({ cookie: cookies }) });
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: cookies }) }), null);
});
