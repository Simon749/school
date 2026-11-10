# EduTrack Kenya — End-to-End Code Review Findings

Repo reviewed: `school-main` (uploaded zip, Oct 2026)
Compared against: `SYSTEM_DESIGN.md` v2.0, `PROGRESS_TRACKER.md` v1.0, `DEVIATIONS.md`, AI Engineering Constitution
Companion file: `REMEDIATION_PLAN.md` (maps every ID below to a phase and task)
Sits alongside: `GAP_ANALYSIS.md` (the earlier repo-vs-design audit that led to this rebuild)

---

## 0. How to read this report

**Severity**
- **P0** — data leak, money loss/misstatement, fake success, or core flow does not work. Blocks any pilot.
- **P1** — correctness, reliability, or auditability defect that will hurt in real use.
- **P2** — schema gaps, hygiene, and cleanup.

**Confidence**
- **C** — confirmed by reading the code (and schema where relevant).
- **V** — inference; must be proven with a test or checked against official docs *before* the fix is designed.

**Review limits (be honest about what this is)**
- Review method: reading code. The app was not run and no database was available.
- Prisma client could not be generated in the first review pass (engine download blocked). **Update (R0-02):** types were generated with a placeholder engine, so the real `tsc` result is now known (see BLD-03). The sandbox still cannot run Prisma queries, so DB-backed behaviour remains untested here.
- Nothing in this report is a claim that something is "tested" or "production-ready". The Constitution (§4) distinction applies: everything here is at most IMPLEMENTED, and much of it is not even that.

---

## 1. Top-line summary

The codebase is a large, well-intentioned build (about 25k lines, 9 migrations, 60+ API routes, 5 worker files) that **looks finished but does not work end to end**, and that exposes student and financial data in several places.

The most important structural facts:

1. **The queue pipeline discards work.** The worker entry point runs stub workers that only log; real workers are not imported and listen on mismatched queue names. Check-ins, registers and MPesa callbacks are accepted by the API and then thrown away (PIPE-01, PIPE-02).
2. **MPesa is neither reachable nor safe.** The active middleware blocks the webhook; the callback is forgeable; unconfirmed STK attempts are stored as real payments and counted as paid (PAY-01 to PAY-04).
3. **Authorization is hand-rolled per route with no shared guard**, and many routes have no role check, no school scope, or no guardian check (SEC-01 to SEC-12). Parents can read any student's full record including medical notes (SEC-02).
4. **The attendance anti-fraud model is defeated by design**: the QR token is fetchable by the very teacher it is meant to verify, expiry is never checked, and time-window logic likely never executes (ATT-01 to ATT-04).
5. **Whole features are broken or fake**: a Clerk-ID vs user-UUID mix-up breaks the entire results flow; parent fee and attendance pages show hardcoded fake data; IT-admin import/export are mocks that return success (FEAT-01 to FEAT-05).
6. **There are zero tests and CI cannot pass** (BLD-01, BLD-06).

---

## 2. Findings

### 2.1 BLD — Build, CI, configuration

