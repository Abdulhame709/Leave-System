// ISOLATED BENCHMARK, NOT A PRODUCTION AUTH ENDPOINT. Do not deploy until
// Cloudflare Access and usage controls protect the route. No Neon, no real data.
// Missing opt-in or key makes the probe inert. Never log or echo the key.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createExperimentalAuth, exampleUsername } from '../better-auth-poc/poc.mjs';

function authenticated(request, env) {
  const key = env?.CF_PROBE_KEY;
  const supplied = request.headers.get('x-probe-key') ?? '';
  if (env?.CF_PROBE_ENABLED !== 'true' || typeof key !== 'string' || key.length < 32 || key.length > 256 || supplied.length > 256) return false;
  const hash = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(key), hash(supplied));
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/probe' || !authenticated(request, env)) {
      return new Response(null, {status:404, headers:{'Cache-Control':'no-store'}});
    }
    try {
      const { auth } = await createExperimentalAuth();
      const password = randomBytes(24).toString('hex');
      const username = exampleUsername('orgtest', '100');
      const signUp = await auth.api.signUpEmail({body:{email:'local@example.invalid',name:'Synthetic',username,password},asResponse:true});
      const login = await auth.api.signInUsername({body:{username,password},asResponse:true});
      const ok = signUp.status === 200 && login.status === 200;
      return Response.json({ok, synthetic: true, production_ready: false}, {status:ok ? 200 : 500, headers:{'Cache-Control':'no-store'}});
    } catch {
      return Response.json({ok:false, synthetic:true, production_ready:false}, {status:500,headers:{'Cache-Control':'no-store'}});
    }
  },
};
