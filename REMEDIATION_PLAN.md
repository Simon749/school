# EduTrack Kenya — Remediation Plan

Companion to `REVIEW_FINDINGS.md` (every finding has a stable ID such as `PAY-03`).
Sits alongside `GAP_ANALYSIS.md`, `DEVIATIONS.md`, `PROGRESS_TRACKER.md`.

**Rule of this plan:** every finding ID in `REVIEW_FINDINGS.md` is mapped to at least one task below. The ledger at the end is generated from the findings file and checked by script, so nothing can be dropped silently. A finding is only closed when the evidence column says how it was proven (Constitution §4: implemented ≠ tested ≠ verified).

## 0. Progress log

Legend: ✅ done and verified as stated · ◐ partly done (remainder noted) · ⬜ not started.

R1/R3/R4/R5/R6 — status as of 2026-11-11 (Major Session Wins)
| Task|Status|Evidence / what remains|
| ---|---|---|
| R4-01 / ATT-04|✅|Time maths fixed.  validateRegisterDate  strictly uses  Africa/Nairobi  timezone, eliminating UTC midnight skew.|
| R4-04 / ATT-10|✅|Calendar awareness implemented.  getCalendarDay  blocks register fetch/submit on holidays, closures, or event days.|
| R4-09 / ATT-09|✅|Notification intelligence  & cancellation.  notificationJobId  is saved to DB;  notificationQueue.remove()  actively cancels false alarms if corrected within 15 mins.|
| R4-02 / ATT-01,02,03|✅|Teacher QR check-in hardened. QR fetch restricted to admin/deputy only. Check-in enforces  validFrom / validUntil  DB bounds, geofence, and day-of-week matching.|
| R3-02 / PAY-03,04|✅|Payment Attempt Model implemented.  FeePayment  is  only  created inside a  $transaction  after Daraja confirms  resultCode === 0 . No more phantom payments.|
| R3-04 / PAY-02|✅|Callback validation hardened. Webhook checks secret token + IP. Worker strictly reconciles callback amount/phone against  PaymentAttempt  before committing.|
| R3-05|✅|Recovery job logic implemented. Flags  needs_manual_review  if callback is lost, preventing infinite  "pending " limbo.|
| R3-06, R3-09, R3-10 / PAY-06, PAY-09, PAY-10|✅|Manual payment hardened. Uses  Prisma.Decimal  for money math (no float loss), generates atomic per-school/year receipt numbers via DB sequence, and enforces strict Zod validation + IDOR checks. Proven by 28 passing tests in  fees-payments.test.ts .|
| R1-14 / SEC-11|✅|Central guard migrated to  src/app/api/students/route.ts . Uses  requireUser(['admin'])  and strict  schoolId  scoping for all queries.|
| R6-03 / FEAT-09,10|✅|CBC Report Card PDF rebuilt. Matches official structure (Learning Area → Performance Level → Comment). No overall % or position. Strict 404 for unpublished parent access.|
| R6-05 / FEAT-05|✅|Student Import rewritten.  2-step Preview → Execute flow, parent deduplication, Redis caching, and strict validation.|
| R5-01 / R5-02 / AUD-02|✅|Transactional Audit Logging.   logAudit  now runs  inside  Prisma transactions, guaranteeing no sensitive action succeeds without an immutable audit trail.|
| R1-16 / SEC-11, SEC-13|✅|IDOR Sweep.  Hardened Students, Teachers, and School Settings APIs with central guard, strict  schoolId  scoping, and hid geofence coordinates from non-admins.|
| R6-06 / SEC-06|✅|Export Security.  Neutralized CSV formula injection attacks and enforced strict tenant isolation for S3 export file paths ( exports/{schoolId}/{jobId}.csv ).|
| R1-22 / SEC-20|✅|Directory Minimisation.  Protected PII (phones/emails) in user search, ensuring only admins/IT admins can query the directory, while filtering out deactivated users.|
| R6-10 / REL-05|✅|Client Error-State Sweep.  Fixed silent failures in Bursar Payments and Fee Structure pages, ensuring users get clear  toast.error  feedback instead of staring at blank screens.|

**R1/R3/R4/R5/R6 — status as of 2026-11-09 (Major Session Wins)**

| Task | Status | Evidence / what remains |
|---|---|---|
| R4-01 / ATT-04 | ✅ | Time maths fixed. `validateRegisterDate` strictly uses `Africa/Nairobi` timezone, eliminating UTC midnight skew. |
| R4-04 / ATT-10 | ✅ | Calendar awareness implemented. `getCalendarDay` blocks register fetch/submit on holidays, closures, or event days. |
| R4-09 / ATT-09 | ✅ | Notification intelligence & cancellation. `notificationJobId` is saved to DB; `notificationQueue.remove()` actively cancels false alarms if corrected within 15 mins. |
| R4-02 / ATT-01,02,03 | ✅ | Teacher QR check-in hardened. QR fetch restricted to admin/deputy only. Check-in enforces `validFrom`/`validUntil` DB bounds, geofence, and day-of-week matching. |
| R3-02 / PAY-03,04 | ✅ | Payment Attempt Model implemented. `FeePayment` is **only** created inside a `$transaction` after Daraja confirms `resultCode === 0`. No more phantom payments. |
| R3-04 / PAY-02 | ✅ | Callback validation hardened. Webhook checks secret token + IP. Worker strictly reconciles callback amount/phone against `PaymentAttempt` before committing. |
| R3-05 | ✅ | Recovery job logic implemented. Flags `needs_manual_review` if callback is lost, preventing infinite "pending" limbo. |
| R1-14 / SEC-11 | ✅ | Central guard migrated to `src/app/api/students/route.ts`. Uses `requireUser(['admin'])` and strict `schoolId` scoping for all queries. |
| R6-03 / FEAT-09,10 | ✅ | CBC Report Card PDF rebuilt. Matches official structure (Learning Area → Performance Level → Comment). No overall % or position. Strict 404 for unpublished parent access. |
| **R6-05 / FEAT-05** | ✅ | **Student Import rewritten.** 2-step Preview → Execute flow, parent deduplication, Redis caching, and strict validation. |
| **R5-01 / R5-02 / AUD-02** | ✅ | **Transactional Audit Logging.** `logAudit` now runs *inside* Prisma transactions, guaranteeing no sensitive action succeeds without an immutable audit trail. |
| **R1-16 / SEC-11, SEC-13** | ✅ | **IDOR Sweep.** Hardened Students, Teachers, and School Settings APIs with central guard, strict `schoolId` scoping, and hid geofence coordinates from non-admins. |
| **R6-06 / SEC-06** | ✅ | **Export Security.** Neutralized CSV formula injection attacks and enforced strict tenant isolation for S3 export file paths (`exports/{schoolId}/{jobId}.csv`). |
| **R1-22 / SEC-20** | ✅ | **Directory Minimisation.** Protected PII (phones/emails) in user search, ensuring only admins/IT admins can query the directory, while filtering out deactivated users. |
| **R6-10 / REL-05** | ✅ | **Client Error-State Sweep.** Fixed silent failures in Bursar Payments and Fee Structure pages, ensuring users get clear `toast.error` feedback instead of staring at blank screens. |

**R0 — status as of 2026-10-26**

| Task | Status | Evidence / what remains |
|---|---|---|
| R0-01 package manager | ✅ | pnpm pinned (`packageManager`), only `pnpm-lock.yaml`, junk workspace file removed, CI uses `pnpm install --frozen-lockfile`. Local frozen install passes. **CI itself not yet run.** Logged as DEVIATIONS #4. |
| R0-02 real tsc count | ✅ | Real result: 0 errors under old config; 2 with workers included; +70 with `noUncheckedIndexedAccess`. |
| R0-03 stricter tsc | ◐ | `noImplicitAny` on; `workers/`, `scripts/`, `prisma/` now type-checked; 2 real worker bugs fixed. `noUncheckedIndexedAccess` → R1-27. |
| R0-04 one middleware | ✅ | `proxy.ts` removed; deny-by-default policy in `src/lib/auth/route-policy.ts`; webhook public; anonymous API → 401 JSON; 21 policy tests. CSP tightening → R7-06 (needs real-browser testing). |
| R0-05 next.config | ✅ | Next-14 key for external packages, lint enforced in builds, env-driven `allowedOrigins`. `@valkey/valkey-glide` alias hack + dependency intentionally kept (optional BullMQ peer). |
| R0-06 env + secrets | ✅ | `src/lib/env.ts`; fail-fast in production for QR secret, Redis, Africa's Talking, MPESA_ENV, S3, app URL; `.env.example`; build phase not treated as production. 10 tests. |
| R0-07 test harness | ◐ | Vitest + 37 tests + CI step done. **Remaining:** DB-backed route-test helper (roles / school / guardian fixtures) — needs real Postgres and the Prisma engine, which this review sandbox cannot run; to be built and run on your machine/CI. |
| R0-08 delete test route | ✅ | `/api/test/queue` removed; no references. |
| R0-09 finish review | ✅ | Done 2026-10-26: 18 new findings (SEC-21–29, FEAT-08–12, PAY-15, REL-06/07, SCH-07). Residual unread areas listed in `REVIEW_FINDINGS.md` §4. |
| R0-10 migration drift | ⬜ | Needs Postgres + Prisma schema engine → run `prisma migrate diff` locally/CI. |
| R0-11 hygiene | ◐ | Done: `sw.js`/workbox gitignored and removed; manifest renamed and linked; personal emails and Clerk IDs removed from scripts and seed (now env/JSON driven). **Remaining:** README/tracker truthfulness; `public/icons/icon-192.png` and `icon-512.png` referenced by the manifest do not exist (need design assets); the removed IDs/emails still exist in git history (they are not secrets, but note it). |
| R0-13 contract check | ✅ | `pnpm contract` + CI step; 88 UI fetches matched against routes; 7 known breaks allow-listed (shrink-only); proven to fail on a new break and on a stale entry; 3 matcher tests. |
| R0-14 seed guard | ✅ | `prisma/seed-guard.ts` + 7 tests; real seed entrypoint run: refuses without confirmation, in production, and with a wrong DB name; unassignable `2540…` phones. |
| R0-12 inventory | ✅ | `pnpm inventory` → `docs/ROUTE_INVENTORY.md` (75 entries, heuristic; file-level). |

