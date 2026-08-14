# EduTrack Kenya — Build Progress Tracker
> Last Updated: 2026-08-14  |  Current Phase: Phase 0 — Project Setup  |  Pilot Target: 1 Nairobi Private School

> **Rebuild note (2026-08-14):** Previous repo (`Simon749/sms-`) audited against this tracker
> and SYSTEM_DESIGN.md — found to be a different, single-tenant tutorial-based project covering
> ~10-15% of scope, with a live parent/student data-leak bug. See `GAP_ANALYSIS.md`. Decision:
> fresh rebuild (Path A), old repo kept only as visual/component reference, not as a foundation.
> Auth uses Clerk instead of NextAuth v5 — see `DEVIATIONS.md`.

---

## How to Use This Tracker

- Update `Last Updated` date every time you work on the project
- Mark tasks: `[ ]` = todo · `[~]` = in progress · `[x]` = done · `[!]` = blocked
- Add notes under blocked items explaining what's blocking you
- **Never skip a section** — each builds on the previous

---

## Phase Overview

| Phase | Name | Duration | Goal | Status |
|-------|------|----------|------|--------|
| 0 | Project Setup | Week 1 | Repo, DB, auth skeleton running | `[ ]` |
| 1 | Core Foundation | Weeks 2–5 | Students, timetable, teacher attendance | `[ ]` |
| 2 | Parent & Fees | Weeks 6–9 | Parent app, MPesa, student attendance | `[ ]` |
| 3 | Results & Comms | Weeks 10–12 | CBC results, messaging, SMS | `[ ]` |
| 4 | Import/Export | Week 13 | CSV import/export, report cards | `[ ]` |
| 5 | Hardening | Weeks 14–15 | Testing, security audit, performance | `[ ]` |
| 6 | Pilot Launch | Week 16 | First school live | `[ ]` |

---

## PHASE 0 — Project Setup
> Goal: Working skeleton with auth, DB connection, and CI/CD pipeline
> Target completion: End of Week 1

### 0.1 Repository & Tooling
- [!] Create GitHub repository (private) — **BLOCKED: needs you.** I can't create/push to GitHub
      from this sandbox (no auth token). Scaffold is ready in the delivered zip — see chat for
      exact `git init` / push commands to your new repo.
