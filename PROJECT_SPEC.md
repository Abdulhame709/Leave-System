> المرجع التشغيلي المعدّل: اعتمد صاحب المشروع Neon بدلاً من Supabase. وافق أيضاً على Cloudflare Workers المجاني وNetlify بديلاً إذا تعذّر؛ اختيارات الدخول والملفات الأخرى لا تزال مقترحات وليست خدمات مفعّلة. الوثيقة العربية الأصلية محفوظة للرجوع إليها تاريخياً.

# ROLE
You are a senior full-stack engineer and product architect working for a product owner who is NOT a programmer. Build LeaveFlow (working name): an Arabic-first employee leave management system, delivered as one responsive web app that installs on Android as a PWA and is later packaged as an Android app. Work in small, verified phases and never skip tests.

# HOW TO WORK WITH ME (I am not a programmer)
- Explain every result in plain Arabic, short and concrete. Use a technical term only with a one-line explanation.
- Never ask me to edit code. When I must run something, give the exact copy-paste command and what I should see.
- Never ask me to paste passwords, private keys or tokens into the chat. If any service asks me for a payment card, stop and tell me instead of continuing.
- End every phase with: (1) a plain-language acceptance checklist I can click through on my phone, step by step, in Arabic; (2) the test results; (3) demo logins for two demo organizations; (4) known gaps.
- Keep PROJECT_SPEC.md (this brief), DECISIONS.md (each technical decision with a one-line reason) and CHANGELOG.md up to date. Commit each phase to Git with a tag so I can roll back.
- Prefer boring, popular tools. Do not add libraries or services I did not approve: propose with a reason and wait.
- My AI tool may have daily usage limits, so keep each step small and finish it fully, leaving the project in a working state.

# PRODUCT
An employee requests leave from the phone, the direct manager approves or rejects, approved leave is deducted from the balance and flows into a monthly leave summary used by HR and payroll. HR prints and exports reports for all departments. This is NOT a payroll or attendance system and never calculates salaries. The first customer is one organization (~100 employees, Yemen, Asia/Aden) that runs Onyx Pro HR, attendance and payroll. Employees clock in and out using fingerprint devices connected to Onyx; HR retrieves attendance data at the end of each day or the next day and transfers it to the system, where attendance and employee entitlements are calculated. This application does not replace that process or connect to the devices in V1.

Currently there is no employee self-service: employees submit a paper leave request to their manager, then give it to HR to enter in Onyx's leave tab. The new application is intended to replace that paper process with digital requests and approvals, while HR continues entering approved leave in Onyx manually until a verified integration exists. Approval in this application must not imply entry in Onyx; distinguish approval from any future HR-confirmed entry or export state. The owner approved manual HR entry confirmation for V1: show approved requests awaiting Onyx entry, let authorized HR confirm manual entry, record who confirmed and when, and audit changes. Confirmation is not verified integration and does not guarantee the entry is correct or unique. Onyx screen fields, import support and the precise approval requirements remain to be confirmed. Prepare configurable Excel/CSV output for manual entry; no direct ERP write. Later the application may serve many organizations, so it is multi-tenant-ready from day one.

# ROLES
Employee, Direct Manager, HR Officer, HR Manager (read-only reports), Organization Admin, Platform Admin (the product owner: creates and manages organizations, never sees medical attachments). Enforce permissions in the database and server: employees see only their own data, managers their direct reports, HR everyone inside its own organization.

# MULTI-TENANCY (build the foundation now)
- Tenant = organization. Every business table has organization_id (NOT NULL, indexed).
- Isolation is enforced in the database (PostgreSQL Row-Level Security) AND in the API layer, not only in app code. The organization comes from the signed-in user's JWT token, never from the request body.
- Login uses company code + employee code + password; the authentication implementation remains to be selected.
- Per-organization settings: leave types, policies, holidays, work schedules, approval chain, printed-form branding (logo, name), ERP connector configuration.
- A mandatory automated test suite proves that organization A can never read or write organization B's data through any table or screen.
- V1 launches with ONE organization. Do not build billing, subscriptions or public sign-up yet; keep a minimal Platform Admin screen to create organizations.

# V1 SCOPE (build only this)
1. Auth: company code + employee code + password, optional PIN or biometric app lock, password reset by HR or Admin.
2. Organization structure and employees: branch > department; employee_code unique per organization (= ERP employee number in Onyx), name_ar, name_en, manager_id, hire_date, work_schedule, status, external_code; Excel import.
3. Leave types and policies, all configurable and never hard-coded: code, names (ar/en), paid or unpaid, yearly entitlement, accrual, carry-over, max days per request, attachment required, gender restriction, whether weekends and holidays count, whether HR approval is needed, onyx_code.
4. Calendar: weekend per work schedule, official holidays (Gregorian with Hijri display), configurable organization timezone (default Asia/Aden).
5. Requests: type, from/to, half-day or hourly permission, reason, attachment; live working-day calculation and remaining-balance preview; cancel while pending; request cancellation after approval; status timeline.
6. Approvals: manager inbox; approve, reject or return with a comment; delegation while away; automatic reminder and escalation after N days; optional second step by HR; nobody approves their own request.
7. Balances: an immutable ledger of entries (+/-). The balance is always the sum of entries. HR adjustments require a reason.
8. Notifications: in-app inbox plus Web Push (VAPID) sent from the API worker; no Firebase account.
9. HR reports: monthly leave summary per employee (days by type, paid/unpaid), payroll-ready; by department; balances; pending requests; print-ready pages and Excel/CSV; printable leave form with a QR verification code with a secure verification design; an ERP entry sheet whose columns follow the order of the Onyx leave entry screen (columns configurable per organization).
10. Month close: HR closes a month and its data is locked; later corrections become adjustments in the open month.
11. Audit log for every state change.
12. HR Onyx follow-up: a separate manual entry status for approved requests, an awaiting-entry list and an authorized HR confirmation recording who and when. Approval, export and entry confirmation are distinct. The server must enforce permissions, atomic idempotency and audit history; this does not write to or verify Onyx.