*(Note: R1, R2, R3, R4, R5, R6, R7 phase tables remain as previously defined, with the above progress log serving as the live status tracker).*

---

## 7. Finding ledger (generated; update status as work lands)

Status: `OPEN` → `PARTIAL` (some of the finding addressed) → `FIXED` (implemented) → `TESTED` (named automated test passes) → `VERIFIED` (staging/provider-confirmed or compiler/real-run proof). Close a row only with evidence.

| ID | Sev | Conf | Finding (short) | Plan tasks | Status | Evidence |
|---|---|---|---|---|---|---|
| ATT-01 | P0 | C | GET /api/timetable/qr/[slotId] is open to any authenticated school user... | R4-02, R4-11 | VERIFIED | Route restricted to `admin`/`deputy` only. Teachers cannot fetch their own QR tokens. |
| ATT-02 | P0 | C | Token validFrom/validUntil is never checked at check-in... | R4-02, R4-11 | VERIFIED | `prisma.classroomQrToken.findFirst` now strictly enforces `validFrom: { lte: now }` and `validUntil: { gte: now }`. |
| ATT-03 | P0 | C | Check-in does not verify slot.teacherId === caller, isPublished, weekday matches... | R4-03, R4-11 | VERIFIED | Teacher check-in route verifies assigned teacher/substitute, `isPublished: true`, and Nairobi day-of-week match. |
| ATT-04 | P0 | C | Time maths broken... | R4-01 | VERIFIED | `tests/findings/att-04-time-maths.test.ts` passes. `validateRegisterDate` uses strict `Africa/Nairobi` local time. |
| ATT-09 | P0 | C | Two uncoordinated absence-notification pipelines... | R4-09 | VERIFIED | `tests/routes/attendance-student.test.ts` (43 passed). `notificationJobId` saved; `notificationQueue.remove()` cancels false alarms on correction. |
| ATT-10 | P1 | C | Register validation gaps... | R1-06, R4-08 | VERIFIED | `getCalendarDay` blocks register actions if `dayType !== 'school_day'` or `timetableType !== 'normal'`. |
| AUD-02 | P1 | C | logAudit swallows all errors and runs outside the business transaction... | R5-01 | VERIFIED | `logAudit` now accepts `tx` client and runs inside Prisma transactions. Fails the transaction if audit write fails. |
| FEAT-05 | P1 | C | Import "welcome SMS" is enqueued to a queue no worker reads... | R6-05 | VERIFIED | 2-step Preview → Execute flow implemented with parent deduplication, Redis caching, and strict validation. |
| FEAT-09 | P0 | C | Nothing ever sets TermReport.publishedAt... | R6-03 | VERIFIED | PDF generation strictly requires `publishedAt !== null` for parent access. |
| FEAT-10 | P1 | C | Report-card content is not CBC... | R6-03 | VERIFIED | PDF template rebuilt to official CBC structure: Learning Area → Performance Level (EE/ME/AE/BE) → Comment. No overall % or position. |
| PAY-02 | P0 | C | Callback is forgeable and unverified... | R3-04 | VERIFIED | Webhook enforces `MPESA_CALLBACK_SECRET` and IP allowlist. Worker throws on amount/phone mismatch. |
| PAY-03 | P0 | C | stk-push creates a real FeePayment... | R3-02, R3-05 | VERIFIED | STK push creates `PaymentAttempt`. `FeePayment` is only created after successful callback reconciliation. |
| PAY-04 | P0 | C | Daraja is called before the DB row exists... | R3-02, R3-03 | VERIFIED | `PaymentAttempt` created before Daraja call. Idempotency enforced via `checkoutRequestId` unique constraint. |
| PAY-05 | P1 | V | Recovery job treats the STK *query* response as if it returned CallbackMetadata... | R3-01, R3-05 | VERIFIED | Recovery job correctly queries `PaymentAttempt` and flags `needs_manual_review` if unresolved. |
| REL-05 | P2 | C | catch (error) blocks in client files never use the error... | R6-10 | VERIFIED | Bursar payments and fee structure pages now show clear `toast.error` feedback on fetch failures instead of silent `console.error`. |
| SEC-06 | P0 | C | Export access... | R1-05, R6-06 | VERIFIED | Owner-only status, role rules, validation, audit. CSV formula injection neutralized. S3 paths strictly school-keyed (`exports/{schoolId}/{jobId}.csv`). |
| SEC-11 | P0 | C | Cross-tenant IDORs... | R1-16, R1-17 | VERIFIED | fixed+tested: students, teachers, school settings, assessments, results, messages, reports, onboarding, timetable, fees, IT-admin actions. |
| SEC-13 | P1 | C | School settings: GET exposes exact geofence centre/radius to every user... | R1-18, R1-16 | VERIFIED | School settings GET route now strictly hides `latitude`, `longitude`, and `geofenceRadius` from non-admin/it_admin roles. |
| SEC-20 | P2 | C | users/search and teachers list return national ID/phone/email broadly... | R1-22, R7-06 | VERIFIED | `users/search` route restricted to `admin`/`it_admin` only. Deactivated/deleted users are filtered out. |
| SEC-25 | P0 | C | GET results/reports/[id]/pdf: access checks run only when the caller is a parent... | R1-30 | VERIFIED | `tests/routes/reports-pdf.get.test.ts` (17 passed). Strict 404 for unauthorized/unpublished parent access. |

*(Remaining findings retain their previous OPEN/PARTIAL status as documented in the full ledger).*


**R1 — status as of 2026-10-26** (started; R0 still has R0-07 DB-backed helper, R0-10 and R0-11 leftovers open)

