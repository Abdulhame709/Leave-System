// IN-MEMORY LAB ONLY. Never import this file in the production Worker.
// The global Better Auth admin plugin is not tenant-scoped and must not be
// exposed directly as the application's HR admin API.
import { randomBytes } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins/username';
import { admin } from 'better-auth/plugins/admin';

export async function createProvisioningLab() {
  const { memoryAdapter } = await import('better-auth/adapters/memory');
  const memory = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    baseURL: 'https://auth.example.test',
    secret: randomBytes(32).toString('hex'),
    database: memoryAdapter(memory),
    emailAndPassword: { enabled: true, disableSignUp: true },
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    plugins: [username({ minUsernameLength: 3, maxUsernameLength: 100, immutableUsername: true }), admin()],
  });
  return { auth, memory };
}
