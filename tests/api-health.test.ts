import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { handleRequest } from '../server/api/src/index.ts';

const url = 'https://example.test/api/v1/health';

test('liveness endpoint states explicitly that the service is not ready', async () => {
  const response = await handleRequest(new Request(url));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', ready: false, service: 'leave-api' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});
test('the health endpoint does not accept writes', async () => {
  const response = await handleRequest(new Request(url, { method: 'POST' }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
});
test('other routes expose no business or login endpoint', async () => {
  for (const path of ['/api/v1/employees', '/api/v1/login', '/api/v1/health/extra', '/']) {
    const response = await handleRequest(new Request(`https://example.test${path}`));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  }
});
test('client-provided roles and organization IDs do not affect health response', async () => {
  const response = await handleRequest(new Request(url, { headers: { 'X-Role': 'admin', 'X-Organization-Id': 'not-trusted' } }));
  assert.deepEqual(await response.json(), { status: 'ok', ready: false, service: 'leave-api' });
});
