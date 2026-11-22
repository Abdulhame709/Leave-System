import { strict as assert } from 'node:assert';
import { test } from 'node:test';
// @ts-expect-error Test-only JS benchmark without declarations.
import worker from '../experiments/cloudflare-cpu-lab/worker.mjs';
const req = (key?: string, method = 'POST', path = '/probe') => new Request(`https://lab.example.test${path}`, { method, headers: key ? {'x-probe-key':key} : {} });
const key = 'only-test-value-with-more-than-32-characters';

test('CPU lab stays inert without opt-in, correct key, method and route', async () => {
  for (const [request, env] of [
    [req(), {}], [req(key), { CF_PROBE_KEY:key }], [req(key), { CF_PROBE_ENABLED:'true' }],
    [req('wrong'), { CF_PROBE_ENABLED:'true', CF_PROBE_KEY:key }],
    [req(key,'GET'), { CF_PROBE_ENABLED:'true', CF_PROBE_KEY:key }],
    [req(key,'POST','/other'), { CF_PROBE_ENABLED:'true', CF_PROBE_KEY:key }],
    [req('short'), { CF_PROBE_ENABLED:'true', CF_PROBE_KEY:'short' }],
  ] as [Request, object][]) {
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), '');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('CPU lab authorized call uses synthetic memory data only', async () => {
  const response = await worker.fetch(req(key), { CF_PROBE_ENABLED:'true', CF_PROBE_KEY:key });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {ok:true, synthetic:true, production_ready:false});
});
