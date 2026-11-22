/**
 * Development-only Cloudflare Worker entry point.
 * It intentionally exposes no employee, auth, database or business endpoints.
 * No client-supplied role or organization is trusted here.
 */
function json(body: object, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

export async function handleRequest(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname !== '/api/v1/health') {
    return json({ error: 'not_found' }, 404);
  }
  if (request.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
  }

  // Liveness only, not a readiness check. No connection to Neon is made.
  return json({ status: 'ok', ready: false, service: 'leave-api' }, 200);
}

export default {
  fetch(request: Request): Promise<Response> {
    return handleRequest(request);
  },
};