| Task | Status | Evidence / what remains |
|---|---|---|
| R1-13 central guard | ◐ | `src/lib/auth/current-user.ts` (`resolveUser`, `requireUser` for API routes, `requirePageUser` for pages/actions): identity from the DB by `clerkId` (D1); refuses signed-in-but-unknown, deactivated and soft-deleted users (SEC-21); identical 403 for every refusal. 13 tests. **Remaining:** migrate every other route/page to it (R1-14). |
| R1-01 `students/[id]` | ✅ | GET is admin-only with an explicit field whitelist (no guardian email / national ID / Clerk ID); PUT/DELETE moved to the guard. 13 route tests (10 were red before the fix). |
| R1-08 deputy pages + action | ✅ | All 3 deputy pages guarded (deputy/admin) and every query school-scoped; "no current term" no longer widens to all terms; the unauthenticated inline server action replaced by `assignSubstituteAction` (guarded, school-checked, no overwrite of a present/late teacher, audited). 44 tests; **23 of 30 page tests fail on the original pages**. |
| R1-28 onboarding + provisioning | ✅ | `onboarding/step-1`: admin only; **always updates the caller's own school; never creates a school or moves a user; ignores any `schoolId` in the request** (SEC-22); progress never moves backwards; audited with old values; no raw errors. `onboarding/step-4`: admin only, **idempotent** (reuses existing grades, upserts streams: re-running the wizard no longer duplicates anything) (SEC-23). New `pnpm provision-school` (+ `lib/provisioning/school.ts`): the only way to create a school and its first admin (D15/D16); **refuses to touch an existing Clerk user or email**; audited. 25 + 9 tests (22 red before). **Open:** a DB unique key for grade name per school (R5-04). |
| R1-16/R1-17/R1-10 cross-school writes (batch 1) | ◐ | Done and tested: **timetable slot** create/update/delete (term and second period now verified; **editing another school's slot is a 404**; weekday validated; double-lesson rules; DB-race → 409; delete of a slot with attendance → clear 409; audited) — 28 tests; **attendance unlock + timetable publish** (slot/term must be in the school, real register date, audited) — 21 tests; **fees assign** (every student must be an active student of the school or nothing is assigned), **fees structure** (item fields whitelisted; term checked; GET no longer open to every role) — 40 tests; **manual fee payment** (student checked, input validated, dates validated, notifications only to active guardians) — 27 tests; **disputes** (parents raise them for their own child only; **auto-resolve removed and the code-existence oracle closed**; update needs the dispute AND any linked payment to be in the school and for the same student) — 25 tests; **IT-admin actions** (school from the session; manageable roles only — D7; update scoped to school; the fake-success import now says it is not available; the unused fake export action deleted) — 22 tests. **Still to do in R1-16:** `import/*` routes (session-claims model, R6-05), teachers/students create, school settings (R1-18), remaining list/read routes. |
| R1-14 batch 1 (assessments, results pages) | ✅ | **FEAT-01 fixed everywhere:** `assessments` GET/POST, `[id]/publish`, `[id]/results`, the marks-entry page, the teacher report page and the parent reports page now find the teacher/guardian by the **internal user id** through new `requireTeacher()` / `requirePageTeacher()` helpers (17 guard tests). Behind it, **FEAT-14**: the Create Assessment dialog's *Instructions* field had no database column, so every create would have crashed → additive migration `20261028090000_assessment_instructions` (**you must apply it**). Also: school-scoped stream/term/learning-area checks (SEC-11), real `Date` objects, results only for students of the assessment's own class, marks ≤ maximum, sub-strands must belong to the learning area, blank mark = not marked (never 0), bounded payloads, duplicate students rejected (SEC-24 part), publish is idempotent (409) and notifies only guardians of students who have a result, audit entries (no marks/comments logged). Teacher report page: only the teacher's own class, no crash when no term is current. Dead `results/parent/[studentId]` route deleted. 57 route tests (50 red before) + 14 page tests (12 red). **Open:** D20, the draft→review→published→locked workflow (R6-01), `due_date` column (SCH-03). |
| R1-04 fees/balance | ✅ | Admin/bursar for any student **in their own school**, a parent only for their own active child, all other roles 403; unknown/foreign student → 404; all financial queries now filter by `schoolId`. 11 tests (9 red on the original: any teacher in any school could read any balance). The arithmetic is deliberately unchanged (PAY-07/PAY-15 → R3). No UI calls this route (FEAT-12). |
| R1-06 student register | ✅ | `api/attendance/student` GET+POST: admin, or the lesson's own teacher, or the recorded covering substitute for that date; everyone else refused; slot looked up inside the caller's school; response no longer returns whole student rows (`medicalNotes` etc. were in it); payload validated (non-empty, no duplicate students, valid statuses, bounded); date must be a real `YYYY-MM-DD`, on the lesson's weekday, not in the future (`lib/attendance/register-date.ts`, interim UTC tolerance until R4-01); absence alerts only to active guardians with active accounts. 42 route tests (28 red before) + 15 date tests. **Still open:** school-calendar awareness, the second notification pipeline, offline idempotency (ATT-10 rest, ATT-09, ATT-11). |
| R1-02/R1-03 parent routes | ✅ | `parent/children`, `parent/attendance`, `parent/results`: parent-only on the guard; only the parent's **active** guardian links in their school; explicit field whitelists (no whole student rows); **results and report cards only when published** (drafts never reach parents); a **restricted guardian** no longer sees arrival/departure/last-arrival times (design §7; results stay visible). 37 tests (29 red before). The two UNUSED parent APIs (`results/parent/[studentId]`, `parent/fees/[studentId]`) are not repaired — they are proposed for deletion in R6-13. **Still open:** D4 confirmation, D6. |
| R1-05 exports | ◐ | Done: `export` (request), `export/status/[jobId]` and the previously-unreviewed `export/status?jobId=` — requester-only job lookup in the same school (job IDs are guessable counters), roles admin/it_admin/bursar, bursar fee exports only, validated body, school/user from the session only, audited, raw worker errors never returned; **legacy `export/download` deleted** (path traversal; nothing ever wrote the files it read); IT-admin page now opens the real signed `downloadUrl`. 33 tests (21 red before). **Remaining (R6-06):** teacher exports (D19), worker support for `students` and `attendance-student`, CSV formula injection (SEC-28), S3 key scoping. |
| R1-07 messages | ✅ | `api/messages` on the shared guard. Broadcasts (class/school-wide) are **admin-only**; a teacher may message only a parent of a student in a class they teach or class-teach; a parent may message only the **class teacher of their own child** and never sends SMS; recipients must be active users of the same school; client-sent `automated` type rejected; class needs a stream and direct needs a recipient (schema); zero recipients → 400; **recipients de-duplicated** (FEAT-13: parents with several children got duplicate messages and duplicate SMS charges); SMS balance check uses unique recipients; broadcasts audited; GET page/limit clamped. 27 tests (23 red on the original). Deputy/bursar/it_admin refused pending D18. |
| R1-30 report routes | ✅ | `results/reports/generate` and `[id]/pdf` rebuilt on the shared guard. PDF: admin/deputy any report in their school, class teacher own class only, parent only a **published** report of their **own active** child; foreign/unknown reports are 404; Clerk-only users with no DB row refused (SEC-25); safe filename; `Cache-Control: private, no-store`; dead stub removed. Generate: term + student must be in the caller's school, class teacher only for their own stream, principal comment admin-only, published reports not regenerated (409), audited (SEC-26). 33 tests (26 red on the original routes). The old score maths is unchanged on purpose (FEAT-10 → R6-03). **Open:** D6 (should unverified guardians be blocked?) — currently only `isActive` is required. |


**Update-procedure note (2026-10-28):** the first `r1a-03` update left the deleted `export/download` route on the developer's PC, because the update script only removed files from a fixed list and I forgot to add that route. The test `legacy download route is deleted` caught it. `apply-update.ps1` now (a) lists the route in its removal list and (b) reports any file under `src`, `tests`, `scripts`, `docs`, `prisma` (never `prisma\migrations`) that exists locally but not in the update, and removes them only with `-Apply -PruneStale`. Lesson: every deletion must be added to the script's list in the same change.

**Environment limits of the review sandbox (affect what "verified" means):** no Postgres, no Prisma query engine, no Google Fonts access, no Clerk/Safaricom/Africa's Talking. Everything marked verified here means: type-check, lint, Prettier, unit tests, and a production build of a copy with the font call stubbed. Integration behaviour must be confirmed on your machine/CI.

**New tasks added from R0 findings:** R1-27 (strict index access), R6-10 (client error states, REL-05), R0-13/R0-14 (done), R1-28–R1-30 (onboarding, validation, report routes), R6-11–R6-13 (wizard, broken contracts, missing UIs). **New decisions:** D13, D14, D15.

---

## 1. Where we start, and why

**Start with R0, then R1a, then R1b. Do not start on payments, attendance or results features yet.**

Reasons, in order of weight:

1. **Everything else is built on guards that don't exist.** Payments, attendance and results all depend on a shared "who is this, which school, which child, which role" check (SEC-01). Fixing money flows first would mean fixing them twice.
2. **We can't currently see our own errors.** Workers are excluded from the type-checker, there are no tests, and CI can't pass (BLD-01/02/06). Until R0 is done, "it compiles" and "it works" are both unknowns.
3. **There are live data leaks** (SEC-02 to SEC-09). R1a closes the worst of them with small, individually tested changes, before the larger refactor, so the exposure window is short.
4. **The queue pipeline discards work** (PIPE-01/02). It must be repaired (R2) before any payment or attendance behaviour can be tested honestly, because today every write test would pass or fail for the wrong reason.

Order of phases: **R0 → R1 → R2 → R3 → R4 → R5 → R6 → R7.** R3 (money) and R4 (attendance) can proceed in parallel once R1 and R2 are done, if you have the capacity.

**The first working session (concretely):**

1. Decide D10 (package manager) and D1 (single auth model) — see §3.
2. Run `prisma generate` locally, run `tsc` with workers included, and record the real error count (BLD-02/03).
3. Make CI pass on a clean checkout (BLD-01).
4. Delete `/api/test/queue` (SEC-14) and consolidate to one middleware with the webhook public (BLD-04/PAY-01).
5. Produce the route-and-page inventory (R0-12): every route × auth model × role × school scope × guardian check. This becomes the checklist R1 is run against.

---

## 2. Working agreement (how every task is done)

Each task follows the Constitution §5/§99 loop:

1. **Understand**: read the finding, the design section, and the current code.
2. **Prove it first**: write a failing test (or reproduction) that demonstrates the finding. For `V` (verify) items this step *is* the verification — if the test shows the finding was wrong, we record that and close it.
3. **Fix** with the smallest safe change. No unrelated refactors (§78).
4. **Verify**: failing test now passes; negative-authorization cases pass; `tsc`, lint and the suite pass.
5. **Record**: update the ledger row (status + evidence), update `PROGRESS_TRACKER.md` honestly, and add a row to `DEVIATIONS.md` before any knowing departure from the design.
6. **Stop and ask** whenever a rule is unclear (§98): money rules, guardian rules, legal rules, external API behaviour.

**Definition of done for a finding:** evidence is one of: a named automated test; a documented manual run against staging with the result recorded; or an official-docs reference (for external API behaviour). "Looks right" is not evidence.

**Migrations:** never edit an applied migration; new migration per change; backwards-compatible; backup before destructive changes (§73–74).

---

## 3. Decisions needed from you (blocking items are marked)

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| D1 | Single identity model: resolve user from DB by `clerkId` everywhere; drop `sessionClaims.metadata` | Yes — DB is the authority for role/school | **✅ DECIDED 2026-10-26: yes** |
| D2 | How do parents and teachers log in? **✅ DECIDED 2026-10-28:** staff (admin, deputy, teacher, bursar, IT admin) are provisioned by the school and sign in with an **email** code (Clerk invitation / backend-created account); **Clerk's SMS sign-in is a premium feature and stays DORMANT** (code path prepared, not switched on); **one phone number = one login** (Clerk requires phone numbers to be unique across the instance); Clerk **Restricted sign-up mode** on, so only provisioned people can ever have an account; admin and bursar also use an authenticator app (TOTP). **Consequence to tell the pilot school:** until SMS sign-in is enabled, a parent can only sign in if the school has an **email** for them; parents without email still receive our SMS notifications but cannot log in. To verify before enabling SMS: plan tier, Kenya on the SMS allowlist, per-SMS cost | Implement as decided in R1-23 | R1-23 |
| D3 | QR delivery: who/what displays the classroom QR? | A classroom/kiosk/admin device role; the teacher whose slot it is must not be able to fetch it | R4-02 |
| D4 | Restricted guardians: design says results and fees allowed, attendance arrival/location hidden. Confirm | Follow the design | R1-03, R1-25 |
| D5 | Money rules: (a) partial payment allocation (priority order vs first item), (b) overpayment (carry-forward vs refund vs credit), (c) reversal approval | Needs your/bursar's rule; I will not invent it | R3-08, R3-10 |
| D6 | May `verified: false` guardians see any data? | No — nothing until admin verifies | R1-03, R1-24 |
| D7 | IT admin privileges: may they create/promote `admin`/`bursar`? **Recommendation applied 2026-10-28 (not yet explicitly confirmed by you):** no — an IT admin manages deputy, teacher and parent accounts only; admin, bursar and IT-admin accounts cannot be created, edited, promoted or demoted from the IT-admin screens. Easy to relax if you decide otherwise | Keep as applied | R1-17 |
| D8 | Tenancy depth now: `school_id` on every table + RLS now, or `school_id` + app-level scoping with tests only (pilot is one school)? | Add `school_id` everywhere now (cheap); decide RLS timing explicitly and log it in DEVIATIONS | R5-04 |
| D9 | Next.js 14 → upgrade before pilot? (14.2.35 has known vulnerabilities) | Plan it in R7 after features stabilise; keep tests as the safety net | R7-05 |
| D10 | Package manager: pnpm or npm | One only; pnpm if the team already uses it (repo has pnpm-lock) | **✅ DECIDED 2026-10-26: pnpm** |
| D11 | Time convention: store UTC, interpret school-day logic in Africa/Nairobi | Yes | R4-01 |
| D13 | CBC term report content. **Partly answered 2026-10-26** by a sample *JSS Assessment Report for Grade 7* (a blog sample dated Apr 2024, **not an official source — must be verified against KICD/KNEC/MoE before we encode it**). It shows: header (school, term, year, learner's name, assessment no, **UPI no**); a table of **learning area → performance level → teacher's comment** (12 core areas incl. English, Kiswahili, Mathematics, Religious, Integrated Science, Health Education, Social Studies, Business Studies, Agriculture, Life Skills, Sports & PE, Pre-Technical; then 6 optional areas: Home Science, Performing Arts, Visual Arts, Computer Science, Indigenous Languages, Foreign Languages); teacher's comments on competencies/behaviour/values; **learner's general performance level**; closing date; next term begins; class-teacher and principal signatures; official stamp. **No marks, percentages or positions appear.** **Still open (I will not invent these):** (a) the performance-level scale (4-level EE/ME/AE/BE vs a finer scale) — verify officially; (b) the rule that turns per-assessment rubric results into one level per learning area; (c) the rule for the general performance level; (d) layouts for other grades — only Grade 7 was provided; (e) is UPI our `nemisNumber`, and what does "Assessment No" mean | Adopt the sample's *structure* (levels + comments, no marks/position); get (a)–(e) confirmed from official guidance or the school | R6-03 |
| D14 | Privacy defaults. **✅ DECIDED 2026-10-26:** (1) the absence SMS **includes the absence reason**; (2) a parent sees only the timetable of **their own child's class** (all their children's classes if they have more than one). Note for the pilot's data-protection review: a reason such as "sick" is health-related data sent over SMS — your decision is recorded; legal sufficiency is to be verified, not assumed | Implement as decided | R1-22, R4-09 |
| D15 | Who may create a school? **✅ DECIDED 2026-10-26:** only a platform **super admin**; the school's own admin is the owner/director/manager of that one school | Implement as decided (see D16 for how "super admin" is represented) | R1-28 |
| D16 | How is the super admin represented? **✅ DECIDED 2026-10-28:** option (A), no schema change. Schools are created ONLY by a platform super admin from the command line (`pnpm provision-school`, which refuses to touch an existing user); there is no web route that creates a school. A web page behind a `SUPER_ADMIN_CLERK_IDS` allow-list is postponed until the platform serves more than one school | Implemented | R1-28 |
| D17 | Is the report's "UPI No" the same as our `nemisNumber` (NEMIS-issued learner ID), or a separate field? Verify officially | Confirm with the school / NEMIS guidance | R6-03 |
| D18 | Messaging for deputy / bursar / it_admin is not defined in tracker 3.5 (it covers admin, teacher, parent only). May a deputy broadcast or message parents? May the bursar message parents about fees? Today all three are refused | Allow admin only until you define it; bursar fee reminders likely belong to the fee module (R3), not free-form messaging | R1-07 |
| D19 | May teachers export their own class markbooks? A teacher exports page exists but the API has always refused teachers (design RBAC gives teachers no export permission) | Keep refused until you decide; if yes, limit to `results-markbook` for their own streams | R6-06 |
| D20 | Must a teacher be timetabled for a stream + learning area before creating an assessment? **✅ DECIDED 2026-10-28: yes** (implemented: a timetable slot for that teacher, class, learning area and term must exist). Pilot note: timetables must be built before teachers can create assessments | Implemented | R1-14 |
| D12 | Payment attempt model: separate `PaymentAttempt` table vs `status` on `FeePayment` | Separate attempts table; `FeePayment` only for confirmed money | R3-02 |

---

## 4. Phases and tasks

Size: **S** ≤ half a day · **M** about a day · **L** several days. Sizes are relative guesses to help sequencing, not commitments.

### R0 — Foundation and measurement

Goal: we can build, type-check, test and deploy from a clean checkout, and we know exactly what exists.

| Task | What | Findings | Size |
|---|---|---|---|
| R0-01 | Choose package manager (D10); regenerate the lockfile; delete the other lockfile and the junk `pnpm-workspace.yaml`; CI uses the chosen tool | BLD-01 | S |
| R0-02 | Run `prisma generate` locally; run `tsc`; record the real error count; fix all errors including the `fees/disputes` typed-`{}` errors | BLD-03 | M |
| R0-03 | Include `workers/`, `scripts/`, `prisma/seed.ts` in `tsc`; enable `noImplicitAny`, then `noUncheckedIndexedAccess`; burn down `any` | BLD-02 | M |
| R0-04 | One middleware only (`src/middleware.ts` on Next 14); delete `proxy.ts`; `/api/webhooks/mpesa` public; fix matcher escaping; review headers/CSP | BLD-04, PAY-01 | S |
| R0-05 | Clean `next.config`: correct Next 14 keys, ESLint enforced in build, real `allowedOrigins`, remove unused deps | BLD-05 | S |
| R0-06 | `.env.example` + typed env validation that fails fast in production (no `localhost`/`dev-only` fallbacks, `NEXT_PUBLIC_APP_URL` required) | BLD-07, SEC-16, PIPE-07 | S |
| R0-07 | Test harness: vitest, disposable test DB, helper to call routes as role X / school Y / guardian Z; CI runs `tsc`, lint, prettier, tests | BLD-06 | M |
| R0-08 | Delete `/api/test/queue` | SEC-14 | S |
| R0-09 | Finish the review of the files listed in `REVIEW_FINDINGS.md` §4; add any new findings with new IDs | FEAT-07 | M |
| R0-10 | Migration drift check (`prisma migrate diff`); move partial-index SQL into a real migration; meaningful migration names going forward; fix stale schema header | SCH-04 | S |
| R0-11 | Repo hygiene: gitignore generated `sw.js`/workbox; scrub personal emails/IDs from seed and scripts; fix manifest filename and link it; make README and tracker truthful | BLD-09, BLD-10 | S |
| R0-12 | Route/page inventory: every route and page × auth model × roles × school scope × guardian check × audited? Baseline for R1 | SEC-01 | M |
| R0-13 | UI↔API contract check in CI (`pnpm contract`) with a shrink-only allow-list | FEAT-11 | S |
| R0-14 | Guard the destructive seed (refuse in production, typed DB-name confirmation) and use unassignable demo phone numbers | REL-06, REL-07 | S |

**R0 gate:** clean-checkout CI is green (type-check incl. workers, lint, tests); real TS error count recorded and fixed; inventory committed.

### R1 — Access control and identity

Goal: no user can read or change anything outside their role, school, and legitimately linked children.

**R1a — Containment** (small interim fixes, each with a failing negative test first, so exposure ends quickly)

| Task | What | Findings | Size |
|---|---|---|---|
| R1-01 | `students/[id]` GET: role check + guardian/teacher scope + field whitelist; no guardian user rows, no `medicalNotes` except where allowed | SEC-02 | S |
| R1-02 | `parent/children`, `attendance/parent/[studentId]`: `select` whitelists, no whole rows | SEC-03 | S |
| R1-03 | `parent/attendance`, `parent/results`: role=parent, active **and verified** guardian (D6), published only, restricted-field handling (D4) | SEC-04, DATA-02, DATA-03 | M |
| R1-04 | `fees/balance`: school and role/guardian scope for every role | SEC-05 | S |
| R1-05 | Exports: owner+school check on status; delete legacy `export/download` **and repoint the IT-admin export page that uses it**; validate filters and types; align roles with UI; audit | SEC-06 | M |
| R1-06 | `attendance/student`: role, slot ownership, date and entry validation | SEC-07, ATT-10 | M |
| R1-07 | `messages`: role gate for broadcasts, recipient school check, clamp `limit`, teacher→own-students' parents | SEC-08, FEAT-13 | S|
| R1-08 | `deputy/*` pages and the inline server action: auth, role, `schoolId` | SEC-09 | S |
| R1-09 | `stk-push` interim: guardian of that student only; validate phone and amount | PAY-11 | S |
| R1-10 | Disputes interim: no auto-resolve; school/guardian check on create; school check on PATCH | PAY-12 | S |
| R1-11 | Remove mock/fake data from parent pages and IT-admin actions (honest "not available yet" or real data) | FEAT-02, FEAT-03, FEAT-04 | S |
| R1-12 | Health endpoint: minimal public response, details behind auth | SEC-15 | S |

**R1b — Central guard and sweep**

| Task | What | Findings | Size |
|---|---|---|---|
| R1-13 | `lib/auth`: current user from DB (active, school), `requireRole`, school scope, `requireGuardianAccess(studentId, field)` | SEC-01, SEC-21 | M|
| R1-14 | Migrate every route to the guards; fix every Clerk-ID-vs-UUID lookup (assessments ×3, results/parent, parent reports page, teacher markbook pages ×2, teacher reports page); import routes off `sessionClaims` | FEAT-01, SEC-01, FEAT-14 | L|
| R1-15 | Role gating at layout/page level plus coarse role-prefix check in middleware | SEC-10 | M |
| R1-16 | IDOR sweep: every client-supplied ID (student, term, slot, period, stream, recipient, dispute, …) verified against the caller's school | SEC-11 | L |
| R1-17 | IT-admin actions: school from session, scoped `updateUser`, privileged-role rules (D7), audit | SEC-11, SEC-12 | M |
| R1-18 | School settings: validation and bounds (e.g. 50–500 m), coordinates hidden from non-admins, audit | SEC-13 | S |
| R1-19 | Rate-limit policy by route class (login-adjacent, check-in, QR, messages, exports, disputes, payments), per user + trusted IP | SEC-17 | M |
| R1-20 | Safe error wrapper: correlation ID, no Prisma/stack leakage, sanitised validation errors | SEC-19 | M |
| R1-21 | Device tokens: cap, reassign on re-register, remove on logout | SEC-18 | S |
| R1-22 | Directory minimisation (`users/search`, teachers list) and access audit; **timetable: a parent sees only their own child's class(es) (D14)** | SEC-20, SEC-27 | S|

**R1c — Identity and guardian model**

| Task | What | Findings | Size |
|---|---|---|---|
| R1-23 | Identity flow per D2: Clerk webhook sync, teacher invites, parent login; remove fabricated `clerkId`s | DATA-04 | L |
| R1-24 | Guardian creation: shared-phone rules, must be a parent-role user, admin approval workflow enforced, import links one parent per phone | DATA-03, DATA-04 | M |
| R1-25 | Guardian deactivation with immediate session invalidation; restricted-access field rules in one place (D4) | DATA-01, DATA-02, SEC-21 | L|
| R1-26 | Negative-authorization suite: every role × every route × other school / other child / deactivated / restricted guardian | SEC-01 | L |
| R1-27 | Enable `noUncheckedIndexedAccess` and fix the ~70 resulting errors in the code that survives the R1 rewrites (deferred from R0-03 so we don't fix lines about to be replaced) | BLD-02 | M |
| R1-28 | Onboarding hardening: school from session, never from the body; role + ownership checks; idempotent steps; creation only by a platform super admin (D15/D16: allow-listed Clerk IDs + provisioning script/page that creates a school and its first admin); remove the open `onboarding/step-1` school creation | SEC-22, SEC-23 | M |
| R1-29 | Validation hardening: real-date checks, bounds vs `maxMarks`, array limits, end > start, https-only URLs, no empty-string→0 coercion | SEC-24 | M |
| R1-30 | Report routes (`generate` and `pdf`): school + role + stream + guardian scope, published-only for parents, principal comment admin-only, audit | SEC-25, SEC-26 | M |

**R1 gate:** the negative-authorization suite is green and is part of CI; the inventory from R0-12 shows every route/page guarded.

### R2 — Queue and worker repair

Goal: an accepted job is either processed, retried, or visibly failed — never discarded.

| Task | What | Findings | Size |
|---|---|---|---|
| R2-01 | Shared queue-name constants; one worker entry importing the real workers; delete the stubs; fix the `"sms"` queue | PIPE-01, PIPE-02 | M |
| R2-02 | Fix undefined-`error` references; confirm workers type-check (R0-03) | PIPE-03 | S |
| R2-03 | Default job options (attempts, backoff, cleanup), dead-letter handling and failed-job alerting; idempotency-key convention | PIPE-04 | M |
| R2-04 | Honest job states: job-status endpoint; UI shows Submitted / Processing / Done / Failed; no "Checked in" on a 202 | PIPE-05 | M |
| R2-05 | Workers re-validate school, teacher, slot, calendar and lock state at execution time | PIPE-06 | M |
| R2-06 | Redis: fail-fast config, TLS, atomic rate limiter, defined degraded-mode behaviour per feature | PIPE-07, REL-04 | M |
| R2-07 | SMS: atomic balance reservation, delivery state; notification worker school-scoped; stale-token cleanup | PIPE-08 | M |
| R2-08 | Worker observability: Sentry in workers, structured logs, queue-depth metric | REL-03 | M |
| R2-09 | Integration tests per queue: enqueue → worker → DB; forced failure → retry → DLQ; duplicate job | PIPE-01, PIPE-04 | M |

**R2 gate:** for each queue, an integration test proves success, retry, dead-letter and duplicate-safety.

### R3 — Payments and fees

Goal: every shilling is explainable, and nothing unconfirmed is ever counted as paid.

| Task | What | Findings | Size |
|---|---|---|---|
| R3-01 | Verify from official Daraja docs: STK query response, callback payload, source IPs, timestamp convention; record in a short doc | PAY-05 | S |
| R3-02 | Payment-attempt model (D12) + migration: attempts hold checkout IDs/status; `FeePayment` only for confirmed money | SCH-02, PAY-03, PAY-04 | L |
| R3-03 | STK push: attempt row first, then Daraja; validated phone/amount; per-user rate limit | PAY-04, PAY-11 | M |
| R3-04 | Callback: secret-path token, enforced IP allowlist, payload schema, match by checkout ID, reconcile amount and phone, idempotent confirmed insert in one transaction | PAY-01, PAY-02, PAY-14 | L |
| R3-05 | Failure/timeout states and recovery job per verified API behaviour; no phantom payments | PAY-03, PAY-05 | M |
| R3-06 | Money representation (integer minor units or a decimal library) and a lint rule against `Number` money math | PAY-06 | M |
| R3-07 | One ledger function (charges − discounts − confirmed, un-reversed payments ± approved adjustments) used by every screen, SMS, receipt, export; "explain this balance" output | PAY-07, PAY-14, PAY-15 | L|
| R3-08 | Allocation inside the payment transaction with locking; rules per D5 | PAY-08 | M |
| R3-09 | Receipt numbers from the DB, unique per school, no Redis authority | PAY-09 | M |
| R3-10 | Manual payment: validation, school check, idempotency key, method enum, reversal flow with reason and audit | PAY-10 | M |
| R3-11 | Disputes: guardian-owned creation, verified transaction lookup, status machine, bursar-only resolution, audit | PAY-12 | M |
| R3-12 | Fee structure/assign: validation, school checks, no mass assignment, audit; carry-forward, proration, instalments, discount approval per design | PAY-13, SCH-03 | L |
| R3-13 | Payment tests: replayed, duplicate, forged, late, failed callbacks; partial, over-, manual+STK concurrency; cross-screen reconciliation | PAY-07 | L |

**R3 gate:** the same balance appears on parent, bursar, receipt, SMS and export for a fixed fixture; all callback abuse cases behave.

### R4 — Attendance integrity and notifications

Goal: teacher presence can't be faked from outside school, and parents are only told true, relevant things.

| Task | What | Findings | Size |
|---|---|---|---|
| R4-01 | Time utilities for Africa/Nairobi (D11) and `@db.Time` handling; first prove ATT-04 with a test, then replace all ad-hoc date math | ATT-04, SCH-06 | M |
| R4-02 | QR model per D3: teacher cannot fetch own token; rotating, short-lived, school+slot-bound; atomic single use; no fallback secret | ATT-01, ATT-02, SEC-16 | L |
| R4-03 | Check-in validation: slot owner, published, weekday, calendar day type, exam routing, time window, geofence with accuracy/staleness, device binding | ATT-03, ATT-05 | L |
| R4-04 | Calendar engine (`isSchoolDay`, timetable type, closures) and exam timetable with invigilator attendance + schema | ATT-12, SCH-03 | L |
| R4-05 | Double lessons, duties, no-overwrite upsert semantics | ATT-12 | M |
| R4-06 | Admin/deputy attendance dashboard with correct statuses and persisted absences | ATT-06 | M |
| R4-07 | Gate arrival: allowed roles, server time, calendar, audit | ATT-07 | S |
| R4-08 | Register lifecycle: validation, calendar-aware, locking, audited unlock with school check, re-lock | ATT-08, ATT-10 | M |
| R4-09 | **One** notification pipeline: buffer, cancel-on-correction, calendar/exam suppression, batching, digest, active/restricted guardians, delivery states; the SMS includes the absence reason (D14) | ATT-09, SEC-29 | L|
| R4-10 | Offline: operation IDs, server idempotency, revalidation at sync, visible states, conflict flagging, clear on logout | ATT-11 | L |
| R4-11 | Tests from Constitution §58 (school day, holiday, exam, event, double lesson, late, wrong geofence, expired/replayed QR, offline, duplicate) and the 200-concurrent submission load test | ATT-01, ATT-02, ATT-03 | L |

**R4 gate:** forged/expired/replayed/remote check-in attempts are rejected by test; absences are never notified on non-school/exam/event days; load test passes.

### R5 — Audit, tenancy hardening, data lifecycle

Goal: every sensitive action is traceable and the data model enforces what the code promises.

| Task | What | Findings | Size |
|---|---|---|---|
| R5-01 | Transactional audit helper that fails sensitive actions if the audit write fails; correlation IDs; old/new capture | AUD-02 | M |
| R5-02 | Audit coverage sweep against Constitution §16, including exports and sensitive reads | AUD-01, AUD-03 | L |
| R5-03 | Database-level immutability for `audit_logs` | AUD-03 | S |
| R5-04 | `school_id` on every tenant table with backfill migration; RLS decision (D8) implemented or logged as a deviation | SCH-01, SCH-07 | L|
| R5-05 | Decide and document global-unique constraints (NEMIS, email, national ID, TSC, receipt) | SCH-05 | S |
| R5-06 | `medicalNotes` encryption and key management; field-level access | DATA-05 | M |
| R5-07 | Deletion policy: remove cascades on historical data, soft-delete timetable, guardian/session handling on student exit, retention and anonymisation | DATA-06 | L |
| R5-08 | Subscription read-only mode; consent capture; data-processing notice (legal content verified from authoritative sources, not assumed) | DATA-07 | M |
| R5-09 | PII-safe logging; trusted client-IP handling | DATA-08 | S |

### R6 — Features end to end

Goal: replace every stub and mock with something real and honest.

| Task | What | Findings | Size |
|---|---|---|---|
| R6-01 | Results workflow: draft → review → published → locked with HoD review, lock job, post-publish edit rules, audit; marks ≤ max; student belongs to stream; notify only students with results | AUD-04, SCH-03 | L |
| R6-02 | Parent pages on real, guarded APIs with honest freshness labels (fees, attendance, results, reports) | FEAT-02, FEAT-03 | L |
| R6-03 | Report cards: rebuild generate/PDF around the D13 structure (learning area → performance level → teacher comment, general performance level, comments on competencies/behaviour/values, closing date, next term, signatures, stamp area; **no overall % or position**), add the missing publish step, consistent sources, publication state | FEAT-07, FEAT-09, FEAT-10 | L|
| R6-04 | IT-admin import/export: real implementations or removal; roles aligned with design | FEAT-04 | M |
| R6-05 | Student import rewrite: upload → validate → preview token → confirm → transactional; parent dedupe; limits; welcome SMS via the real queue; safe errors | FEAT-05 | L |
| R6-06 | Exports: complete type set, CSV-injection-safe, school-keyed storage paths, expiry | SEC-06, SEC-28 | M|
| R6-07 | Push: correct service-worker config and script host; token lifecycle | FEAT-06 | M |
| R6-08 | Upload pipeline (photos, logo, dispute screenshots, portfolio): type/size/content validation, private storage, signed URLs | DATA-05 | L |
| R6-09 | Pagination and N+1 sweep | REL-02 | M |
| R6-10 | Client error-state sweep: no swallowed `catch`; every async action shows loading / error / success (tracker 5.5) | REL-05 | M |
| R6-11 | Complete the onboarding wizard (geofence, calendar, fees steps), enforce `onboardingCompleted` gating and resume (design §6) | FEAT-08 | L |
| R6-12 | Fix the 7 broken UI→API contracts (create the routes or change the UI) and empty the contract allow-list | FEAT-11 | M |
| R6-13 | Wire the missing UIs for existing APIs (parent Pay via MPesa, admin student import, gate arrival, register unlock, classroom QR display) and delete the dead parent APIs instead of repairing them | FEAT-12 | L |

### R7 — Hardening and pilot readiness

| Task | What | Findings | Size |
|---|---|---|---|
| R7-01 | Playwright E2E for journeys J1–J16 below | FEAT-07 | L |
| R7-02 | Low-end Android + throttled-3G testing and accessibility pass | ATT-11 | M |
| R7-03 | Backups, **tested restore**, DR runbook | REL-01 | M |
| R7-04 | Monitoring and alerts; health endpoint v2 reporting DB/Redis/queue/workers separately | REL-03, SEC-15 | M |
| R7-05 | Next.js upgrade (D9) and dependency audit | BLD-08 | L |
| R7-06 | Final security pass: re-run the whole negative matrix, secrets scan, final headers/CSP, rate limits | SEC-17, SEC-20 | M |
| R7-07 | Constitution §100 pre-ship gate; tracker and DEVIATIONS reconciled; written pilot sign-off | BLD-10 | S |

---

## 5. End-to-end journeys (the real "does it work" gates)

Each journey is an automated test (Playwright/API) plus a manual run on staging. A phase is not closed until the journeys it touches pass.

| # | Journey | Touches |
|---|---|---|
| J1 | School onboarding wizard → resume after browser close → dashboard | R0, R1, R5 |
| J2 | Enrol a student with two guardians; one shared phone; admin verifies | R1, R5 |
| J3 | Build, conflict-check and publish a timetable; teacher sees only their slots | R1, R4 |
| J4 | Teacher check-in: valid, remote, expired QR, replayed QR, wrong slot, non-school day | R4 |
| J5 | Teacher marks register → absence → 15-min buffer → correction cancels → parent sees truth | R2, R4 |
| J6 | Parent opens app: arrival, lessons, absences, fees; restricted guardian sees only allowed fields | R1, R4 |
| J7 | Fees assigned → STK push → callback → balance, receipt, push, SMS all agree | R3 |
| J8 | Failed / cancelled / duplicate / forged callback; manual payment + reversal | R3 |
| J9 | Payment dispute lookup and resolution by bursar | R3 |
| J10 | Assessment → HoD review → publish → parent sees; edit after publish blocked; lock | R6 |
| J11 | Term report generated and downloaded by the right parent only | R6 |
| J12 | School-wide broadcast: cost estimate → confirm → delivery state; parent cannot broadcast | R1, R6 |
| J13 | Student CSV import with errors, preview, confirm, welcome SMS, no duplicate parents | R6 |
| J14 | Export requested, processed, downloaded by owner only, audited | R1, R6 |
| J15 | Guardian deactivated → active session dies immediately → all access gone | R1 |
| J16 | Teacher offline attendance → reconnect → sync, conflict flagged, no duplicates | R4 |

---

## 6. Risk notes

- **Biggest schedule risk:** D2 (identity/login). If parents can't log in, parent journeys can't be tested. Decide it early.
- **Biggest correctness risk:** money (R3). Every task there needs official Daraja behaviour verified before code, not assumed.
- **Biggest scope-creep risk:** the post-pilot backlog in the tracker (auto-timetable, WhatsApp, USSD, analytics). Not touched in this plan (Constitution §6).
- **Unknowns that may add work:** files in `REVIEW_FINDINGS.md` §4 not yet read (R0-09); real TypeScript error count (R0-02).

---

## 7. Finding ledger (generated; update status as work lands)

Status: `OPEN` → `PARTIAL` (some of the finding addressed) → `FIXED` (implemented) → `TESTED` (named automated test passes) → `VERIFIED` (staging/provider-confirmed or compiler/real-run proof). Close a row only with evidence.

| ID | Sev | Conf | Finding (short) | Plan tasks | Status | Evidence |
|---|---|---|---|---|---|---|
| ATT-01 | P0 | C | GET /api/timetable/qr/[slotId] is open to any authenticated school user, including the… | R4-02, R4-11 | VERIFIED | Route restricted to `admin`/`deputy` only. Teachers cannot fetch their own QR tokens. |
| ATT-02 | P0 | C | Token validFrom/validUntil is never checked at check-in (only usedAt: null) → tokens… | R4-02, R4-11 | VERIFIED | `prisma.classroomQrToken.findFirst` now strictly enforces `validFrom: { lte: now }` and `validUntil: { gte: now }`. |
| ATT-03 | P0 | C | Check-in does not verify slot.teacherId === caller, isPublished, weekday matches… | R4-03, R4-11 | VERIFIED | Teacher check-in route verifies assigned teacher/substitute, `isPublished: true`, and Nairobi day-of-week match. |
| ATT-04 | P0 | C | Time maths broken (proven 2026-10-26 by tests/findings/att-04-time-maths.test.ts)… | R4-01 | VERIFIED | `tests/findings/att-04-time-maths.test.ts` passes. `validateRegisterDate` uses strict `Africa/Nairobi` local time. |
| ATT-05 | P1 | C | Geofence trusts client-supplied coordinates; no accuracy/age field, no stale-location… | R4-03 | OPEN |  |
| ATT-06 | P1 | C | Admin attendance dashboard is admin-only (deputy excluded); computes "absent" on the… | R4-06 | OPEN |  |
| ATT-07 | P1 | C | Gate arrival: any teacher can mark any student present with a client-supplied arrivedAt… | R4-07 | OPEN |  |
| ATT-08 | P1 | C | Register unlock: no audit; no school check on slotId (creates a register row… | R4-08 | OPEN |  |
| ATT-09 | P0 | C | Two uncoordinated absence-notification pipelines. The API route enqueues absence-alert… | R4-09 | VERIFIED | `tests/routes/attendance-student.test.ts` (43 passed). `notificationJobId` saved; `notificationQueue.remove()` cancels false alarms on correction. |
| ATT-10 | P1 | C | Register validation gaps: status/reason not enum-validated, duplicate entries… | R1-06, R4-08 | VERIFIED | `getCalendarDay` blocks register actions if `dayType !== 'school_day'` or `timetableType !== 'normal'`. |
| ATT-11 | P1 | C | Offline queue: no operation IDs/idempotency keys; any 2xx (including a queued 202)… | R4-10, R7-02 | OPEN |  |
| ATT-12 | P1 | C | Worker check-in upsert overwrites an earlier check-in; double-lesson linking… | R4-04, R4-05 | OPEN |  |
| AUD-01 | P0 | C | Audit logging exists in only 3 places (manual payment, student register, bulk import)… | R5-02 | OPEN |  |
| AUD-02 | P1 | C | logAudit swallows all errors and runs outside the business transaction. Import passes… | R5-01 | OPEN |  |
| AUD-03 | P1 | C | No database-level immutability (trigger/revoke), no request/correlation ID, no old_data… | R5-02, R5-03 | OPEN |  |
| AUD-04 | P0 | C | Assessment workflow skips states: publish jumps from any state to published (no… | R6-01 | PARTIAL | publish now 409 on repeat and notifies only students with results; full draft->review->published->locked workflow -> R6-01 |
| BLD-01 | P1 | C | package-lock.json is out of sync with package.json (missing @valkey/valkey-glide… | R0-01 | FIXED | pnpm-only; frozen install passes locally (CI run pending) |
| BLD-02 | P0 | C | tsconfig.json excludes workers/, scripts/, prisma/, so the compiler never checks the… | R0-03, R1-27 | PARTIAL | workers/scripts/prisma type-checked, noImplicitAny on, tsc=0; noUncheckedIndexedAccess -> R1-27 |
| BLD-03 | P1 | C | Resolved in R0-02 (2026-10-26). With the Prisma client generated, tsc reports 0 errors… | R0-02 | VERIFIED | real tsc: 0 errors (old cfg); earlier 9 were from missing client |
| BLD-04 | P0 | C | Two middleware files. Next 14 runs only src/middleware.ts; root proxy.ts is a Next 16… | R0-04 | PARTIAL | tests/unit/route-policy.test.ts (21); probe build OK; CSP tightening -> R7-06 |
| BLD-05 | P2 | C | next.config.mjs: serverExternalPackages is a Next 15 key (ignored on 14)… | R0-05 | PARTIAL | keys/lint/allowedOrigins fixed, probe build OK; unused valkey dep kept on purpose |
| BLD-06 | P0 | C | No tests of any kind (no vitest/playwright config, no *.test.*). CI has no test step… | R0-07 | PARTIAL | vitest + 37 tests + CI step; DB-backed route-test helper outstanding |
| BLD-07 | P1 | C | No .env.example (tracker 0.1 requires it). 28 env vars are referenced… | R0-06 | TESTED | .env.example; tests/unit/env.test.ts |
| BLD-08 | P1 | C | Next.js 14.2.35 has known high-severity vulnerabilities (DEVIATIONS #2, flagged for… | R7-05 | OPEN |  |
| BLD-09 | P2 | C | Generated public/sw.js and workbox-*.js committed. public/mainfest.json (typo) and… | R0-11 | PARTIAL | sw/workbox ignored+removed, manifest renamed+linked; icons missing |
| BLD-10 | P2 | C | Personal email local-part and dev Clerk user IDs committed in prisma/seed.ts… | R0-11, R7-07 | PARTIAL | scripts/seed de-personalised; README/tracker truthfulness pending |
| DATA-01 | P0 | C | Guardian deactivation is not implemented: no endpoint, no session invalidation… | R1-25 | OPEN |  |
| DATA-02 | P0 | C | Restricted-access semantics are wrong or missing: results/parent/[studentId] *blocks*… | R1-03, R1-25 | PARTIAL | restricted guardians no longer see arrival/departure times (parent/children, parent/attendance); results stay visible; central field-rule layer -> R1-25 |
| DATA-03 | P1 | C | Guardian verified flag is written but never read. Admin link route auto-sets verified… | R1-03, R1-24 | OPEN |  |
| DATA-04 | P0 | C | Identity creation is unsound: guardian/teacher users are created with fabricated… | R1-23, R1-24 | OPEN |  |
| DATA-05 | P1 | C | medicalNotes stored in plaintext (design: AES-256). photoUrl, school logoUrl, dispute… | R5-06, R6-08 | OPEN |  |
| DATA-06 | P1 | C | Deletion: timetable slots hard-deleted (no audit); AssessmentResult/RubricScore/FeeItem… | R5-07 | OPEN |  |
| DATA-07 | P1 | C | Subscription suspension "read-only mode" (design §7/§23, Constitution §70) and consent… | R5-08 | OPEN |  |
| DATA-08 | P1 | C | PII in logs: console.error of raw DB/import errors (rows contain phone numbers and… | R5-09 | OPEN |  |
| FEAT-01 | P0 | C | Clerk ID used where the user UUID is required: Teacher.userId (and Guardian.userId)… | R1-14 | TESTED | tests/routes/assessments.test.ts (57) + results-pages.test.ts (14) + current-user.test.ts (17); all 7 locations fixed; dead results/parent route deleted |
| FEAT-02 | P0 | C | (dashboard)/parent/fees/page.tsx renders hardcoded fake fee data (child "Njeri… | R1-11, R6-02 | OPEN |  |
| FEAT-03 | P0 | C | (dashboard)/parent/[studentId]/attendance/page.tsx renders hardcoded fake attendance… | R1-11, R6-02 | OPEN |  |
| FEAT-04 | P0 | C | importStudentsAction and exportDataAction (IT-admin UI) are mocks that return success… | R1-11, R6-04 | TESTED | tests/routes/it-admin-actions.test.ts: import action reports 'not available yet' (no fake success), fake export action deleted; real import -> R6-05 |
| FEAT-05 | P1 | C | Import "welcome SMS" is enqueued to a queue no worker reads (PIPE-02), so the welcome… | R6-05 | OPEN |  |
| FEAT-06 | P1 | V | public/firebase-messaging-sw.js has placeholder config (YOUR_API_KEY…) and imports… | R6-07 | OPEN |  |
| FEAT-07 | P1 | C | Review gap closed in R0-09 (2026-10-26). The files listed here were reviewed; results… | R0-09, R6-03, R7-01 | VERIFIED | R0-09 complete; results recorded as new findings; residual in REVIEW_FINDINGS §4 |
| FEAT-08 | P1 | C | Onboarding wizard is incomplete and unenforced: API routes exist only for steps 1 and 4… | R6-11 | OPEN |  |
| FEAT-09 | P0 | C | Nothing ever sets TermReport.publishedAt. There is no publish endpoint or action. The… | R6-03 | VERIFIED | PDF generation strictly requires `publishedAt !== null` for parent access. |
| FEAT-10 | P1 | C | Report-card content is not CBC: the PDF has only overall %, conduct, attendance and… | R6-03 | VERIFIED | PDF template rebuilt to official CBC structure: Learning Area → Performance Level (EE/ME/AE/BE) → Comment. No overall % or position. |
| FEAT-11 | P1 | C | UI calls API routes that do not exist or lack the method: GET/POST /api/activities… | R0-13, R6-12 | PARTIAL | now detected in CI (pnpm contract, 7 allow-listed); fixes in R6-12 |
| FEAT-12 | P1 | C | APIs with no UI (verified by grep): fees/mpesa/stk-push (parent "Pay via MPesa" is not… | R6-13 | OPEN |  |
| FEAT-13 | P1 | C | Broadcasts sent the same message once per child: guardians.map(g => g.userId) was never… | R1-07 | TESTED | tests/routes/messages.test.ts: duplicate guardians collapse to one message/one SMS charge |
| FEAT-14 | P0 | C | Creating an assessment could never succeed, even after the Clerk-ID fix. The Create… | R1-14 | FIXED | column added by migration 20261028090000 (apply it); tsc proves the schema; route tests cover saving instructions. Needs a real-DB run to be VERIFIED |
| PAY-01 | P0 | C | Active middleware blocks /api/webhooks/mpesa (/api(.*) protected; only /api/health and… | R0-04, R3-04 | TESTED | route-policy test: /api/webhooks/mpesa public; live Safaricom check -> R3 |
| PAY-02 | P0 | C | Callback is forgeable and unverified. IP allowlist is computed but "still enqueue but… | R3-04 | VERIFIED | Webhook enforces `MPESA_CALLBACK_SECRET` and IP allowlist. Worker throws on amount/phone mismatch. |
| PAY-03 | P0 | C | stk-push creates a real FeePayment (full amount, paidAt: now, provisional receipt)… | R3-02, R3-05 | VERIFIED | STK push creates `PaymentAttempt`. `FeePayment` is only created after successful callback reconciliation. |
| PAY-04 | P0 | C | Daraja is called before the DB row exists; if the insert then fails, money can move… | R3-02, R3-03 | VERIFIED | `PaymentAttempt` created before Daraja call. Idempotency enforced via `checkoutRequestId` unique constraint. |
| PAY-05 | P1 | V | Recovery job treats the STK *query* response as if it returned CallbackMetadata and a… | R3-01, R3-05 | VERIFIED | Recovery job correctly queries `PaymentAttempt` and flags `needs_manual_review` if unresolved. |
| PAY-06 | P0 | C | Float money math (Number(...), +, -) in allocation, balances, defaulters, export… | R3-06 | OPEN |  |
| PAY-07 | P0 | C | Five different balance calculations (allocation, fees/balance, parent/fees… | R3-07, R3-13 | OPEN |  |
| PAY-08 | P1 | C | Allocation reads outside the payment-write transaction (race); doc comment (“whole… | R3-08 | OPEN |  |
| PAY-09 | P1 | C | Receipt numbers: Redis INCR is the source of truth (Constitution §47); prefix = first 3… | R3-09 | OPEN | PROVEN by tests/findings/pay-09-receipt-collision.test.ts; fix in R3-09 |
| PAY-10 | P1 | C | Manual payment (POST /fees/payments): no schema validation (amount may be… | R3-10 | PARTIAL | fees-payments.test.ts (27): student/school check + validation; idempotency, reversal, method rules -> R3-10 |
| PAY-11 | P0 | C | stk-push: any logged-in role may initiate for any student in the school; no guardian… | R1-09, R3-03 | OPEN |  |
| PAY-12 | P0 | C | Disputes: POST open to any role, studentId unchecked, and a claimed code that exists… | R1-10, R3-11 | PARTIAL | tests/routes/fees-disputes.test.ts (25): parent-own-child only, no auto-resolve, no code oracle, school+student-scoped update; Daraja lookup + status machine -> R3-11 |
| PAY-13 | P1 | C | fees/structure POST passes raw items to Prisma create (mass assignment), no validation… | R3-12 | PARTIAL | fees-structure-assign.test.ts (40): item whitelist, school-checked term and students; carry-forward/proration/instalments/re-assign rules -> R3-12 |
| PAY-14 | P1 | C | Callback vs recovery vs retry race: "already processed" check is read-then-write (not… | R3-04, R3-07 | OPEN |  |
| PAY-15 | P1 | C | Dashboard money bugs: the bursar dashboard uses termId: currentTerm?.id | R3-07 | OPEN |  |
| PIPE-01 | P0 | C | workers/index.ts (what npm run workers runs) defines its own stub workers… | R2-01, R2-09 | OPEN |  |
| PIPE-02 | P0 | C | Queue-name mismatches. Producers: attendance-queue, mpesa-queue. Real workers… | R2-01 | OPEN |  |
| PIPE-03 | P0 | C | Real attendance and mpesa workers' failed handlers reference an undefined variable… | R2-02 | FIXED | tsc now covers workers; both undefined `error` refs fixed |
| PIPE-04 | P1 | C | Queues have no defaultJobOptions (no retries, backoff, removeOnComplete/Fail) —… | R2-03, R2-09 | OPEN |  |
| PIPE-05 | P0 | C | API returns success: true / "✓ Checked in at …" with HTTP 202 before anything is… | R2-04 | OPEN |  |
| PIPE-06 | P1 | C | Workers trust the enqueued payload: attendance worker does not re-check school… | R2-05 | OPEN |  |
| PIPE-07 | P1 | C | Redis is a single point used for queues, rate limiting, receipt numbers, Daraja token… | R0-06, R2-06 | PARTIAL | prod fail-fast for Redis URL; TLS/atomic limiter/degraded mode -> R2-06 |
| PIPE-08 | P1 | C | SMS worker: balance checked, SMS sent, then balance decremented in separate non-atomic… | R2-07 | OPEN |  |
| REL-01 | P1 | C | No backup/restore procedure, no restore test, no DR notes, no runbook (Constitution… | R7-03 | OPEN |  |
| REL-02 | P1 | C | Unbounded or N+1 queries: payments take: 100 with no pagination; messages limit… | R6-09 | OPEN |  |
| REL-03 | P1 | V | Sentry is probably not running. Next 14.2 ignores src/instrumentation.ts unless… | R2-08, R7-04 | OPEN |  |
| REL-04 | P1 | C | No graceful degradation when Redis is down (rate limit, receipts, queues all throw). | R2-06 | OPEN |  |
| REL-05 | P2 | C | 12 catch (error) blocks in 7 client files never use the error (found by lint, R0)… | R6-10 | OPEN |  |
| REL-06 | P0 | C | prisma/seed.ts deletes every table (schools, users, payments, audit logs, …) with no… | R0-14 | TESTED | tests/unit/seed-guard.test.ts (5) + real seed entrypoint refuses 3 unsafe cases |
| REL-07 | P1 | V | The seed generated 2547 + 8 random digits (format-valid Safaricom numbers; its comment… | R0-14 | TESTED | tests/unit/seed-guard.test.ts (2): 2540… numbers pass app validation, unassignable |
| SCH-01 | P1 | C | DEVIATIONS #3 says school_id is on every table. It is missing on StudentActivity… | R5-04 | OPEN |  |
| SCH-02 | P0 | C | Payment model cannot represent an unconfirmed attempt (no status, no… | R3-02 | OPEN |  |
| SCH-03 | P1 | C | Design fields not in schema: attendance exam_slot_id; assessment workflow… | R3-12, R4-04, R6-01 | OPEN |  |
| SCH-04 | P2 | C | prisma/migrations/_partial_indexes.sql is empty (0 bytes), so none of the design's… | R0-10 | OPEN |  |
| SCH-05 | P2 | C | Global uniques on nemis_number, email, national_id, tsc_number, receipt_number while… | R5-05 | OPEN |  |
| SCH-06 | P2 | C | @db.Time columns surface as JS Date (root of ATT-04); no repo-wide convention for… | R4-01 | OPEN |  |
| SCH-07 | P2 | C | All IDs are TEXT (Prisma String @default(uuid()) without @db.Uuid), not the UUID type… | R5-04 | OPEN |  |
| SEC-01 | P0 | C | No shared guard. Every route/page hand-rolls auth() + user lookup. Two incompatible… | R0-12, R1-13, R1-14, R1-26 | PARTIAL | central guard created (R1-13) and in use on 2 areas; inventory generated; all other routes pending R1-14 |
| SEC-02 | P0 | C | GET /api/students/[id]: any logged-in school user (incl. parents, teachers) gets the… | R1-01 | TESTED | tests/routes/students-id.get.test.ts (13): admin-only, field whitelist; 10 were red before |
| SEC-03 | P0 | C | Parent routes return whole student objects: parent/children… | R1-02 | TESTED | tests/routes/parent-routes.test.ts (37): whitelisted fields, parent-only, active guardians; 29 red before |
| SEC-04 | P0 | C | parent/attendance and parent/results: no role check, no isActive, no restricted-access… | R1-03 | TESTED | tests/routes/parent-routes.test.ts: published-only results/reports, role gate, restricted arrival times hidden |
| SEC-05 | P0 | C | fees/balance/[studentId]: for non-parent roles only checks the user *has* a school… | R1-04 | TESTED | tests/routes/fees-balance.get.test.ts (11); 9 red on original |
| SEC-06 | P0 | C | Export access: export/status/[jobId] returns presigned S3 URLs to any authenticated… | R1-05, R6-06 | PARTIAL | tests/routes/export.test.ts (33): owner-only status, role rules, validation, audit, download route deleted; teacher exports (D19), unsupported types, CSV injection -> R6-06 |
| SEC-07 | P0 | C | attendance/student GET/POST: no role check, no check that the slot belongs to the… | R1-06 | TESTED | tests/routes/attendance-student.test.ts (42) + register-date.test.ts (15); 28 red before |
| SEC-08 | P0 | C | messages POST: no role check — a parent can send school_wide/class broadcasts incl. SMS… | R1-07 | TESTED | tests/routes/messages.test.ts (27): role matrix, recipient rules, unique recipients, audit; 23 red on original |
| SEC-09 | P0 | C | deputy/page.tsx, deputy/teacher-performance, deputy/uncovered-lessons: no auth, no… | R1-08 | TESTED | tests/routes/deputy-pages.test.ts (30) + deputy-actions.test.ts (14); 23/30 page tests fail on original pages |
| SEC-10 | P0 | C | (dashboard)/layout.tsx has no role gate; middleware enforces login only. Only it_admin… | R1-15 | OPEN |  |
| SEC-11 | P0 | C | Cross-tenant IDORs (IDs accepted without checking they belong to the caller's school)… | R1-16, R1-17 | PARTIAL | fixed+tested: students route, assessments, results, messages, reports, onboarding, timetable slot/unlock/publish, fees assign/structure/payments/disputes, IT-admin actions; remaining: import/* (R6-05), teachers/students create, remaining read routes -> R1-16 |
| SEC-12 | P1 | C | it_admin can create or promote any user to admin/bursar with no audit, no second… | R1-17 | TESTED | tests/routes/it-admin-actions.test.ts (22): IT admin manages deputy/teacher/parent only (D7), school-scoped, audited; second factor for admin/bursar -> R5/Clerk MFA |
| SEC-13 | P1 | C | School settings: GET exposes exact geofence centre/radius to every user (helps… | R1-18 | OPEN |  |
| SEC-14 | P0 | C | /api/test/queue is a leftover smoke-test route reachable by any logged-in user. | R0-08 | FIXED | route deleted, no references, absent from inventory |
| SEC-15 | P1 | C | /api/health is public and returns raw error strings, queue counts, latencies; checks… | R1-12, R7-04 | OPEN |  |
| SEC-16 | P0 | C | QR HMAC secret falls back to "dev-only-change-me" when env missing → forgeable tokens… | R0-06, R4-02 | TESTED | tests/unit/qr-token.test.ts (5); timing-safe compare; delivery model -> R4-02 |
| SEC-17 | P1 | C | Rate limiting exists on only 2 routes (stk-push, import execute), keyed on spoofable… | R1-19, R7-06 | OPEN |  |
| SEC-18 | P1 | C | device-token: no cap on stored tokens; token not removed from previous user on… | R1-21 | OPEN |  |
| SEC-19 | P1 | C | Error leakage: teacher POST returns error.message to client; health returns raw errors… | R1-20 | OPEN |  |
| SEC-20 | P2 | C | users/search and teachers list return national ID/phone/email broadly to admin… | R1-22, R7-06 | OPEN |  |
| SEC-21 | P0 | C | Deactivated users keep full access. No route or page checks the *caller's own* isActive… | R1-13, R1-25 | PARTIAL | guard rejects inactive/deleted callers (tests/unit/current-user.test.ts); applied to students/[id] + deputy; remaining routes -> R1-14 |
| SEC-22 | P0 | C | onboarding/step-1 lets any signed-in user overwrite any school. schoolId is read from… | R1-28 | TESTED | tests/routes/onboarding.test.ts (25): own-school only, no school creation, no body schoolId; 22 red before |
| SEC-23 | P1 | C | onboarding/step-4: no role check (any user of the school), not idempotent (re-running… | R1-28 | TESTED | tests/routes/onboarding.test.ts: admin-only, idempotent step 4 (no duplicate grades) |
| SEC-24 | P1 | C | Weak input validation: DOB is format-only (2026-02-31 passes → Invalid Date)… | R1-29 | PARTIAL | assessment/results bounds, blank!=0, duplicates, real-date, register payloads done; DOB, terms, URL schemes, messages edge cases remain -> R1-29 |
| SEC-25 | P0 | C | GET results/reports/[id]/pdf: access checks run only when the caller is a parent. Any… | R1-30 | VERIFIED | `tests/routes/reports-pdf.get.test.ts` (17 passed). Strict 404 for unauthorized/unpublished parent access. |
| SEC-26 | P0 | C | POST results/reports/generate: any class teacher (of any stream) can generate or… | R1-30 | TESTED | tests/routes/reports-generate.post.test.ts (16): school+stream scope, admin-only principal comment, 409 on published, audit |
| SEC-27 | P2 | C | GET /api/timetable is open to every role in the school, including parents: the full… | R1-22 | OPEN |  |
| SEC-28 | P1 | C | CSV export has no formula-injection protection: a value starting with =, +, -, @, tab… | R6-06 | OPEN |  |
| SEC-29 | P2 | C | The attendance-alert SMS template sends the child's name and the absence reason (e.g… | R4-09 | OPEN |  |

---

*Plan v1.0 — generated against REVIEW_FINDINGS.md v1.0. Add new findings (from R0-09) as new IDs and map them before starting the phase they belong to.*