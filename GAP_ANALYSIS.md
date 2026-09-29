# EduTrack Kenya — Repository vs. Design Gap Analysis
Repo reviewed: https://github.com/Simon749/sms- (commit at time of review)
Compared against: SYSTEM_DESIGN.md v2.0, PROGRESS_TRACKER.md v1.0, AI Engineering Constitution

---

## 1. Understanding

You asked for a review of your existing GitHub project against the EduTrack Kenya design
documents, to identify gaps and propose a way forward. I cloned the repo and read the schema,
middleware, server actions, and representative pages across all major modules.

## 2. Top-line finding

The repository is **a different, simpler application** than the one described in
`SYSTEM_DESIGN.md`. It matches the structure of a popular open-source Next.js "School
Management Dashboard" tutorial (Clerk auth, Prisma, single school, core CRUD for
students/teachers/classes/exams). It is a reasonable *starting skeleton*, but it does not
implement:

- Multi-tenancy (no `schools` table — there is exactly **one** school, implicitly)
- CBC grading (no learning areas, strands, sub-strands, rubric scores)
- MPesa / fee management (no fee, payment, or billing tables at all)
- Teacher geofence + QR attendance
- Offline-first PWA behaviour
- BullMQ / queue-first writes
- Notification intelligence / correction buffer
- SMS (Africa's Talking) or push (FCM) integration
- Audit logging
- Soft deletes
- 2FA, rate limiting, device binding
- Academic calendar awareness (no `school_calendar_days`, no exam-timetable separation)
- Import/export engine
- Guardian edge cases (deactivation, restricted access, phone-change flow)

This isn't a criticism of effort — it's a scope/stage mismatch. The repo is a Phase-0-ish
generic dashboard; the design document is an ambitious, financially- and safety-critical,
multi-tenant SaaS platform. Treating the repo as "EduTrack with some gaps" would understate
the distance between the two.

## 3. What currently exists (and is genuinely working)

| Area | State |
|---|---|
| Auth | Clerk (not NextAuth v5 as SYSTEM_DESIGN.md specifies) — role stored in `sessionClaims.metadata.role` |
| Roles | admin / teacher / parent / student (4 roles — design specifies 6: admin, deputy, teacher, bursar, parent, it_admin) |
| Students, Teachers, Parents, Classes, Grades, Subjects, Lessons | Basic CRUD, single-tenant |
| Attendance | Simple `present: boolean` per lesson — no geofence, QR, or calendar awareness |
| Exams / Assignments / Results | Basic scoring, an `isVerified` flag exists but no formal draft→review→publish→lock workflow |
| Messaging | A flat `Message` table (sender/recipient/role) — no SMS fallback, no buffering |
| Events / Announcements | Basic CRUD |

## 4. Concrete gaps mapped to your Constitution's priority order

### 1) Child/student safety & privacy — gaps found
- `students/[id]/page.tsx` fetches a student **by ID with no ownership check** against the
  logged-in user, and no verification that the student belongs to the same school (there's no
  school scope to check). Any authenticated user who can guess/enumerate a student ID can
  potentially view that student's profile page.
- The route-access map (`src/lib/settings.ts`) protects `/list/students` but the middleware
  uses `createRouteMatcher(["/list/students"])` **without a wildcard**, so it's unclear whether
  `/list/students/[id]` is actually covered — this needs to be verified, not assumed, because a
  regex/matcher gap here is exactly the kind of silent authorization hole your Constitution
  (§9, §11, §59) calls out explicitly.
- `/list/attendance/page.tsx`: for any role other than `teacher` (i.e. **admin, parent, and
  student all fall into this branch**), the page runs `prisma.attendance.findMany({ take: 50,
  orderBy: { date: 'desc' } })` with **no filter at all** — every parent or student account can
  see the last 50 attendance records for the *entire school*, not just their own child. This is
  a direct violation of §11 ("A parent must only see children they are legitimately linked to").

### 2) Data correctness
- No `school_calendar_days` concept — attendance can be marked on any day regardless of whether
  it's a holiday, exam day, or event day (§18 is not implemented).
- No exam-timetable separation (§19) — `Exam` is just linked to a `Lesson`, so there's no
  concept of an invigilator distinct from the subject teacher.

### 3) Financial correctness
- **No fee or payment model exists at all.** Phase 2 of your tracker (fees, MPesa STK Push,
  balances, defaulters, disputes) is entirely unbuilt. This is the single largest gap relative
  to the tracker.

### 4) Authorization & tenant isolation
- There is no `school_id` anywhere in the schema. Every table is implicitly single-tenant.
  Building multi-tenancy in later by retrofitting `school_id` onto ~15 tables and every query
  is a much bigger job than designing it in from the start (this is explicitly why §9 exists).
- Server actions in `src/lib/actions.ts` do not appear to re-check role/ownership before
  mutating (worth a deeper pass once you decide to proceed — I stopped at a representative
  sample given the scale of the mismatch).

### 5) Reliability
- No queue (BullMQ), no Redis — every write is a direct, synchronous Prisma call. Fine for a
  single-classroom demo; not resilient to your documented 8AM-attendance-spike scenario (§56–57
  explicitly requires this to be load-tested).

### 6) Auditability
- No `audit_logs` table. No `created_by`/`old_value`/`new_value` tracking anywhere.
- All deletes are **hard deletes** (`prisma.student.delete`, `.teacher.delete`, etc.) — no
  `deleted_at`, directly contradicting §17 ("Never casually hard-delete student or teacher
  records").

### 7–11) Trust, performance, usability, polish, dev convenience
- These aren't reviewable yet in a meaningful way — the missing foundational layers (tenant
  isolation, financial model, calendar engine, notification intelligence) are prerequisites for
  the trust properties your Constitution cares about most. Polish on top of a single-tenant,
  no-audit-log, hard-delete system would be premature per §1.

## 5. Why this matters before writing any more code

Per your own Constitution (§98 — "WHEN THE AGENT SHOULD STOP"): this is a case where
**the correct behaviour cannot be determined from available sources** without your explicit
decision, because there are two fundamentally different paths forward and I should not silently
pick one:

**Path A — Treat this repo as throwaway / reference only.**
Start the real EduTrack Kenya build fresh, following `SYSTEM_DESIGN.md` and
`PROGRESS_TRACKER.md` Phase 0 onward exactly as written. The existing repo's UI components
(tables, forms, layout shell) could be salvaged as visual scaffolding, but the data model and
auth model would be rebuilt from scratch with `school_id` scoping baked in from day one.

**Path B — Evolve this repo into EduTrack Kenya.**
Keep Clerk, keep the existing schema as a base, and incrementally retrofit: add `schools` +
`school_id` everywhere, add audit logging + soft deletes, then build out fees/MPesa, geofence
attendance, calendar engine, etc. This is possible but the multi-tenancy retrofit alone touches
almost every table and every query in the app, and Clerk's role model would need to absorb 2
more roles (deputy, bursar, it_admin) plus per-school scoping of its own.

I'd lean toward flagging that **Path A is usually less overall effort** for a system at this
level of financial/safety criticality, because retrofitting tenant isolation and audit logging
onto ~15 tables and every query path is historically harder and riskier than building it in from
the start — but this is your call to make, not mine to assume.

## 6. Suggested immediate next step (either path)

Before writing more feature code, regardless of which path you choose:
1. Fix the attendance-page data leak (parents/students seeing all students' attendance) —
   that's a live privacy bug in what's already deployed, independent of the bigger decision.
2. Decide Path A vs. Path B.
3. If Path B: write the multi-tenancy migration plan first (schema + query-scoping strategy)
   before adding any new feature, since every feature added afterward would otherwise need to
   be redone.

## 7. What I have not yet done

- Full line-by-line audit of `src/lib/actions.ts` (24KB) — I sampled it; a full pass makes more
  sense once you've picked a path, so effort isn't spent auditing code that might be discarded.
- Did not run the app or execute tests (no DATABASE_URL / Clerk keys available in this
  environment).
- Have not reviewed git history/commits for context on how the repo diverged from the design.
