# Disposable PostgreSQL lab

Never deploy this lab or connect it to Neon. It uses privileged PostgreSQL and
a hard-coded sample schema; it does not implement RLS or secure login/session
issuance. The integration test refuses non-loopback database hosts and only
creates a random schema, which it drops afterwards. Run against a disposable
PostgreSQL instance you own:

    PG_LAB_URL=postgresql://lab:local-only@127.0.0.1:19432/leave_lab_test npm run test:postgres-lab

The test creates Better Auth fixtures with synthetic passwords, then tests a
transactional SQL adapter against real PostgreSQL and actual Better Auth tables.
The test also demonstrates that unmodified Better Auth login can issue an old
password's session after a reset. A lab-only guarded login and request guard
reject that race. They are not connected to the app and are not a complete safe
auth solution: no RLS, trusted actor binding, rate limits or real API.