- [x] Initialise Next.js 14 with App Router — done, on `next@14.2.35` not `14.2.25` (patched a
      known vuln — see `DEVIATIONS.md` #2 for the remaining unpatched issues that need Next 16)
- [x] Configure ESLint + Prettier with project rules — `.prettierrc.json` added, eslint from
      create-next-app defaults kept for now
- [x] Set up Husky pre-commit hooks (lint + type-check before every commit) — hook file written;
      run `npx husky install && npm install` locally to activate (needs real `npm install`, which
      this sandbox can partially do but the Prisma engine binary can't download here — see
      `DEVIATIONS.md`)
- [ ] Add `.env.local` from `SYSTEM_DESIGN.md §18` (all vars, no values yet) — **needs you**,
      copy `.env.example` → `.env.local` and fill real secrets once accounts exist
- [x] Create `.env.example` with all keys but no secrets (committed to repo) — done, includes
      Clerk vars in place of NextAuth per the deviation
- [x] Configure path aliases in `tsconfig.json` (`@/` → `src/`) — done via create-next-app
- [x] Set up folder structure per `SYSTEM_DESIGN.md §5` — full structure scaffolded (empty dirs
      for later phases included, per the design's project layout)

### 0.2 Database — Neon PostgreSQL
- [ ] Create Neon account + project (`edutrack-dev`) — **needs you**
- [ ] Create `main` branch (prod-equivalent) and `dev` branch in Neon — **needs you**
- [ ] Add `DATABASE_URL` to `.env.local` — **needs you**, once Neon project exists
- [x] Install Prisma: done, pinned to `prisma@5.22.0` / `@prisma/client@5.22.0` (matches old
      repo's README note about pinning this version)
- [!] Run `npx prisma init` — **could not complete in this sandbox**: network egress here
      doesn't allow `binaries.prisma.sh` (Prisma's engine CDN), so the download step 403'd.
      Not a real blocker — this only affects my sandbox, not your machine.
- [x] Set provider to `postgresql` in `schema.prisma` — done (hand-written, since `init` failed)
- [ ] Create Prisma `db.ts` singleton client (`lib/db.ts`) — next up, see chat
- [x] Write schema for first 3 tables: `schools`, `users`, `academic_years` — done in
      `prisma/schema.prisma`, schema-only (not migrated — no live DB to migrate against yet)
- [x] Run first migration: `npx prisma migrate dev --name init` — **needs you**, once
      `DATABASE_URL` is real
- [x] Confirm tables exist in Neon dashboard — **needs you**

### 0.3 Redis — Upstash
- [ ] Create Upstash account + Redis database (`edutrack-dev`)
- [ ] Add `REDIS_URL` to `.env.local`
- [ ] Install: `npm install ioredis`
- [ ] Create `lib/redis.ts` singleton
- [ ] Test: write + read a key from a test API route

### 0.4 Authentication — NextAuth v5
- [ ] Install: `npm install next-auth@beta`
- [ ] Create `lib/auth/config.ts` with Credentials provider
- [ ] Create `app/api/auth/[...nextauth]/route.ts`
- [ ] Implement login page UI (`app/(auth)/login/page.tsx`)
- [ ] Add `NEXTAUTH_SECRET` to env
- [ ] Test: login with a hardcoded test user returns session
- [ ] Add `middleware.ts` — protect all `/admin`, `/teacher`, `/parent` routes
- [ ] Test: unauthenticated user redirected to `/login`

### 0.5 UI Foundation
- [ ] Install shadcn/ui: `npx shadcn-ui@latest init`
- [ ] Add components: Button, Input, Card, Table, Badge, Dialog, Toast
- [ ] Create dashboard layout shell (`app/(dashboard)/layout.tsx`)
- [ ] Create `Sidebar.tsx` with role-aware navigation (renders different links by role)
- [ ] Create `MobileNav.tsx` (hamburger menu for teacher/parent on mobile)
- [ ] Add Tailwind responsive breakpoints check (`sm`, `md`, `lg`)

### 0.6 CI/CD Pipeline
- [ ] Set up GitHub Actions workflow (`.github/workflows/ci.yml`)
  - [ ] On PR: run `tsc`, `eslint`, `vitest`
  - [ ] On merge to main: deploy to Vercel staging
- [ ] Connect repo to Vercel
- [ ] Add all env vars to Vercel dashboard (staging environment)
- [ ] First successful deployment to Vercel staging URL

**Phase 0 Sign-off Criteria:**
```
✓ Can log in as a test user and see the dashboard shell
✓ Database connected and migrations running
✓ Redis connected and responding
✓ CI pipeline passes on every PR
✓ App deployed to Vercel staging URL
```

---

## PHASE 1 — Core Foundation
> Goal: School setup, student enrolment, timetable creation, teacher attendance
> Target completion: End of Week 5

### 1.1 Complete Database Schema
- [ ] Add remaining tables to `schema.prisma`:
  - [ ] `terms`, `grades`, `streams`
  - [ ] `teachers`, `students`, `guardians`
  - [ ] `learning_areas`, `strands`, `sub_strands`
  - [ ] `timetable_periods`, `timetable_slots`, `classroom_qr_tokens`
  - [ ] `teacher_attendance`
  - [ ] `student_daily_attendance`, `student_lesson_attendance`
  - [ ] `audit_logs`
- [ ] Run migration: `npx prisma migrate dev --name full-schema`
- [ ] Add all indexes from `SYSTEM_DESIGN.md §4`
- [ ] Write seed file (`prisma/seed.ts`):
  - [ ] Seed CBC learning areas for all stages
  - [ ] Seed grades (PP1, PP2, Grade 1–9)
  - [ ] Seed default timetable periods (8 periods)
  - [ ] Seed 1 test school with admin user
- [ ] Run seed: `npx prisma db seed`
- [ ] Install Zod: `npm install zod`

### 1.2 School Setup Module
- [ ] School settings page (`app/(dashboard)/admin/settings/school/page.tsx`)
  - [ ] Edit school name, phone, email, logo
  - [ ] Upload logo → AWS S3 (or Cloudinary for now)
- [ ] Geofence setup page (`app/(dashboard)/admin/settings/geofence/page.tsx`)
  - [ ] Display map with school pin (use free Leaflet.js — no API key needed)
  - [ ] Allow admin to set GPS coordinates manually or from browser geolocation
  - [ ] Slider to set geofence radius (50m–500m)
  - [ ] Save to `schools.latitude`, `schools.longitude`, `schools.geofence_radius`
- [ ] Academic calendar setup:
  - [ ] Create academic year
  - [ ] Create 3 terms with start/end dates
  - [ ] Mark current term

### 1.3 Grade & Stream Management
- [ ] Grades list page — shows PP1 → Grade 9
- [ ] Streams management:
  - [ ] Add/rename streams per grade (A, B, C or Nyota, Jua, etc.)
  - [ ] Set stream capacity
- [ ] API routes: `GET/POST /api/grades`, `GET/POST /api/streams`

### 1.4 Student Enrolment
- [ ] Student list page with TanStack Table
  - [ ] Search by name, NEMIS number, admission number
  - [ ] Filter by grade + stream
  - [ ] Pagination (50 per page)
- [ ] New student form:
  - [ ] Fields: First name, Last name, NEMIS number, Admission number, DOB, Gender
  - [ ] Stream assignment
  - [ ] Boarding status
  - [ ] Photo upload
- [ ] Student profile page:
  - [ ] Personal details (editable by admin)
  - [ ] Assigned stream + class teacher
  - [ ] Guardian list
- [ ] Guardian link page:
  - [ ] Add guardian (name, phone, relationship)
  - [ ] Mark primary guardian
  - [ ] Admin approval workflow for guardian-student link
- [ ] Zod schema: `lib/validations/student.schema.ts`
- [ ] API routes: `GET/POST /api/students`, `GET/PUT /api/students/[id]`

### 1.5 Teacher Management
- [ ] Teacher list page
- [ ] New teacher form:
  - [ ] Fields: Name, National ID, TSC number, Employment type (TSC/BOM)
  - [ ] Assign as class teacher to a stream
  - [ ] Add learning area specialisations
- [ ] Create teacher user account (auto-generates temp password, sends SMS)
- [ ] API routes: `GET/POST /api/teachers`, `GET/PUT /api/teachers/[id]`

### 1.6 Timetable Builder
- [ ] Timetable configuration:
  - [ ] Define periods (name, start time, end time, is_break)
  - [ ] Default 8-period day pre-seeded
- [ ] Timetable grid UI:
  - [ ] Grid: rows = periods, columns = days (Mon–Fri)
  - [ ] Filter by: stream (view a class's week) or teacher (view a teacher's week)
  - [ ] Click empty cell → slot assignment modal
  - [ ] Slot modal: select learning area + teacher
  - [ ] Real-time conflict detection (highlight red if conflict)
  - [ ] Conflict types: teacher double-booked, stream double-booked
- [ ] Publish timetable (makes it visible to teachers)
- [ ] API routes:
  - [ ] `GET /api/timetable/[termId]`
  - [ ] `POST /api/timetable/slot` (with conflict check)
  - [ ] `DELETE /api/timetable/slot/[id]`
- [ ] Teacher view: `GET /api/timetable/teacher/today` — returns only their slots

### 1.7 BullMQ Setup
- [ ] Install: `npm install bullmq`
- [ ] Create queue definitions (`lib/queue/index.ts`)
- [ ] Create workers directory (`workers/index.ts`)
- [ ] Add `package.json` script: `"workers": "tsx workers/index.ts"`
- [ ] Attendance worker: processes check-in events → writes to DB
- [ ] Test: enqueue a job, confirm worker picks it up and writes to DB

### 1.8 Teacher Attendance — Geofence + QR
- [ ] QR token generation:
  - [ ] Cron job (BullMQ scheduler): generate tokens for each slot 5 minutes before period
  - [ ] Token = HMAC-SHA256 signed, stored in `classroom_qr_tokens`
  - [ ] Expires 10 minutes after period start
  - [ ] `GET /api/timetable/qr/[slotId]` — returns current valid token as QR data
- [ ] Geofence helper (`lib/geofence/check.ts`):
  - [ ] Haversine distance formula (TypeScript)
  - [ ] Returns distance in metres + boolean isInsideGeofence
- [ ] Teacher check-in UI (`app/(dashboard)/teacher/page.tsx`):
  - [ ] Shows today's timetable slots
  - [ ] Each slot has "Check In" button (active only within 5 minutes of period start)
  - [ ] "Check In" flow:
    1. Browser geolocation request → haversine check (client preview)
    2. Camera opens for QR scan (use `jsQR` library — no native app needed)
    3. Submit: `POST /api/attendance/teacher` with `{ slotId, qrToken, latitude, longitude }`
  - [ ] Server validates: geofence + QR token + time window
  - [ ] On success: "✓ Checked in at 8:03 AM — Room 7" 
  - [ ] Lesson notes field: teacher adds brief lesson summary
- [ ] Admin attendance dashboard:
  - [ ] Today's view: all slots, traffic light status (green=checked in, red=absent, grey=pending)
  - [ ] Alert list: periods starting in 5 minutes with no teacher check-in
  - [ ] API: `GET /api/attendance/teacher?date=today`

**Phase 1 Sign-off Criteria:**
```
✓ Can create a school with geofence, grades, streams
✓ Can enrol 10 students with guardians
✓ Can add 5 teachers with learning area assignments
✓ Timetable built for one class with conflict detection working
✓ Teacher can check in via geofence + QR on mobile browser
✓ Admin sees real-time check-in status on dashboard
✓ BullMQ workers processing attendance jobs
```

---

## PHASE 2 — Parent App & Fee Management
> Goal: Parent dashboard, student attendance, MPesa integration
> Target completion: End of Week 9

### 2.1 Student Attendance — Lesson Register
- [ ] Teacher register UI (`app/(dashboard)/teacher/attendance/[slotId]/page.tsx`):
  - [ ] Load class list from timetable slot → stream → students
  - [ ] Each student row: Present / Absent toggle + reason dropdown
  - [ ] "Mark all present" shortcut button
  - [ ] Absent reasons: Sick | Parent pickup | School activity | Unknown
  - [ ] Submit register → `POST /api/attendance/student` (queued)
  - [ ] Once submitted → locked (admin can unlock to edit)
- [ ] Gate arrival scan:
  - [ ] `POST /api/attendance/gate` — student QR scan at school entrance
  - [ ] Updates `student_daily_attendance.arrived_at`
  - [ ] (For pilot: can be manual time entry by receptionist instead of scanner)
- [ ] Attendance worker: on "Unknown absence" → queues parent SMS notification

### 2.2 Offline Support — PWA
- [ ] Install: `npm install next-pwa`
- [ ] Configure `next.config.ts` for service worker
- [ ] Create `public/manifest.json` (app name, icons, theme color)
- [ ] Service worker caching strategy:
  - [ ] Cache-first: timetable, student list, UI assets
  - [ ] Queue-first: attendance submission (IndexedDB → sync on reconnect)
- [ ] Create `components/layout/OfflineBanner.tsx` — appears when offline
- [ ] IndexedDB schema for pending attendance (use `idb` library)
- [ ] Background sync: flush pending attendance when online
- [ ] Test: mark attendance with flight mode on → reconnect → verify DB updated

### 2.3 Parent Portal — Dashboard
- [ ] Parent login (phone number + OTP via SMS for parents without password)
- [ ] Today's child summary (`app/(dashboard)/parent/page.tsx`):
  - [ ] Arrival time (from gate scan)
  - [ ] Lesson-by-lesson attendance list
  - [ ] Absent lessons with reason
  - [ ] Teacher notes for the day
- [ ] Attendance history page:
  - [ ] Calendar view: green = present, red = absent, yellow = partial
  - [ ] Click day → see lesson detail
- [ ] API: `GET /api/attendance/parent/[studentId]?date=today`
- [ ] If parent has multiple children → child switcher at top
- [ ] Mobile-first CSS: all parent pages look good on 360px width

### 2.4 Fee Structure Setup (Bursar)
- [ ] Fee structure builder (`app/(dashboard)/bursar/fees/structure/page.tsx`):
  - [ ] Select term
  - [ ] Add fee items (name, amount, mandatory Y/N)
  - [ ] Separate sections: core fees, optional activities
  - [ ] Set discount rules (e.g. "10% sibling discount")
- [ ] Assign fee structure to students:
  - [ ] Bulk assign by stream
  - [ ] Individual overrides (bursary amounts)
- [ ] API: `POST /api/fees/structure`, `POST /api/fees/assign`

### 2.5 MPesa Integration
- [ ] Install Africa's Talking SDK (for sandbox testing too): `npm install africastalking`
- [ ] Create Daraja API client (`lib/mpesa/daraja.ts`):
  - [ ] Auth token generation (cached in Redis — tokens last 1 hour)
  - [ ] STK Push function
  - [ ] Callback verification
- [ ] STK Push endpoint: `POST /api/fees/mpesa/stk-push`
  - [ ] Validate amount, student, term
  - [ ] Call Daraja STK Push
  - [ ] Store pending payment record
  - [ ] Return `{ message: "Check your phone for the MPesa prompt" }`
- [ ] Callback webhook: `POST /api/webhooks/mpesa`
  - [ ] Verify Safaricom IP (allowlist)
  - [ ] Extract: amount, MPesa code, phone, name
  - [ ] Enqueue payment recording job
  - [ ] Payment worker: write to `fee_payments`, update balance cache, send FCM push
- [ ] Manual payment entry (Bursar):
  - [ ] Form: student, amount, method (cash/bank/cheque), reference
  - [ ] Bursar can record payments received outside the app
- [ ] Parent fee view (`app/(dashboard)/parent/[studentId]/fees/page.tsx`):
  - [ ] Balance per fee item
  - [ ] Payment history with MPesa codes
  - [ ] "Pay via MPesa" button (triggers STK Push to parent's registered phone)
- [ ] Bursar defaulters view:
  - [ ] List: student name, stream, total due, total paid, balance
  - [ ] "Send reminder SMS" per student or bulk
  - [ ] Export to PDF

### 2.6 Co-curricular Activities
- [ ] Activities management (Admin):
  - [ ] Create activity (name, fee, capacity, description)
  - [ ] Enrol student into activity
- [ ] Parent can see child's enrolled activities + fee status
- [ ] Activity fee appears in fee balance breakdown

**Phase 2 Sign-off Criteria:**
```
✓ Teacher marks student lesson attendance, parent sees it within 5 minutes
✓ Parent app works on Tecno Spark (test on low-end Android)
✓ Teacher marks attendance offline → syncs when online → parent notified
✓ MPesa STK Push works in sandbox: parent pays → balance updates → push notification
✓ Bursar can record manual payment and see defaulters list
✓ Parent sees itemised fee balance with payment history
```

---

## PHASE 3 — CBC Results & Communication
> Goal: Assessment entry, CBC rubric scoring, parent-teacher messaging
> Target completion: End of Week 12

### 3.1 Assessment Management (Teacher)
- [ ] Assessment list page (`app/(dashboard)/teacher/markbook/page.tsx`):
  - [ ] View all assessments for their learning areas
  - [ ] Filter by stream, term
- [ ] Create assessment:
  - [ ] Fields: title, type (CAT/exam/assignment/project), date, max marks, weight %
  - [ ] Select stream + learning area
  - [ ] Optional: link to specific strands
- [ ] API: `POST /api/results/assessment`

### 3.2 CBC Rubric Marks Entry
- [ ] Marks entry UI (`app/(dashboard)/teacher/markbook/[assessmentId]/page.tsx`):
  - [ ] Table: one row per student
  - [ ] For non-rubric: number input (marks out of max)
  - [ ] For CBC rubric: per sub-strand dropdown (EE/ME/AE/BE)
  - [ ] Teacher comment field per student
  - [ ] Auto-save (debounced, every 2 seconds of inactivity)
  - [ ] "Publish to parents" button (admin must also approve for major exams)
- [ ] API: `POST /api/results/marks` (bulk upsert)
- [ ] API: `POST /api/results/publish/[assessmentId]`

### 3.3 Parent Results View
- [ ] Results page (`app/(dashboard)/parent/[studentId]/results/page.tsx`):
  - [ ] List assessments by term
  - [ ] Click assessment → view rubric breakdown
  - [ ] Teacher comment displayed
  - [ ] CBC rubric displayed as coloured badges (EE=green, ME=blue, AE=yellow, BE=red)
  - [ ] Only published assessments visible to parent

### 3.4 Term Report Generation
- [ ] Term report form (Class teacher):
  - [ ] Class teacher comment
  - [ ] Conduct rating
  - [ ] Attendance summary (auto-populated)
- [ ] Admin: principal comment + publish report
- [ ] PDF generation:
  - [ ] Install: `npm install @react-pdf/renderer`
  - [ ] CBC-formatted report card template
  - [ ] Upload generated PDF to S3
  - [ ] Parent can download from their portal
- [ ] API: `POST /api/results/reports/generate`

### 3.5 Messaging System
- [ ] Message compose (Teacher → parent of specific student):
  - [ ] Teacher selects student → automatically addresses parent
  - [ ] 500 character limit (keeps it focused)
  - [ ] In-app delivery + SMS only if parent has no app
- [ ] Message compose (Admin → class or school-wide):
  - [ ] Select recipients: whole school | specific grade | specific stream
  - [ ] Preview SMS character count
  - [ ] Confirm send (shows cost estimate in SMS units)
- [ ] Message inbox (Parent):
  - [ ] Chronological list
  - [ ] Read/unread indicator
  - [ ] Reply to class teacher only (not subject teachers directly)
- [ ] API: `POST /api/messages`, `GET /api/messages/[userId]`

### 3.6 SMS Integration — Africa's Talking
- [ ] Africa's Talking account setup (get API key)
- [ ] Create `lib/sms/africastalking.ts` client
- [ ] SMS worker (`lib/queue/workers/sms.worker.ts`):
  - [ ] Dequeues SMS jobs
  - [ ] Checks if recipient has app (skip if they do, unless high-priority)
  - [ ] Sends via Africa's Talking
  - [ ] Logs to `messages` table with `sms_message_id`
  - [ ] Deducts from `schools.sms_balance`
- [ ] SMS templates:
  - [ ] Attendance alert: "Amara was absent from Mathematics at 10AM. Reason: Unknown. Contact school: 0722XXXXXX"
  - [ ] Fee reminder: "Amara fee balance: KES 2,000 due 15 Feb. Pay: [link] or MPesa till XXXXX"
  - [ ] Result published: "Amara's Term 1 results are ready. View: [link]"
  - [ ] Welcome (new parent): "Welcome to EduTrack. Your login: [link] Temp password: XXXX"

### 3.7 Push Notifications — Firebase
- [ ] Firebase project setup
- [ ] Install: `npm install firebase-admin`
- [ ] Notification worker (`lib/queue/workers/notification.worker.ts`)
- [ ] Client-side: request notification permission in parent app
- [ ] Store FCM token in `users.device_tokens[]`
- [ ] Send push for: attendance alerts, messages, result publications, payment confirmations

**Phase 3 Sign-off Criteria:**
```
✓ Teacher enters CBC rubric scores for a class — parent sees them after publish
✓ Term report card PDF generated and downloadable by parent
✓ Teacher sends message to parent → parent receives in-app + SMS if no app
✓ Admin sends broadcast to a whole grade → all parents notified
✓ SMS cost deducted from school balance correctly
✓ Payment confirmation push notification arrives within 60 seconds
```

---

## PHASE 4 — Import / Export
> Goal: Bulk data operations, CSV import, all report exports
> Target completion: End of Week 13

### 4.1 Student CSV Import
- [ ] Import page (`app/(dashboard)/admin/students/import/page.tsx`):
  - [ ] Download CSV template button
  - [ ] File upload (drag-and-drop)
  - [ ] Validation preview table: show valid rows (green) and errors (red with reason)
  - [ ] Error reasons: invalid NEMIS, duplicate, bad phone format, unknown grade
  - [ ] "Import X valid rows" confirm button
  - [ ] Progress bar during import
- [ ] Import worker:
  - [ ] Parse CSV with Papa Parse
  - [ ] Validate each row with Zod schema
  - [ ] Normalise phone numbers (07X → 254XXXXXXXXX)
  - [ ] Check NEMIS uniqueness against DB
  - [ ] Batch insert (transaction)
  - [ ] Create parent user accounts
  - [ ] Queue welcome SMS to each parent
- [ ] API: `POST /api/import/validate`, `POST /api/import/students`

### 4.2 Export Engine
- [ ] Attendance exports:
  - [ ] By class + date range → CSV
  - [ ] By student → CSV (parent-readable)
  - [ ] Teacher attendance by term → CSV
- [ ] Fee exports:
  - [ ] Daily collection report → CSV
  - [ ] Term collection summary → CSV
  - [ ] Defaulters list → PDF (print-ready)
- [ ] Results exports:
  - [ ] Class markbook → CSV
  - [ ] Student CBC portfolio → PDF
- [ ] API routes: `GET /api/export/[type]` with query params for filters
- [ ] All exports run via BullMQ export queue (not blocking API response)
  - [ ] API returns job ID
  - [ ] Client polls for completion
  - [ ] On complete → download link (S3 pre-signed URL or direct download)

**Phase 4 Sign-off Criteria:**
```
✓ Import 100 students via CSV with zero duplicates
✓ Invalid rows flagged with specific error messages
✓ Parent welcome SMS sent after import
✓ Export attendance report for a term → correct CSV downloaded
✓ Defaulters PDF generated and printable
```

---

## PHASE 5 — Hardening & Testing
> Goal: Production-ready security, performance, and reliability
> Target completion: End of Week 15

### 5.1 Security Hardening
- [ ] 2FA implementation:
  - [ ] Install: `npm install otpauth qrcode`
  - [ ] 2FA setup flow for admin and bursar accounts
  - [ ] TOTP validation on login
  - [ ] Backup codes generated and shown once
- [ ] Rate limiting:
  - [ ] Auth routes: 10 requests/minute per IP
  - [ ] All API routes: 100 requests/minute per user
  - [ ] Implement with Redis + custom middleware
- [ ] Device binding for teachers:
  - [ ] On first login: register device fingerprint
  - [ ] New device → OTP required (SMS to registered phone)
- [ ] MPesa callback IP allowlist (Safaricom IP ranges)
- [ ] Audit log review: confirm every sensitive action is logged
- [ ] HTTPS + HSTS header (`Strict-Transport-Security`)
- [ ] Security headers: CSP, X-Frame-Options, X-Content-Type-Options
- [ ] Dependency audit: `npm audit fix`

### 5.2 Performance Testing
- [ ] Install Vitest: `npm install -D vitest @testing-library/react`
- [ ] Unit tests:
  - [ ] Geofence calculation (haversine) — test with known coordinates
  - [ ] QR token generation + expiry validation
  - [ ] Fee balance calculation (with discounts)
  - [ ] CBC score average calculation
  - [ ] CSV row validation (valid + invalid cases)
- [ ] API integration tests:
  - [ ] Teacher check-in: valid → 202 | outside geofence → 403 | expired QR → 410
  - [ ] MPesa callback: valid payload → payment recorded | invalid → 400
  - [ ] Student import: 100 rows → all inserted | duplicate NEMIS → error returned
- [ ] Install Playwright: `npm install -D @playwright/test`
- [ ] E2E tests:
  - [ ] Teacher marks attendance → admin sees it on dashboard
  - [ ] Parent pays via MPesa → balance updates in parent portal
  - [ ] Teacher enters marks → parent sees results after publish
- [ ] Load test the 8AM scenario:
  - [ ] Simulate 200 concurrent attendance submissions
  - [ ] Verify queue absorbs spike without DB errors
  - [ ] All 200 events processed within 30 seconds

### 5.3 Error Handling & Monitoring
- [ ] Install Sentry: `npm install @sentry/nextjs`
- [ ] Configure Sentry DSN in env
- [ ] Add Sentry to API routes and workers
- [ ] Structured logging with Axiom (or Pino for self-hosted logs)
- [ ] BullMQ dead letter queue: capture failed jobs, alert admin
- [ ] Graceful degradation: if Redis is down → fallback to direct DB (degraded mode, no caching)
- [ ] Health check endpoint: `GET /api/health` → returns DB + Redis + queue status

### 5.4 Kenya Data Protection Act Compliance
- [ ] Consent capture at student enrolment (parent signs/acknowledges data usage)
- [ ] Data retention policy: student records held for 7 years after leaving
- [ ] Right to erasure: admin can anonymise a student record on request
- [ ] Document: what data is collected, why, who can see it (internal Data Processing Notice)
- [ ] No student data shared with third parties except MPesa (payment only)

### 5.5 Accessibility & UX Polish
- [ ] All forms keyboard navigable
- [ ] Error states on all form fields
- [ ] Loading states on all async actions
- [ ] Empty states (new school with no data — show onboarding prompts)
- [ ] Offline banner visible when PWA loses connection
- [ ] Test on actual low-end Android device (Tecno or Itel)
- [ ] Test with slow 3G throttling in Chrome DevTools
- [ ] Kiswahili localisation groundwork (label strings extracted to i18n file for future)

**Phase 5 Sign-off Criteria:**
```
✓ 2FA working for admin and bursar accounts
✓ Rate limiting blocks abuse without affecting normal use
✓ All unit tests passing (target: >80% coverage on core logic)
✓ All E2E tests passing
✓ Load test: 200 concurrent attendance submissions processed without error
✓ Sentry capturing errors in staging
✓ App usable on low-end Android with 3G connection
```

---

## PHASE 6 — Pilot Launch
> Goal: First real school live, data imported, staff trained
> Target completion: End of Week 16

### 6.1 Pre-Launch Checklist
- [ ] School signed agreement / MOU
- [ ] Pilot terms agreed (free for Term 1, feedback required)
- [ ] Production environment provisioned:
  - [ ] AWS RDS PostgreSQL created (af-south-1)
  - [ ] AWS ElastiCache Redis created
  - [ ] AWS S3 bucket created
  - [ ] Production env vars set
  - [ ] BullMQ workers deployed (Railway or ECS)
- [ ] MPesa Daraja production credentials obtained and tested
- [ ] Africa's Talking production account funded
- [ ] Domain name purchased and pointed to Vercel/ECS
- [ ] SSL certificate active
- [ ] Sentry alerts configured (email to you on errors)

### 6.2 Data Migration
- [ ] School provides:
  - [ ] Student list (Excel/CSV — you'll clean it)
  - [ ] Teacher list
  - [ ] Class/stream structure
  - [ ] Fee structure for current term
  - [ ] Parent phone numbers (for SMS invites)
- [ ] Import pipeline run on production DB
- [ ] Verify counts: students in → students in DB
- [ ] Admin account created for IT admin / secretary
- [ ] Bursar account created
- [ ] All teacher accounts created (SMS sent with temp passwords)

### 6.3 Staff Training
- [ ] 2-hour session with IT admin + principal:
  - [ ] School settings, geofence setup
  - [ ] Student management, guardian approval
  - [ ] Timetable building
  - [ ] User management
- [ ] 1-hour session with teachers (can be done class by class):
  - [ ] How to install PWA on their phone
  - [ ] How to check in (geofence + QR demo)
  - [ ] How to mark student register
  - [ ] How to message a parent
- [ ] 1-hour session with bursar:
  - [ ] Fee structure setup
  - [ ] Recording payments
  - [ ] Reading defaulters list
  - [ ] Export reports
- [ ] Create 1-page PDF "cheat sheet" for teachers (laminated)
- [ ] Create 1-page PDF "cheat sheet" for parents (sent via WhatsApp)

### 6.4 Parent Onboarding
- [ ] Send SMS to all parents: "Welcome to [School Name]'s new parent portal. Download the app: [link] or log in at [url]. Temp password: XXXX"
- [ ] Support WhatsApp number shared with school (for parents who struggle)
- [ ] First week: monitor login rates + follow up with school on non-registered parents

### 6.5 Go-Live Monitoring (Week 1)
- [ ] Day 1: be available from 7:30 AM (first check-in time)
- [ ] Monitor BullMQ dashboard: queue processing normally
- [ ] Monitor Sentry: no new errors
- [ ] Manually verify: 5 random teachers checked in → DB record correct
- [ ] Manually verify: 5 random students marked present → parent received notification
- [ ] Daily check-in call with school IT admin for first 5 days
- [ ] Document every bug found → fix within 24 hours during pilot

**Phase 6 Sign-off Criteria:**
```
✓ School live for 5 full school days without a critical bug
✓ >80% of teachers checking in via geofence + QR
✓ >60% of parents have downloaded/accessed the app
✓ MPesa payments processing correctly in production
✓ At least 1 fee payment made through the system
✓ Zero data loss incidents
```

---

## Ongoing / Post-Launch Backlog

These are confirmed future features — not forgotten, just de-scoped from pilot:

| Feature | Priority | Notes |
|---------|----------|-------|
| Substitute teacher auto-assignment suggestions | High | Phase 1.5 — after pilot feedback |
| Auto-timetable generation | High | Constraint satisfaction — complex, high value |
| NEMIS number validation via government API | Medium | If API is available publicly |
| Disciplinary records module | Medium | Schools will ask for this in week 2 |
| Library management | Low | Nice-to-have |
| Student medical records (full) | Medium | Needs extra security review |
| USSD fallback for feature phone parents | Medium | Africa's Talking supports USSD |
| Multi-school admin dashboard | High | Required before scaling beyond 5 schools |
| Multi-tenancy (shared infrastructure) | High | Phase 2 of business |
| Analytics dashboard (attendance trends, fee collection rates) | Medium | |
| Payroll module (BOM teachers) | Low | Separate product consideration |
| WhatsApp Business API integration | Medium | Cheaper than SMS, higher reach |
| Student self-portal (results, timetable) | Low | Grade 7–9 JSS students |
| Kiswahili full localisation | Medium | Rural school expansion |
| iOS parent app | Medium | Nairobi private schools have iPhone parents |

---

## Bugs & Issues Log

| Date | Issue | Severity | Status | Fixed |
|------|-------|----------|--------|-------|
| | | | | |

---

## Key Contacts & Resources

| Resource | Link/Detail |
|----------|-------------|
| Neon Dashboard | https://console.neon.tech |
| Vercel Dashboard | https://vercel.com/dashboard |
| Upstash Console | https://console.upstash.com |
| Africa's Talking Dashboard | https://account.africastalking.com |
| Daraja API Portal | https://developer.safaricom.co.ke |
| Firebase Console | https://console.firebase.google.com |
| AWS Console | https://console.aws.amazon.com |
| Sentry Dashboard | https://sentry.io |
| BullMQ Docs | https://docs.bullmq.io |
| Prisma Docs | https://www.prisma.io/docs |
| NextAuth v5 Docs | https://authjs.dev |

---

## Daily Dev Log

> Copy this block for each day you work

```
Date: ___________
Time spent: _____ hours
Phase / Section worked on: ___________

What I completed:
-
-

What blocked me:
-

What I'm doing next:
-

Questions/Decisions needed:
-
```

---

*Progress tracker version 1.0 | EduTrack Kenya | Update this file every session*