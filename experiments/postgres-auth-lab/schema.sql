-- Disposable local PostgreSQL test database ONLY. Not a migration for Neon.
CREATE TABLE "user" (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL, image text, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL);
CREATE TABLE "session" (id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL, "ipAddress" text, "userAgent" text,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE);
CREATE TABLE "account" (id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, "accessToken" text, "refreshToken" text,
  "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, scope text,
  password text, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL);
CREATE UNIQUE INDEX credential_account_unique ON "account" ("userId", "providerId");
CREATE TABLE "verification" (id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL,
  "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL);
CREATE TABLE lab_credentials (principal_id text PRIMARY KEY REFERENCES "user"(id), active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 0));
CREATE TABLE lab_membership (organization_id text NOT NULL, employee_id text NOT NULL,
  principal_id text NOT NULL REFERENCES "user"(id), role text NOT NULL, active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (organization_id, principal_id), UNIQUE (organization_id, employee_id));
CREATE TABLE lab_reset_audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id text NOT NULL,
  actor_principal_id text NOT NULL, target_principal_id text NOT NULL, event text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE lab_session_versions (session_id text PRIMARY KEY REFERENCES "session"(id) ON DELETE CASCADE,
  principal_id text NOT NULL REFERENCES "user"(id), credential_version integer NOT NULL CHECK (credential_version >= 0));