# NON-GOALS (V1)
Payroll or attendance calculation, GPS attendance, billing and subscriptions, public sign-up, chat, iOS, Google Play publishing, any paid service.

# TECH (Neon and Cloudflare Workers Free approved; Netlify is the approved fallback)
- Zero budget: use Neon Free (PostgreSQL) instead of Supabase. React + TypeScript + Vite + Tailwind, Cloudflare Pages, and GitHub were already proposed in the original brief. Cloudflare Workers Free is approved as the first backend option and Netlify Free is the approved fallback if it cannot be used. Other services, frameworks and libraries below are proposals for owner approval, not established decisions.
- Backend: Cloudflare Workers API (approved, not deployed; validate its free limits). Select a mature authentication solution after validating company-code + employee-code login, password reset, session rotation, rate limiting, and free-tier feasibility. Do not build a custom authentication protocol or promise a particular password-hashing algorithm without review and performance tests.
- Neon is a PostgreSQL service: the browser never receives database credentials. Server-side API verifies identity and authorization. Migrations use SQL tracked in Git; database clients and libraries require approval.
- Tenant isolation: use a restricted non-owner database role without BYPASSRLS for requests; use FORCE RLS where appropriate. Validate the principal and membership server-side, and set tenant and user context transaction-locally before each query. Fail closed if context is absent; enforce cross-tenant relationships with composite constraints. Test pooling, role-specific access, negative cases and medical attachment access. A separate restricted administrative role handles migrations; never expose it to the browser.
- Separate dev and production Neon projects are proposed to avoid copying production data and to separate quotas; never use real production data for tests. Branches cloned from production include data and are not a substitute for isolated test data.
- Private medical attachment storage is unresolved. Consider Neon Object Storage or another provider only after checking availability, security, zero-cost/card requirements and owner approval. Do not assume Cloudflare R2 is card-free or capped at zero charges.
- Web Push, scheduled reminders, backup storage and hosting are design proposals and need a feasibility and privacy review. Database dumps and private attachments both need encrypted offsite backups, key management, retention and tested restores; Neon's six-hour recovery history is not a backup. No automatic keep-alive ping: allow scale-to-zero and monitor usage.
- A pure TypeScript leave engine can be shared for preview and server validation; authoritative decisions and atomic ledger writes happen server-side, in a transaction with concurrency protection.
- PWA first; an Android APK is a later phase subject to testing notification support. Do not assume TWA or Capacitor until tested.
- Secrets stay in server/CI secret stores, never in Git, browser code or chat. Enable 2FA and keep recovery codes offline.

# HARD RULES
- The server and database are the source of truth: validate balances, permissions and dates there only.
- Balances are a ledger; no mutable balance field. Use database transactions to prevent double spending.
- No hard-coded leave rules, strings or colors. Arabic RTL first with i18n from day one.
- Every write accepts an idempotency key so retries over bad networks never duplicate requests.
- Leave dates are date-only values; all other timestamps are stored in UTC.
- Soft delete only; audit every state change.
- Security: never trust the client, validate all input, RLS enabled and tested on every table, secrets only in secret stores, authenticated access to attachments, never log personal or medical data.
- Integration: an ErpConnector interface per organization, file export first (Excel/CSV, numbered idempotent batches). Never write directly into any ERP database.
- Keep the app light for low-end Android phones and weak networks.

# DATA MODEL (start here)
organizations, organization_settings, branches, departments, users, employees, work_schedules, holidays, leave_types, leave_entitlements, leave_ledger, leave_requests, approval_steps, delegations, attachments, notifications, push_subscriptions, audit_logs, month_closures, export_batches, erp_mappings.
Request status: draft > pending_manager > pending_hr (optional) > approved | rejected | returned | cancelled | cancellation_requested.

# BUILD METHOD
Work one phase at a time. At the start of a phase restate the goal and list what you will build; ask only blocking questions. At the end follow HOW TO WORK WITH ME, then stop and wait for my approval.
Phases: 0 propose safe account setup, project structure, data model and RLS approach, current free-tier limits and test plan (no features; ask which computer and phone are used). 1 auth, organizations, roles, employees and Excel import, tenant isolation tests. 2 leave engine and ledger with unit tests. 3 requests, approvals, delegation, notifications; I test installation and push on my phone through the free HTTPS address. 4 HR reports, printing, Excel, ERP entry sheet, adjustments, month close. 5 offline queue, security review, performance, automated encrypted backups with a tested restore, free-limit check. 6 Android APK built in the cloud. 7 ERP file connector.

# DEFINITION OF DONE
All tests pass (leave calculation, ledger, approval flow and tenant isolation are mandatory), a restore from backup has been tested successfully, no TODOs left, migrations and seed data for two demo organizations included, README and the Arabic guides explain setup and operations in plain language.

# FIRST TASK
Do Phase 0 only: propose the project structure, a Mermaid ER diagram, the RLS isolation approach in plain words, the current free-tier limits and the test plan, and give me the Arabic guide to create the free accounts safely. Then wait for my approval.
