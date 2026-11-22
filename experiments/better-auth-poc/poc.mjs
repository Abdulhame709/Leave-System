// LOCAL TEST ONLY. No endpoints exported to the deployed Worker and no real data.
// Better Auth's in-memory adapter is intentionally volatile and not production storage.
import { randomBytes } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins/username';

/**
 * Experimental encoding solely for ASCII sample identifiers. Production rules,
 * Unicode normalization, changes to employee codes, and migration need review.
 * Length prefixes avoid ambiguous pairs (e.g. a+bc versus ab+c).
 */
export function exampleUsername(company, employee) {
  if (!/^[a-z0-9]{1,20}$/.test(company) || !/^[a-z0-9]{1,20}$/.test(employee)) {
    throw new Error('Example identifiers must contain lowercase ASCII letters or digits only');
  }
  return `t${company.length}x${company}e${employee.length}x${employee}`;
}

export async function createExperimentalAuth() {
  // Dynamic import avoids lazy-initialization issues in the Worker bundler.
  const { memoryAdapter } = await import('better-auth/adapters/memory');
  const memory = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    baseURL: 'https://auth.example.test',
    secret: randomBytes(32).toString('hex'),
    database: memoryAdapter(memory),
    // Signup is enabled exclusively so the test can create disposable fixtures.
    // A real deployment must not use this configuration or allow public signups.
    emailAndPassword: { enabled: true, disableSignUp: false },
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    plugins: [username({ minUsernameLength: 3, maxUsernameLength: 100, immutableUsername: true })],
  });
  return { auth, memory };
}