| ID | Sev | Conf | Finding | Where |
|---|---|---|---|---|
| BLD-01 | P1 | C | `package-lock.json` is out of sync with `package.json` (missing `@valkey/valkey-glide`, `husky`, …). CI runs `npm ci`, so **CI cannot pass**. Repo also carries `pnpm-lock.yaml` and a junk `pnpm-workspace.yaml` ("set this to true or false"). Two lockfiles, no single package manager decision. | `package.json`, lockfiles, `.github/workflows/ci.yml` |
| BLD-02 | P0 | C | `tsconfig.json` **excludes `workers/`, `scripts/`, `prisma/`**, so the compiler never checks the code that moves money and writes attendance. `noImplicitAny: false` weakens `strict`. No `noUncheckedIndexedAccess`. ~133 uses of `any`/`as any`. | `tsconfig.json` |
| BLD-03 | P1 | C | **Resolved in R0-02 (2026-10-26).** With the Prisma client generated, `tsc` reports **0 errors** under the original config — the 9 errors seen in the first review were caused by the missing client. With `workers/`, `scripts/`, `prisma/` included and `noImplicitAny` on, the only errors are the 2 undefined-`error` references (PIPE-03). `noUncheckedIndexedAccess` adds 70 (deferred to R1-27). | repo-wide |
| BLD-04 | P0 | C | **Two middleware files.** Next 14 runs only `src/middleware.ts`; root `proxy.ts` is a Next 16 convention and is ignored. The active file does not whitelist `/api/webhooks/*` (see PAY-01), applies no role checks, and its matcher string uses `\.` inside a normal JS string (becomes `.`, matches any char). Security headers exist only in the active file; CSP allows `'unsafe-inline'` and `'unsafe-eval'` and omits Firebase/Sentry hosts. | `src/middleware.ts`, `proxy.ts` |
| BLD-05 | P2 | C | `next.config.mjs`: `serverExternalPackages` is a Next 15 key (ignored on 14); `eslint.ignoreDuringBuilds: true`; `serverActions.allowedOrigins` only `localhost:3000`; webpack alias hack for an unused package (`@valkey/valkey-glide`); both `ioredis` and valkey installed; `shadcn` CLI in runtime dependencies. | `next.config.mjs`, `package.json` |
| BLD-06 | P0 | C | **No tests of any kind** (no vitest/playwright config, no `*.test.*`). CI has no test step; `prettier --check .` will likely fail on current files. | repo-wide |
| BLD-07 | P1 | C | No `.env.example` (tracker 0.1 requires it). 28 env vars are referenced. `NEXT_PUBLIC_APP_URL` unset yields callback URL `undefined/api/webhooks/mpesa`. Silent localhost fallbacks (`REDIS_URL`), and S3 bucket/credential fallbacks (`edutrack-exports`, empty keys). | `src/lib/redis.ts`, `daraja.ts`, `export.worker.ts` |
| BLD-08 | P1 | C | Next.js 14.2.35 has known high-severity vulnerabilities (DEVIATIONS #2, flagged for pre-launch revisit). | `package.json` |
| BLD-09 | P2 | C | Generated `public/sw.js` and `workbox-*.js` committed. `public/mainfest.json` (typo) and nothing links a manifest, so PWA install may not work. | `public/`, `src/app/layout.tsx` |
| BLD-10 | P2 | C | Personal email local-part and dev Clerk user IDs committed in `prisma/seed.ts`, `scripts/*.ts`. README says "Phase 0 in progress, not runnable" while the tracker repo copy shows 12 `[x]` of ~430 items despite Phase 1–3 code existing; tracker and README are stale. | seed, scripts, README, tracker |

### 2.2 PIPE — Queues, workers, Redis

| ID | Sev | Conf | Finding | Where |
|---|---|---|---|---|
| PIPE-01 | P0 | C | `workers/index.ts` (what `npm run workers` runs) defines **its own stub workers** (`notification-queue`, `sms-queue`, `attendance-queue`, `mpesa-queue`) that only `console.log` and complete. The real `attendance.worker.ts`, `mpesa.worker.ts`, `notification.worker.ts`, `sms.worker.ts` are never imported (only `export.worker.ts` is). Every job on those queues is consumed and **silently discarded**. | `workers/index.ts` |
| PIPE-02 | P0 | C | Queue-name mismatches. Producers: `attendance-queue`, `mpesa-queue`. Real workers: `"attendance"`, `"mpesa"`. Student import enqueues to a new `"sms"` queue that nothing consumes. Two separate `exports` / `export-queue` definitions exist (the live export path is consistent: `exports`). | `src/lib/queue/index.ts`, workers, `import/students/route.ts` |
| PIPE-03 | P0 | C | Real attendance and mpesa workers' `failed` handlers reference an undefined variable `error` (`(error as Error).message`) — a `ReferenceError` on every failed job. Hidden because workers are not type-checked (BLD-02). Health route has the same `(err as Error)` pattern. | `attendance.worker.ts`, `mpesa.worker.ts` |
| PIPE-04 | P1 | C | Queues have no `defaultJobOptions` (no retries, backoff, `removeOnComplete/Fail`) — unbounded Redis growth, no dead-letter handling, no failure alerting. Only some call sites pass `attempts`. | `src/lib/queue/index.ts` |
| PIPE-05 | P0 | C | API returns `success: true` / "✓ Checked in at …" with HTTP 202 **before** anything is processed. Violates Constitution §25/§52 (never imply completion for a queued action). Combined with PIPE-01, the user is told it worked when nothing was saved. | `attendance/teacher`, `attendance/student` |
| PIPE-06 | P1 | C | Workers trust the enqueued payload: attendance worker does not re-check school, teacher, slot, calendar, or lock state at write time. Required by Constitution §23 for offline/late jobs. | `attendance.worker.ts` |
| PIPE-07 | P1 | C | Redis is a single point used for queues, rate limiting, receipt numbers, Daraja token. `new Redis()` at import with silent `localhost` fallback in production; no TLS config; no degraded mode. Rate limiter does `INCR` then `EXPIRE` non-atomically (crash between = key never expires = permanent block). | `src/lib/redis.ts`, `rate-limit.ts` |
| PIPE-08 | P1 | C | SMS worker: balance checked, SMS sent, then balance decremented in separate non-atomic steps (race → overspend/negative); no delivery state; skips SMS when `hasAppInstalled` (stale flag, see SEC-18). Notification worker has no school scope; stale FCM token cleanup is a TODO. | `sms.worker.ts`, `notification.worker.ts`, `firebase/admin.ts` |

### 2.3 PAY — Fees and MPesa

| ID | Sev | Conf | Finding | Where |
|---|---|---|---|---|
| PAY-01 | P0 | C | Active middleware blocks `/api/webhooks/mpesa` (`/api(.*)` protected; only `/api/health` and login routes public). Safaricom's server-to-server callback would be rejected. | `src/middleware.ts` |
| PAY-02 | P0 | C | **Callback is forgeable and unverified.** IP allowlist is computed but "still enqueue but flag" — never enforced. No secret in URL, no check that amount/phone match the pending payment, no Daraja confirmation query. The payer knows `CheckoutRequestID` (returned to the client) and can post a fake success with a chosen receipt code. | `webhooks/mpesa/route.ts`, `mpesa.worker.ts` |
| PAY-03 | P0 | C | `stk-push` creates a real `FeePayment` (full amount, `paidAt: now`, provisional receipt) **before confirmation** and nothing reverses it on failure or timeout (worker only appends "FAILED" to `notes`). Balances, defaulters and exports count it as paid → real defaulters disappear. | `stk-push/route.ts`, `balance`, `defaulters`, export worker |
| PAY-04 | P0 | C | Daraja is called **before** the DB row exists; if the insert then fails, money can move with no record. The callback is correlated to the payment by `notes contains <checkoutRequestId>` — no column, no index, no school scope. | `stk-push/route.ts`, `mpesa.worker.ts` |
| PAY-05 | P1 | V | Recovery job treats the STK *query* response as if it returned `CallbackMetadata` and a string `ResultCode === "0"`. I believe the query response carries only result code/description (no receipt number), so recovery could never record a payment. **Verify against Daraja docs before designing.** Same for the callback source IP ranges (`196.201.214/215.` is a partial list). | `mpesa.worker.ts`, `daraja.ts`, webhook |
| PAY-06 | P0 | C | **Float money math** (`Number(...)`, `+`, `-`) in allocation, balances, defaulters, export worker. Violates Constitution §33. | `allocation.ts`, balance/defaulters/parent fees routes, export worker |
| PAY-07 | P0 | C | **Five different balance calculations** (allocation, `fees/balance`, `parent/fees`, `fees/defaulters`, export worker) with different rules: `balance` has no term filter and sums all terms; `parent/fees` sums `take: 20` payments across all terms against current-term dues; export ignores carry-forward. Violates Constitution §32. R0-09: the admin and bursar dashboards add two more variants (≥ 7 in total; see PAY-15). | see Where |
| PAY-08 | P1 | C | Allocation reads outside the payment-write transaction (race); doc comment (“whole payment goes to that item”) contradicts the code (fills by priority); overpayment is auto-set to `carry_forward` (an invented business rule, Constitution §3). | `allocation.ts`, `fees/payments`, `mpesa.worker.ts` |
| PAY-09 | P1 | C | Receipt numbers: Redis `INCR` is the source of truth (Constitution §47); prefix = first 3 letters of school name, but `receipt_number` is **globally unique**, so two schools starting "St." collide; seeding race when key missing; provisional receipts burn sequence numbers (gaps); `MAX()` on string. | `receipt.ts`, schema Proven by `tests/findings/pay-09-receipt-collision.test.ts` (both schools get `ST.-000001`). |
| PAY-10 | P1 | C | Manual payment (`POST /fees/payments`): no schema validation (amount may be string/negative/NaN), `studentId` not verified to belong to the school (cross-tenant write), `paymentMethod` free text, no idempotency (double-click = two payments), `mpesaName` set to phone placeholder, **no reversal endpoint exists** despite `isReversed` columns. | `fees/payments/route.ts`, worker |
| PAY-11 | P0 | C | `stk-push`: any logged-in role may initiate for any student in the school; no guardian check; `phone` override is unvalidated, so it can be used to spam STK prompts to arbitrary numbers; rate limit keyed on spoofable `x-forwarded-for`; amount unvalidated/uncapped; the "5-minute pending" guard also blocks a legitimate second payment after a **successful** one. | `stk-push/route.ts` |
| PAY-12 | P0 | C | Disputes: `POST` open to any role, `studentId` unchecked, and a claimed code that exists locally **auto-resolves** the dispute as the raiser (also a code-existence oracle). `PATCH [id]` has no `schoolId` check (cross-tenant). Daraja lookup (the design's headline dispute feature) is imported but not implemented. No status-transition rules, no audit. | `fees/disputes/**` |
| PAY-13 | P1 | C | `fees/structure` POST passes raw `items` to Prisma `create` (mass assignment), no validation, `termId` not school-checked. `fees/assign` accepts arbitrary `studentIds` (cross-tenant), overwrites `amountDue` on re-assign with no audit. Carry-forward, instalments, proration, discount approval are in design but not implemented. | `fees/structure`, `fees/assign` |
| PAY-14 | P1 | C | Callback vs recovery vs retry race: "already processed" check is read-then-write (not atomic); duplicate-code `P2002` becomes a 5× retry loop; no transaction around payment update + audit + notification; payment-confirmation notification is a TODO in the worker. | `mpesa.worker.ts` |
| PAY-15 | P1 | C | Dashboard money bugs: the bursar dashboard uses `termId: currentTerm?.id || undefined`, so with no current term Prisma drops the filter and sums **all terms**; its per-student balance ignores discounts and carry-forward (differs from the admin dashboard). The admin dashboard counts unconfirmed STK rows as paid (PAY-03). Together with PAY-07 there are at least **7 divergent balance calculations**. | `bursar/dashboard`, `admin/dashboard` |

### 2.4 SEC — Authentication, authorization, tenant isolation

| ID | Sev | Conf | Finding | Where |
|---|---|---|---|---|
| SEC-01 | P0 | C | **No shared guard.** Every route/page hand-rolls `auth()` + user lookup. Two incompatible identity models: DB lookup by `clerkId` (most routes) vs `sessionClaims.metadata.role/schoolId` (import routes only). No `lib/auth/*` exists although the design lists `rbac.ts`. | all routes |
| SEC-02 | P0 | C | `GET /api/students/[id]`: any logged-in school user (incl. parents, teachers) gets the **full student row (`medicalNotes`, NEMIS, photo) and every active guardian's full user row (national ID, phone, email, clerkId)**. This is the GAP_ANALYSIS finding, still present. | `students/[id]/route.ts` |
| SEC-03 | P0 | C | Parent routes return whole student objects: `parent/children`, `attendance/parent/[studentId]` (`include`/no `select`) — leaks `medicalNotes` etc. Violates Constitution §14. | those routes |
| SEC-04 | P0 | C | `parent/attendance` and `parent/results`: no role check, no `isActive`, no restricted-access handling, **results route has no `published` filter** → parents see draft marks and teacher comments. Deactivated guardians still served. | `parent/attendance`, `parent/results` |
| SEC-05 | P0 | C | `fees/balance/[studentId]`: for non-parent roles only checks the user *has* a school; queries by `studentId` with **no school filter** → any teacher can read any student's fee balance in any school. | `fees/balance/**` |
| SEC-06 | P0 | C | Export access: `export/status/[jobId]` returns presigned S3 URLs to **any authenticated user** by guessable sequential job ID; `export/download` builds a filesystem path from a query parameter (**path traversal**) and is a legacy dead path; `export` POST accepts unvalidated `filters` and types the worker cannot process (`students`, `attendance-student`, …), blocks `teacher` though the teacher exports page exists; exports are not audited. | `export/**`, export worker |
| SEC-07 | P0 | C | `attendance/student` GET/POST: no role check, no check that the slot belongs to the caller, no date validation. Any logged-in user (a parent) can read a class register or submit one. | `attendance/student/route.ts` |
| SEC-08 | P0 | C | `messages` POST: **no role check** — a parent can send `school_wide`/`class` broadcasts incl. SMS (spends the school's balance). `recipientId` not school-checked (cross-tenant message injection). Teachers can message any parent, not only parents of their students. GET `limit` unbounded/NaN. | `messages/route.ts` |
| SEC-09 | P0 | C | `deputy/page.tsx`, `deputy/teacher-performance`, `deputy/uncovered-lessons`: **no auth, no role, no `schoolId` filter** — any logged-in user sees school-wide teacher attendance (and cross-school aggregates). `uncovered-lessons` contains an **inline server action** that `create`s a `teacherAttendance` ("covered") with no auth → masks real teacher absences. | `(dashboard)/deputy/**` |
| SEC-10 | P0 | C | `(dashboard)/layout.tsx` has no role gate; middleware enforces login only. Only `it_admin` has a layout guard. Cross-role page navigation depends on each page remembering to guard. | layout, middleware |
| SEC-11 | P0 | C | **Cross-tenant IDORs** (IDs accepted without checking they belong to the caller's school): `createUserAction(schoolId)` takes school from client; `updateUserAction(userId)` has no scope and can set any user's role; `fees/assign` (`studentIds`), `fees/structure` (`termId`), `fees/payments` (`studentId`), `disputes/[id]` PATCH, `timetable/slot` (`existingId`, `termId`, `secondPeriodId`), `attendance/unlock` (`slotId`), results upsert (`studentId` not checked against assessment stream/school), messages (`recipientId`), `import/validate` (streams and NEMIS queried across all schools = existence oracle). | listed |
| SEC-12 | P1 | C | `it_admin` can create or promote any user to `admin`/`bursar` with no audit, no second factor, no approval — design only grants it `users:manage`. Needs an explicit decision (see Plan §Decisions). | `it-admin-actions.ts` |
| SEC-13 | P1 | C | School settings: GET exposes exact geofence centre/radius to every user (helps spoofing); PUT has no validation (radius unbounded — a huge radius disables the geofence; lat/lng ranges unchecked) and **no audit** — an insider can widen the fence then check in remotely. | `school/settings/route.ts` |
| SEC-14 | P0 | C | `/api/test/queue` is a leftover smoke-test route reachable by any logged-in user. | `api/test/queue` |
| SEC-15 | P1 | C | `/api/health` is public and returns raw error strings, queue counts, latencies; checks only the export queue; returns HTTP 200 when Redis is down although queued writes cannot work. | `api/health` |
| SEC-16 | P0 | C | QR HMAC secret falls back to `"dev-only-change-me"` when env missing → forgeable tokens in any misconfigured deployment; token comparison is not timing-safe. | `lib/qr/token.ts` |
| SEC-17 | P1 | C | Rate limiting exists on only 2 routes (stk-push, import execute), keyed on spoofable `x-forwarded-for` in one. None on messages, exports, disputes, OTP/auth-adjacent, QR, check-in. Constitution §44. | repo-wide |
| SEC-18 | P1 | C | `device-token`: no cap on stored tokens; token not removed from previous user on re-registration (shared device → notifications to the wrong person); `hasAppInstalled` set true forever and then suppresses SMS fallback. | `users/device-token`, `sms.worker.ts` |
| SEC-19 | P1 | C | Error leakage: teacher POST returns `error.message` to client; health returns raw errors; several routes return Zod issues verbatim. Constitution §65. | various |
| SEC-20 | P2 | C | `users/search` and `teachers` list return national ID/phone/email broadly to admin; acceptable role-wise but not minimised; no audit of directory access. | those routes |
| SEC-21 | P0 | C | **Deactivated users keep full access.** No route or page checks the *caller's own* `isActive` / `deletedAt` (47 route files look up the caller; the only `isActive` checks in the codebase are on guardians or list filters). `teachers/[id]` DELETE sets `isActive:false` + `deletedAt`, and the IT-admin toggle sets `isActive`, but neither changes what that person can do while their Clerk session is valid. | all routes |
| SEC-22 | P0 | C | **`onboarding/step-1` lets any signed-in user overwrite any school.** `schoolId` is read from the request body and passed to `school.update` with no ownership or role check (name, KNEC code, phone, email, logo; it also resets `onboardingStep`). With no `schoolId` it lets any user create a school and `upsert`s their own user into it (`update: { schoolId }` re-homes an existing parent/teacher into the new school while keeping their role). Returns `error.message` on failure. | `api/onboarding/step-1` |
| SEC-23 | P1 | C | `onboarding/step-4`: no role check (any user of the school), not idempotent (re-running creates duplicate grades; only streams have a unique key), still callable after onboarding is complete, returns `error.message`. | `api/onboarding/step-4` |
| SEC-24 | P1 | C | Weak input validation: DOB is format-only (`2026-02-31` passes → Invalid Date); `marksObtained` has no upper bound vs the assessment's `maxMarks`, and `z.coerce.number()` turns `""` into `0` *(verify whether the UI ever sends `""`)*; `results` / `rubricScores` / `specialisation` arrays unbounded; terms accept end < start and overlaps; `weightPercent` unconstrained across a term; `photoUrl`/`logoUrl` accept any URL scheme (`z.string().url()` allows `javascript:`); `medicalNotes`, comments unbounded; message type `class` does not require `streamId`. | `lib/validations/*` |
| SEC-25 | P0 | C | `GET results/reports/[id]/pdf`: access checks run only when the caller is a **parent**. Any other role, **any user from another school, and any Clerk user with no DB row** can download any report card by ID, including unpublished ones. The parent branch ignores guardian `isActive` / `verified` / restrictions. Also: `Content-Disposition` filename built from names (non-ASCII or quotes → error), and a dead stub `function data()` that throws at the bottom of the file. | `results/reports/[id]/pdf/route.tsx` |
| SEC-26 | P0 | C | `POST results/reports/generate`: any class teacher (of **any** stream) can generate or overwrite a report for **any student and term by ID in any school** (student and term are loaded without `schoolId`; no check that the student is in the teacher's stream); class teachers can set `principalComment`, bypassing principal approval; no audit. | `results/reports/generate/route.ts` |
| SEC-27 | P2 | C | `GET /api/timetable` is open to every role in the school, including parents: the full teaching schedule of every teacher. Product decision (D14). | `api/timetable/route.ts` |
| SEC-28 | P1 | C | CSV export has no formula-injection protection: a value starting with `=`, `+`, `-`, `@`, tab or CR (e.g. a student named `=HYPERLINK(...)`) executes when the file is opened in Excel. | `lib/export/csv.ts` |
| SEC-29 | P2 | C | The attendance-alert SMS template sends the child's name **and the absence reason** (e.g. "sick") in clear over SMS. Privacy/product decision (Constitution §14; D14). | `lib/sms/templates.ts` |

### 2.5 ATT — Attendance integrity and notifications

| ID | Sev | Conf | Finding | Where |
|---|---|---|---|---|
| ATT-01 | P0 | C | `GET /api/timetable/qr/[slotId]` is open to **any authenticated school user**, including the teacher whose presence it is meant to prove. The token (and an arbitrary lat/lng) can be obtained and submitted from home. Both anti-fraud layers collapse into one API call. | `timetable/qr/[slotId]` |
| ATT-02 | P0 | C | Token `validFrom/validUntil` is **never checked** at check-in (only `usedAt: null`) → tokens valid until used; burn-before-enqueue (`usedAt` set, then job added; enqueue failure loses the token); find-then-update is not atomic (two concurrent submits can both pass). Token date is parsed but ignored. | `attendance/teacher/route.ts` |
| ATT-03 | P0 | C | Check-in does not verify `slot.teacherId === caller`, `isPublished`, weekday matches `dayOfWeek`, or the school calendar (`school_calendar_days`); exam-day/invigilator logic absent. Another teacher can check in for a colleague's slot. | same |
| ATT-04 | P0 | C | **Time maths broken (proven 2026-10-26 by `tests/findings/att-04-time-maths.test.ts`).** `slot.period.startTime` is a JS `Date` (Prisma `@db.Time`); it is interpolated into ``new Date(`${today}T${...}`)`` → `Invalid Date`; every `<`/`>` comparison with it is `false`, so "too early", "period ended", and lateness (`minutesLate` = 0) **silently never apply**. Same pattern in the admin attendance GET. Other code uses `toISOString().slice(11,16)` correctly → inconsistent. All dates are UTC-derived (`toISOString().split("T")`); school runs in Africa/Nairobi (UTC+3). | `attendance/teacher`, `timetable/qr`, `timetable/teacher/today`, admin dashboard |
| ATT-05 | P1 | C | Geofence trusts client-supplied coordinates; no accuracy/age field, no stale-location rejection, no device binding (design 2.5/5.1), geofence centre readable by all (SEC-13). | `attendance/teacher`, `lib/geofence` |
| ATT-06 | P1 | C | Admin attendance dashboard is admin-only (deputy excluded); computes "absent" on the fly from the (probably NaN) time maths and never persists absences; "needs alert" depends on the same maths. | `attendance/teacher` GET |
| ATT-07 | P1 | C | Gate arrival: any teacher can mark any student present with a client-supplied `arrivedAt` (invalid date → 500); no calendar check; no audit. Design says receptionist/admin. | `attendance/gate` |
| ATT-08 | P1 | C | Register unlock: no audit; no school check on `slotId` (creates a register row referencing another school's slot); never re-locks; admin override of a locked register in POST is unlogged. | `attendance/unlock`, `attendance/student` |
| ATT-09 | P0 | C | **Two uncoordinated absence-notification pipelines.** The API route enqueues `absence-alert` per absent student (15-min delay, unconditional, `findFirst` guardian with no `isActive`), bypassing the intelligence layer (correction check, calendar/exam suppression, batching, digest). The worker enqueues a second `absence-alert` in a different payload shape (`studentId/slotId`, no `userId`). No cancellation when the teacher corrects a mark; N+1 queries. Violates Constitution §27–29. | `attendance/student`, `attendance.worker.ts`, `notification.worker.ts` |
| ATT-10 | P1 | C | Register validation gaps: status/reason not enum-validated, duplicate entries, arbitrary/future/past dates, no calendar/exam-day awareness, lock race between POST and worker. Sanity check (>80% absent) exists. | `attendance/student` |
| ATT-11 | P1 | C | Offline queue: no operation IDs/idempotency keys; any 2xx (including a queued 202) deleted as "synced"; non-2xx retained forever with no user feedback; persists student IDs after logout / user change; no conflict strategy (Constitution §23–24, §51). | `lib/offline/attendance-queue.ts` |
| ATT-12 | P1 | C | Worker check-in `upsert` overwrites an earlier check-in; double-lesson linking (`second_period_id` → auto-cover) not implemented; `teacher_duties` unused; schema lacks `exam_slot_id` on attendance tables the design specifies. | worker, schema |

### 2.6 DATA — Privacy, guardians, lifecycle

| ID | Sev | Conf | Finding | Where |
|---|---|---|---|---|
| DATA-01 | P0 | C | **Guardian deactivation is not implemented**: no endpoint, no session invalidation (Constitution §12; design §7). Also nothing deactivates sessions on user `isActive=false`. | repo-wide |
| DATA-02 | P0 | C | Restricted-access semantics are wrong or missing: `results/parent/[studentId]` *blocks* restricted guardians from results/fees (design: allowed); attendance arrival/location is *not* hidden for restricted guardians anywhere. Constitution §13 requires field-level rules. | `results/parent`, parent attendance routes |
| DATA-03 | P1 | C | Guardian `verified` flag is written but **never read**. Admin link route auto-sets `verified: true`; import sets `false`; no approval workflow exists (tracker 1.4). | guardians route, import |
| DATA-04 | P0 | C | Identity creation is unsound: guardian/teacher users are created with fabricated `clerkId` (`guardian_${Date.now()}`, `teacher_${Date.now()}`) — they cannot log in via Clerk, can collide within the same millisecond, and no Clerk webhook/sync exists; guardian "existing user by phone" lookup matches **any role** and merges shared-phone parents into one account; CSV import creates a **new parent user per row** (siblings → duplicate parents). Parent login method (design: phone+OTP) is unimplemented. | guardians, teachers POST, import |
| DATA-05 | P1 | C | `medicalNotes` stored in plaintext (design: AES-256). `photoUrl`, school `logoUrl`, dispute `screenshotUrl` accepted as arbitrary strings; there is no upload/validation pipeline for photos/screenshots/portfolio files (Constitution §41). | student routes, disputes, schema |
| DATA-06 | P1 | C | Deletion: timetable slots hard-deleted (no audit); `AssessmentResult`/`RubricScore`/`FeeItem` use `onDelete: Cascade`; soft-deleted students keep active guardians and attendance; no retention, erasure, or anonymisation process (design 5.4). Also `teachers/[id]` DELETE **hard-deletes** the teacher row and then deactivates the user (fails on FKs for any teacher with history, or destroys it); `streams/[id]` DELETE hard-deletes after checking only the student count. | routes, schema |
| DATA-07 | P1 | C | Subscription suspension "read-only mode" (design §7/§23, Constitution §70) and consent capture at enrolment were not found in the files reviewed. | repo-wide |
| DATA-08 | P1 | C | PII in logs: `console.error` of raw DB/import errors (rows contain phone numbers and student names); audit `ipAddress` trusts `x-forwarded-for`. Constitution §46. `firebase/client.ts` also logs the FCM token to the browser console; `sms/africastalking.ts` logs the raw SDK error. | import, audit |

### 2.7 AUD — Audit and workflow state

| ID | Sev | Conf | Finding | Where |
|---|---|---|---|---|
| AUD-01 | P0 | C | Audit logging exists in only 3 places (manual payment, student register, bulk import). **Missing**: guardian changes, student create/update/delete, user create/role change, timetable edits/publish/unlock, geofence/settings, fee structure/assign, disputes, result entry/publish, exports, login/security events, MPesa payment recording (worker). Constitution §16. | repo-wide |
| AUD-02 | P1 | C | `logAudit` swallows all errors and runs outside the business transaction. Import passes the **Clerk ID** as `actorId` (FK to `users.id` UUID) → the audit row fails and the error is swallowed, so the import is **never audited**. `recordId` is `@db.Uuid` but callers may pass non-UUIDs (also swallowed). | `lib/audit.ts`, `import/students` |
| AUD-03 | P1 | C | No database-level immutability (trigger/revoke), no request/correlation ID, no `old_data` capture on updates, no logging of sensitive reads (exports, directory search). | schema, audit |
| AUD-04 | P0 | C | Assessment workflow skips states: `publish` jumps from any state to `published` (no `hod_review`, no `locked`), is repeatable, can re-publish, and **published assessments remain editable** (only `locked` blocks edits and nothing sets `locked`). Notifies all students' primary guardians whether or not a result exists. No audit. Constitution §35. | `assessments/**`, schema |

### 2.8 FEAT — Broken, fake, or stubbed functionality

| ID | Sev | Conf | Finding | Where |
|---|---|---|---|---|
| FEAT-01 | P0 | C | **Clerk ID used where the user UUID is required**: `Teacher.userId` (and `Guardian.userId`) reference `User.id`, but these call `findUnique/findFirst({ where: { userId } })` with the Clerk ID → always null/403: `assessments` GET/POST, `assessments/[id]/publish`, `assessments/[id]/results`, `results/parent/[studentId]`, `(dashboard)/parent/[studentId]/reports/page.tsx`, `(dashboard)/teacher/markbook/page.tsx` + `[assessmentId]/page.tsx`, `(dashboard)/teacher/reports/[studentId]/page.tsx`. **The whole results/markbook/report-card flow cannot work.** | listed |
| FEAT-02 | P0 | C | `(dashboard)/parent/fees/page.tsx` renders **hardcoded fake fee data** (child "Njeri Ochieng", fabricated M-Pesa code RKT84H29L1) behind a `setTimeout`. A parent would see someone else's invented balance. | page |
| FEAT-03 | P0 | C | `(dashboard)/parent/[studentId]/attendance/page.tsx` renders hardcoded fake attendance ("Amara"). `teacher/page.tsx` has a hardcoded fallback dataset; `admin/timetable/page.tsx` uses a "dummy termId". | pages |
| FEAT-04 | P0 | C | `importStudentsAction` and `exportDataAction` (IT-admin UI) are **mocks that return success** with `count: rows.length` / a fake URL. Violates Constitution §4/§39. IT-admin is also excluded from the real import routes (admin-only). | `it-admin-actions.ts` |
| FEAT-05 | P1 | C | Import "welcome SMS" is enqueued to a queue no worker reads (PIPE-02), so the welcome SMS is never sent; import has no preview-token binding (file is re-parsed on execute), no size/row limits, N+1 queries per row. | `import/students` |
| FEAT-06 | P1 | V | `public/firebase-messaging-sw.js` has placeholder config (`YOUR_API_KEY`…) and imports scripts from `https://www.googleapis.com/firebasejs/…` (the official host is `gstatic.com`); background push cannot work as written. | public SW |
| FEAT-07 | P1 | C | **Review gap closed in R0-09 (2026-10-26).** The files listed here were reviewed; results are findings SEC-21 – SEC-29, FEAT-08 – FEAT-12, PAY-15, REL-06/07, SCH-07 and the updates to PAY-07, DATA-06, DATA-08, SCH-04, REL-03. Residual unread areas are listed in §4. | — |
| FEAT-08 | P1 | C | Onboarding wizard is incomplete and unenforced: API routes exist only for steps 1 and 4 (pages for 1, 4, 6; the design has 6 steps incl. geofence, calendar, fees). `onboardingCompleted` / `onboardingStep` are never read outside the API, so "cannot reach the dashboard until onboarding is done" and "resume at the saved step" (design §6, Constitution §53) are not implemented. | `api/onboarding`, `(auth)/onboarding` |
| FEAT-09 | P0 | C | **Nothing ever sets `TermReport.publishedAt`.** There is no publish endpoint or action. The parent reports page and the PDF route both require it, so **parents can never receive a report card**. | repo-wide |
| FEAT-10 | P1 | C | Report-card content is not CBC: the PDF has only overall %, conduct, attendance and comments — no per-learning-area results and no EE/ME/AE/BE rubric. "Overall score" is total marks ÷ total max marks across published assessments: it ignores `weightPercent` and rubric scores, drops a genuine `0` mark (falsy check), uses float maths, and applies a traditional-percentage model that Constitution §36 says not to assume. Attendance counts are not calendar-aware; `position`/`out_of` unused. **2026-10-26 sample (unofficial, to verify):** a JSS Grade 7 report shows learning area → performance level → teacher comment, a general performance level, comments on competencies/behaviour/values, closing/next-term dates, signatures and a stamp area, with no marks, percentages or position; our PDF has none of the per-area content. Also lacks the learner's UPI number and assessment number. | `reports/generate`, `pdf/term-report-template.tsx` |
| FEAT-11 | P1 | C | UI calls API routes that do not exist or lack the method: `GET/POST /api/activities` (admin activities page), `GET /api/fees/mpesa/query` (dispute lookup), `GET /api/school/guardian-count` and `GET /api/streams/[id]/guardian-count` (broadcast SMS cost estimate), `GET /api/students/[id]/guardian` (teacher compose), `GET /api/streams` (route exports POST only; teacher markbook exports). Those screens cannot work. Detected by the new `pnpm contract` check (7 allow-listed). | admin/bursar/teacher pages, message components |
| FEAT-12 | P1 | C | APIs with no UI (verified by grep): `fees/mpesa/stk-push` (parent "Pay via MPesa" is not wired — parent fee pages are server components), `import/students` + `import/validate` (no admin import page; the IT-admin import is the mock), `attendance/gate`, `attendance/unlock`, `timetable/qr/[slotId]` (nothing displays the classroom QR), `fees/balance/[studentId]`. `parent/fees/[studentId]` and `results/parent/[studentId]` are unused by any UI (parent pages query the DB directly): candidates for **deletion** rather than repair. Conversely, `export/download` (the path-traversal route) **is** used by the IT-admin export page, so SEC-06's fix must repoint it. | see list |
| FEAT-13 | P1 | C | Broadcasts sent the same message **once per child**: `guardians.map(g => g.userId)` was never de-duplicated, so a parent with two children in scope received duplicate in-app messages and duplicate SMS, and the school was charged twice. Found while fixing SEC-08; **fixed in R1-07**. | `api/messages/route.ts` |
| FEAT-14 | P0 | C | **Creating an assessment could never succeed, even after the Clerk-ID fix.** The Create Assessment dialog has an *Instructions* field, but `assessments` has no `instructions` column (and none for `dueDate`), and the route spread the whole validated body into `prisma.assessment.create`, so Prisma would reject the unknown argument with a 500 on every submit. A second bug hidden behind FEAT-01. Also: `assessmentDate` was passed as a bare date string rather than a `Date`. **Fixed in R1-14 batch 1** with an additive migration (`20261028090000_assessment_instructions`) that adds a nullable `instructions` column; `due_date` is still missing (no UI uses it; SCH-03). | `api/assessments/route.ts`, `CreateAssessmentDialog.tsx`, `schema.prisma` |

### 2.9 SCH — Schema and migrations

| ID | Sev | Conf | Finding | Where |
|---|---|---|---|---|
| SCH-01 | P1 | C | DEVIATIONS #3 says `school_id` is on every table. It is **missing** on `StudentActivity`, `AssessmentResult`, `RubricScore` (via result), `PortfolioArtefact`, `Notification`, `Strand/SubStrand`, `FeeItem` (via structure). No RLS on any table; tenant safety is entirely hand-written `WHERE`. | `schema.prisma` |
| SCH-02 | P0 | C | Payment model cannot represent an unconfirmed attempt (no status, no `checkoutRequestId`/`merchantRequestId` columns, no `PaymentAttempt` table) — root cause of PAY-03/PAY-04. | schema |
| SCH-03 | P1 | C | Design fields not in schema: attendance `exam_slot_id`; assessment workflow (`submitted_for_review_at`, `reviewed_at`, `locked_at`, `source`, `due_date`, `instructions`); fee `prorated`, `carry_forward_from_term_id`, instalments, `discount_approved_by` relation; `fee_instalments`, `school_calendar` partial-closure type; subscription invoices. Needed by tracker phases 2–3. | schema vs design §4 |
| SCH-04 | P2 | C | `prisma/migrations/_partial_indexes.sql` is **empty (0 bytes)**, so none of the design's partial indexes exist (the 43 plain indexes do). Applied migrations `_mwas` and `_add` cannot be renamed; `_mwas` adds a `NOT NULL` column without a default (fails on a populated table); header comment in the schema is stale; `AuditLog.recordId` typed UUID; `Guardian.verifiedBy`/`deactivatedBy` have no relations. Drift between migrations and `schema.prisma` still needs `prisma migrate diff` (R0-10). | `prisma/` |
| SCH-05 | P2 | C | Global uniques on `nemis_number`, `email`, `national_id`, `tsc_number`, `receipt_number` while checks are school-scoped → cross-school collisions return 500 `P2002`, and leak existence. Fine for a one-school pilot only if recorded as a decision. | schema + routes |
| SCH-06 | P2 | C | `@db.Time` columns surface as JS `Date` (root of ATT-04); no repo-wide convention for school-local time. | schema |
| SCH-07 | P2 | C | All IDs are `TEXT` (Prisma `String @default(uuid())` without `@db.Uuid`), not the UUID type the design specifies; only `audit_logs.record_id` is typed UUID — a mixed convention. | `schema.prisma` |

### 2.10 REL — Reliability and operations

| ID | Sev | Conf | Finding | Where |
|---|---|---|---|---|
| REL-01 | P1 | C | No backup/restore procedure, no restore test, no DR notes, no runbook (Constitution §71–72). | repo-wide |
| REL-02 | P1 | C | Unbounded or N+1 queries: payments `take: 100` with no pagination; messages `limit` unbounded; absence notifications query per student; import is per-row sequential; school-wide broadcast creates thousands of rows in one transaction. | various |
| REL-03 | P1 | V | **Sentry is probably not running.** Next 14.2 ignores `src/instrumentation.ts` unless `experimental.instrumentationHook` is set (it is not), and there is no `withSentryConfig`, so neither the server/edge nor the `sentry.client.config.ts` init is injected; the only Sentry call is `captureException` in `global-error.tsx`. Workers have no Sentry; no PII scrubbing configured; replay sample rates are set but the replay integration is not added (good — keep it off for a school system). No structured logging or queue-depth alerting. *(Verify by throwing a test error with a DSN set.)* | `next.config.mjs`, `sentry.*.config.ts`, workers |
| REL-04 | P1 | C | No graceful degradation when Redis is down (rate limit, receipts, queues all throw). | `lib/*` |
| REL-05 | P2 | C | 12 `catch (error)` blocks in 7 **client** files never use the error (found by lint, R0): users get no error state and failures are invisible. Constitution §54/§77; tracker 5.5. Files: bursar `fees/disputes` + `fees/structure` pages, admin `settings/school`, `attendance/exports`, `students/[id]/guardians` pages, `MarksEntryTable`, `QrScanner`. | listed |
| REL-06 | P0 | C | `prisma/seed.ts` deletes **every table** (schools, users, payments, audit logs, …) with no environment guard or confirmation; `prisma db seed` against a production URL erases the school. **Fixed in R0-14** (`prisma/seed-guard.ts`: refuses in production, requires a typed confirmation equal to the database name). | `prisma/seed.ts` |
| REL-07 | P1 | V | The seed generated `2547` + 8 random digits (format-valid Safaricom numbers; its comment claimed "not an allocated number", which is unverified) plus a hard-coded `254712345678`. With live SMS workers these could message real people. **Fixed in R0-14**: unassignable `2540…` numbers that still pass the app's validation. | `prisma/seed.ts` |

---

## 3. What is already sound (so we don't redo it)

- Money columns use `Decimal(12,2)`; unique constraints exist for student/slot/payment keys (`mpesa_code`, `(student_id, slot_id, date)`, …).
- The MPesa webhook enqueues with `jobId = checkoutRequestId` (a good idempotency start).
- Most admin-only routes already scope by `schoolId` and verify stream/period/teacher references (e.g. `timetable/slot` conflict checks).
- Student delete is a soft delete; teacher create and per-row import use transactions.
- The *server-rendered* parent fees and results pages use the correct guardian lookup (`user: { clerkId }`) and filter `published` — the API routes should be brought up to this standard.
- `students/[id]` PUT validates with Zod and re-checks stream and NEMIS uniqueness.
- A health endpoint, rate-limit helper, audit helper, geofence (Haversine) and allocation/receipt libs exist — they need hardening, not invention.

---

## 4. Review coverage after R0-09

**Read in full or scanned for security-relevant logic:** all API routes, all server actions, `lib/*` (auth/audit/rate-limit/redis/queue/qr/geofence/fees/mpesa/sms/firebase/export/pdf/validations), all five workers, middleware, config, scripts, seed, four of the nine migrations in full (the rest scanned for destructive statements), Sentry config, route/page inventory (75 entries), UI→API contract (88 fetch calls) and client-side risk-pattern sweeps (no `localStorage`, `innerHTML`, `eval`, `document.cookie`).

**Not read line by line (residual risk):**
- Client components and pages beyond the pattern sweeps and the specific files cited (UI logic bugs would not have been caught).
- `lib/export/pdf-templates/fee-defaulters.tsx` and `lib/pdf/term-report-template.tsx` rendering details.
- SQL bodies of `init`, `full_schema`, `phase2_fees_mpesa_activities` and `phase3_results_comms_schema` migrations (drift vs `schema.prisma` still to be checked by `prisma migrate diff`).
- `timetable/slot` UI flows, `activities/enrol` beyond the sampled lines, and the dashboards' non-security presentation logic.

These are covered going forward by the negative-authorization suite (R1-26), E2E journeys (R7-01), and the contract/inventory tooling.

---

## 5. Counts

| Category | P0 | P1 | P2 | Total |
|---|---|---|---|---|
| BLD | 3 | 4 | 3 | 10 |
| PIPE | 4 | 4 | 0 | 8 |
| PAY | 8 | 7 | 0 | 15 |
| SEC | 17 | 9 | 3 | 29 |
| ATT | 5 | 7 | 0 | 12 |
| DATA | 3 | 5 | 0 | 8 |
| AUD | 2 | 2 | 0 | 4 |
| FEAT | 6 | 8 | 0 | 14 |
| SCH | 1 | 2 | 4 | 7 |
| REL | 1 | 5 | 1 | 7 |
| **Total** | **50** | **53** | **11** | **114** |

(Computed from the rows above; the per-row Sev column is authoritative.)

## 6. Revision log

- v1.0 — initial review.
- v1.1 (2026-10-26, during R0) — ATT-04 upgraded verify→confirmed (test); BLD-03 resolved with real compiler result; PAY-09 proven by test; REL-05 added (found by lint); `admin/dashboard` session-claims suspicion withdrawn (matched a comment, not code).
- v1.2 (2026-10-26, R0-09) — review of remaining files complete: 18 new findings (SEC-21–29, FEAT-08–12, PAY-15, REL-06, REL-07, SCH-07); REL-06/REL-07 fixed and tested in R0-14; FEAT-11 detected by the new `pnpm contract` CI check; BLD-03/FEAT-07 resolved; PAY-07, DATA-06, DATA-08, SCH-04, REL-03 expanded or corrected.
- v1.3 (2026-10-26) — FEAT-10 annotated with the sample report structure; SEC-02, SEC-09 fixed and tested; SEC-21 and SEC-01 partially addressed (central guard).
- v1.4 (2026-10-28) — SEC-25 and SEC-26 fixed and tested (R1-30). Note: no admin UI exists to set the principal's comment (part of FEAT-09).
- v1.5 (2026-10-28) — SEC-08 fixed and tested (R1-07); FEAT-13 (duplicate broadcast delivery and SMS cost) found and fixed in the same change. Total now 113 findings.
- v1.6 (2026-10-28) — R1a containment complete: SEC-03, SEC-04, SEC-07 fixed and tested; SEC-06 largely fixed (a fourth export route, `export/status/route.ts`, had been missed in the first review and is now covered); ATT-10 and DATA-02 partially addressed.
- v1.7 (2026-10-28) — R1-14 batch 1 (assessments + results pages): FEAT-01 fixed everywhere it appeared; FEAT-14 found (a second bug hidden behind FEAT-01) and fixed with the first schema migration; the dead `results/parent/[studentId]` route deleted. Total now 114 findings.
- v1.8 (2026-10-28) — R1 cross-school writes (batch 1): SEC-22, SEC-23, SEC-12 fixed and tested; FEAT-04 (fake import success) fixed; PAY-10/12/13 partly addressed; the code-existence oracle in dispute creation closed; D2/D7/D16/D20 recorded.
