// LOCAL-ONLY compatibility probe. Never attach to the deployed application.
// It creates random in-memory fixtures on each request, never connects to Neon,
// and exposes no login endpoint. Success does NOT test Cloudflare Free CPU limits.
import { randomBytes } from 'node:crypto';
import { createExperimentalAuth, exampleUsername } from './poc.mjs';

export default {
  async fetch(request) {
    if (request.method !== 'GET' || new URL(request.url).pathname !== '/probe') {
      return new Response(null, { status: 404 });
    }
    const { auth } = await createExperimentalAuth();
    const password = randomBytes(24).toString('hex');
    const user = exampleUsername('orgtest', '100');
    try {
      const signUp = await auth.api.signUpEmail({
        body: { email: 'local@example.invalid', name: 'Local test', username: user, password },
        asResponse: true,
      });
      const login = await auth.api.signInUsername({ body: { username: user, password }, asResponse: true });
      const ok = signUp.status === 200 && login.status === 200;
      return Response.json({ local_probe_passed: ok, production_ready: false }, { status: ok ? 200 : 500, headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return Response.json({ local_probe_passed: false, production_ready: false }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }
  },
};
