# EduTrack Kenya — System Design Document
> CBC-Native School Management Platform | Private Schools | Nairobi-First
> Stack: Next.js (App Router) · PostgreSQL (Neon → AWS RDS) · Prisma ORM · Redis · BullMQ · Africa's Talking · MPesa Daraja API
> Document version: 2.0 — Includes all 15 market-gap fixes

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Philosophy](#2-architecture-philosophy)
3. [Technology Stack](#3-technology-stack)
4. [Database Design — PostgreSQL Schema](#4-database-design)
5. [Project Structure — Next.js App Router](#5-project-structure)
6. [School Onboarding Wizard](#6-school-onboarding-wizard)
7. [Authentication & Guardian Access Model](#7-authentication--guardian-access-model)
8. [Academic Calendar Engine](#8-academic-calendar-engine)
9. [Attendance Engine](#9-attendance-engine)
10. [Notification Intelligence System](#10-notification-intelligence-system)
11. [Timetable Engine — Full Complexity](#11-timetable-engine)
12. [CBC Grading & Results Module — JSS Complete](#12-cbc-grading--results-module)
13. [Fee Management — Full Kenyan Reality](#13-fee-management)
14. [Student Lifecycle Management](#14-student-lifecycle-management)
15. [Teacher Performance & Substitute Engine](#15-teacher-performance--substitute-engine)
16. [Parent Communication System](#16-parent-communication-system)
17. [Offline-First Architecture](#17-offline-first-architecture)
18. [Queue & Event Architecture](#18-queue--event-architecture)
19. [API Design](#19-api-design)
20. [Caching Strategy](#20-caching-strategy)
21. [Import / Export Engine](#21-import--export-engine)
22. [Backup, Disaster Recovery & SLA](#22-backup-disaster-recovery--sla)
23. [Subscription & Billing Engine](#23-subscription--billing-engine)
24. [Deployment Architecture](#24-deployment-architecture)
25. [Environment Configuration](#25-environment-configuration)
26. [Security Checklist](#26-security-checklist)
27. [Performance Benchmarks & Targets](#27-performance-benchmarks--targets)

---

## 1. System Overview

### What We Are Building

A production-grade, CBC-native school management platform targeting private schools in Nairobi, Kenya. The system eliminates the gap between what happens in school and what parents know — in real time, reliably, at scale — while solving every operational pain point that causes Kenyan schools to reject or abandon digital systems.

### Core User Personas

| Persona | Primary Device | Key Pain Solved |
|---------|---------------|-----------------|
| School Admin / IT | Desktop/Laptop (Chrome) | Manual registers, fee chasing, report generation |
| Principal / Deputy | Tablet or Laptop | Real-time visibility, teacher accountability |
| Class Teacher | Android Phone (PWA) | Paper registers, no substitute alerts, lesson tracking |
| Subject Teacher | Android Phone (PWA) | No lesson tracking, no parent feedback loop |
| Bursar | Desktop | MPesa reconciliation, payment disputes, defaulters |
| Parent (smartphone) | Android App (<15MB) | Zero visibility into child's daily school life |
| Parent (basic phone) | SMS | Complete exclusion from school communication |

### Non-Negotiables (Updated)

- System works when internet is down (offline-first for teachers)
- MPesa payment reflects in parent dashboard within 60 seconds
- Teacher attendance cannot be faked from outside school premises
- Parent sees today's lesson-by-lesson attendance before 4PM every school day
- Zero data duplication — one student, one record, one source of truth
- Kenya Data Protection Act 2019 compliant from day one
- Non-technical IT admin can onboard a school in under 30 minutes without help
- Notification false alarms are architecturally prevented, not just warned against
- Fee carry-forward is automatic between terms — bursar never enters it manually
- Year-end student promotion runs as a single wizard, not 200 manual edits
- Payment disputes resolved with Daraja API lookup in under 60 seconds
- Exam timetable is a first-class concept — attendance engine knows the difference
- Teacher performance visible to principal in real time, not monthly

---

## 2. Architecture Philosophy

### Event-Driven, Queue-First Writes

Never write directly to the database from a user action. All mutations go through a job queue.

```
User Action → API Route → Validate → Enqueue Job → Return 202 Accepted
                                                          ↓
                                               Queue Worker picks up
                                                          ↓
                                               Write to PostgreSQL
                                                          ↓
                                               Invalidate Redis cache
                                                          ↓
                                               Dispatch notification
                                                          ↓
                                               Write to audit_log
```

### Notification Safety Buffer Architecture

Every parent notification passes through an intelligence layer before dispatch:

```
Attendance marked absent
        ↓
Wait 15-minute buffer (notification_buffer queue — delayed job)
        ↓
Check: has teacher corrected the mark? → YES → cancel job, no SMS
        ↓ NO
Check: is today a school_event_day? → YES → suppress (class trip, sports day)
        ↓ NO
Check: is this lesson in an exam timetable? → YES → suppress
        ↓ NO
Check: how many absences for this student today? → >1 → batch into summary
        ↓
Check: does parent prefer daily digest? → YES → hold until 3:30PM batch
        ↓ NO
Dispatch SMS/push notification
```

### Calendar-Aware Attendance

The attendance engine never generates records on non-school days. Every action checks `school_calendar_days` first.

---

## 3. Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 14 App Router | RSC reduces client JS, Route Handlers replace Express, Edge middleware for auth |
| Database (dev) | Neon PostgreSQL | Serverless Postgres, instant PR branches, free dev tier |
| Database (prod) | AWS RDS PostgreSQL 15 | Multi-AZ, read replicas, af-south-1 (Cape Town, ~40ms to Nairobi) |
| ORM | Prisma | Type-safe queries, migration management, JSONB support |
| Cache | Redis (Upstash dev → ElastiCache prod) | Timetables, sessions, fee balances, notification state, rate limiting |
| Job Queue | BullMQ | Redis-backed, delayed jobs (notification buffer), TypeScript-native, dashboard UI |
| Auth | NextAuth v5 (Auth.js) | App Router native, credentials + OTP, JWT sessions |
| File Storage | AWS S3 (af-south-1) | Report cards, student photos, imported CSVs, portfolio artefacts |
| SMS | Africa's Talking | Kenyan company, cheapest bulk rates, Safaricom/Airtel/Telkom reliable |
| Push Notifications | Firebase FCM | Free, reliable, Android-first |
| MPesa | Safaricom Daraja API | STK Push + C2B + transaction query (for dispute resolution) |
| Email | Resend | Modern API, free tier, Next.js native |
| Validation | Zod | Shared client/server schemas |
| State (client) | Zustand | Lightweight, RSC-compatible |
| UI | shadcn/ui + Tailwind | Accessible, unstyled, fully customisable |
| Charts | Recharts | React-native, works in RSC |
| Tables | TanStack Table v8 | Virtual scrolling for 1000+ student lists |
| Forms | React Hook Form + Zod | Performance-first, excellent validation |
| Maps | Leaflet.js | Free, no API key, sufficient for geofence setup |
| PDF Generation | @react-pdf/renderer | Report cards, receipts, defaulter lists |
| CSV Processing | Papa Parse | Import parsing, export generation |
| QR Scanning | jsQR | Browser-native QR scanning, no native app needed |
| Offline DB (client) | idb (IndexedDB wrapper) | Pending attendance queue for PWA |
| Testing | Vitest + Playwright | Unit + E2E |
| CI/CD | GitHub Actions + Vercel | PR checks + staging deploys |
| Hosting (prod) | AWS ECS Fargate | Auto-scaling containers |
| Monitoring | Sentry + Axiom | Errors + structured logs |
| PWA | next-pwa | Service worker for teacher offline mode |

### Why PostgreSQL over MySQL

- Native UUID, JSONB (CBC rubric/portfolio data), array columns (device tokens)
- Row-level security (future multi-tenant DB isolation)
- `pg_trgm` for fuzzy name matching (deduplication on import)
- `GENERATED ALWAYS AS` computed columns for receipt numbers
- Superior Prisma ecosystem support

---

## 4. Database Design — PostgreSQL Schema

### Design Principles

- UUIDs as primary keys everywhere
- `created_at` / `updated_at` on every table
- Soft deletes (`deleted_at`) — no student/teacher data ever hard deleted
- Audit log captures every write: who, what, when, old value, new value
- NEMIS number is the immutable business key for students
- Calendar-awareness baked in — attendance only exists on `school_calendar_days`

### Complete Schema

```sql
-- ============================================================
-- SCHOOL
-- ============================================================
CREATE TABLE schools (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    VARCHAR(200) NOT NULL,
  knec_code               VARCHAR(20) UNIQUE,
  address                 TEXT,
  county                  VARCHAR(50),
  sub_county              VARCHAR(50),
  latitude                DECIMAL(10,8),
  longitude               DECIMAL(11,8),
  geofence_radius         INTEGER DEFAULT 150,         -- metres
  phone                   VARCHAR(20),
  email                   VARCHAR(100),
  logo_url                TEXT,
  onboarding_completed    BOOLEAN DEFAULT FALSE,
  onboarding_step         INTEGER DEFAULT 0,           -- wizard progress
  subscription_status     VARCHAR(20) DEFAULT 'trial', -- trial|active|suspended|grace
  subscription_expires_at TIMESTAMPTZ,
  grace_period_ends_at    TIMESTAMPTZ,                 -- 7 days after expiry
  sms_balance             INTEGER DEFAULT 0,
  settings                JSONB DEFAULT '{}',          -- notification prefs, etc.
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ
);

-- ============================================================
-- ACADEMIC CALENDAR
-- ============================================================
CREATE TABLE academic_years (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id),
  name        VARCHAR(20) NOT NULL,                    -- "2025"
  is_current  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE terms (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  term_number      INTEGER NOT NULL,                   -- 1, 2, 3
  name             VARCHAR(50),                        -- "Term 1 2025"
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  mid_term_start   DATE,                               -- mid-term break start
  mid_term_end     DATE,                               -- mid-term break end
  is_current       BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Every day the school operates or doesn't — attendance only on school days
CREATE TABLE school_calendar_days (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id),
  term_id     UUID REFERENCES terms(id),
  date        DATE NOT NULL,
  day_type    VARCHAR(30) NOT NULL,
  -- school_day | holiday | mid_term_break | exam_day | event_day |
  -- sports_day | open_day | closure | teacher_pd_day
  event_name  VARCHAR(100),                            -- "Sports Day", "Mashujaa Day"
  timetable_type VARCHAR(20) DEFAULT 'normal',         -- normal | exam | event | none
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, date)
);

-- Exam timetable slots (completely separate from normal timetable)
CREATE TABLE exam_timetable_slots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id),
  term_id          UUID NOT NULL REFERENCES terms(id),
  stream_id        UUID NOT NULL REFERENCES streams(id),
  learning_area_id UUID NOT NULL REFERENCES learning_areas(id),
  invigilator_id   UUID REFERENCES teachers(id),
  date             DATE NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  room             VARCHAR(50),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- GRADES & STREAMS
-- ============================================================
CREATE TABLE grades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id),
  name        VARCHAR(20) NOT NULL,                    -- "Grade 5", "PP1", "JSS Grade 7"
  level       INTEGER NOT NULL,                        -- PP1=0, PP2=1, G1=2 ... G9=10
  cbc_stage   VARCHAR(20),
  -- lower_primary | upper_primary | jss
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE streams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id),
  grade_id    UUID NOT NULL REFERENCES grades(id),
  name        VARCHAR(10) NOT NULL,                    -- "A", "Nyota"
  capacity    INTEGER DEFAULT 40,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(grade_id, name)
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES schools(id),
  email               VARCHAR(200) UNIQUE,
  phone               VARCHAR(20),                     -- 254XXXXXXXXX
  password_hash       TEXT,
  role                VARCHAR(30) NOT NULL,
  -- admin|deputy|teacher|bursar|parent|it_admin
  first_name          VARCHAR(100) NOT NULL,
  last_name           VARCHAR(100) NOT NULL,
  national_id         VARCHAR(20) UNIQUE,
  is_active           BOOLEAN DEFAULT TRUE,
  last_login_at       TIMESTAMPTZ,
  two_fa_enabled      BOOLEAN DEFAULT FALSE,
  two_fa_secret       TEXT,                            -- AES-256 encrypted TOTP
  two_fa_backup_codes TEXT[],                          -- hashed backup codes
  device_tokens       TEXT[],                          -- FCM push tokens
  registered_device_id VARCHAR(200),                  -- for teacher device binding
  has_app_installed   BOOLEAN DEFAULT FALSE,           -- track if parent has app
  notification_pref   VARCHAR(20) DEFAULT 'immediate',
  -- immediate | daily_digest | none
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

-- ============================================================
-- TEACHERS
-- ============================================================
CREATE TABLE teachers (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL UNIQUE REFERENCES users(id),
  school_id               UUID NOT NULL REFERENCES schools(id),
  tsc_number              VARCHAR(20) UNIQUE,
  employment_type         VARCHAR(20) DEFAULT 'bom',   -- tsc | bom
  specialisation          VARCHAR(200),                -- "Mathematics, Science & Tech"
  is_class_teacher        BOOLEAN DEFAULT FALSE,
  class_teacher_stream_id UUID REFERENCES streams(id),
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Non-teaching duties (gate duty, games supervision, invigilation rotation)
CREATE TABLE teacher_duties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id),
  teacher_id  UUID NOT NULL REFERENCES teachers(id),
  duty_type   VARCHAR(50) NOT NULL,
  -- gate_duty | games_supervision | library | invigilation
  date        DATE NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STUDENTS
-- ============================================================
CREATE TABLE students (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES schools(id),
  nemis_number        VARCHAR(20) UNIQUE NOT NULL,
  admission_number    VARCHAR(20),
  first_name          VARCHAR(100) NOT NULL,
  last_name           VARCHAR(100) NOT NULL,
  date_of_birth       DATE,
  gender              VARCHAR(10),
  stream_id           UUID NOT NULL REFERENCES streams(id),
  enrollment_date     DATE DEFAULT CURRENT_DATE,
  is_boarding         BOOLEAN DEFAULT FALSE,
  photo_url           TEXT,
  medical_notes       TEXT,                            -- AES-256 encrypted
  -- JSS-specific fields
  transition_score    DECIMAL(5,2),                   -- Grade 6→7 placement score
  -- Status tracking
  status              VARCHAR(20) DEFAULT 'active',
  -- active | transferred_out | graduated | withdrawn | deceased
  leaving_date        DATE,
  leaving_reason      VARCHAR(50),
  leaving_certificate_ref VARCHAR(50),
  previous_school     VARCHAR(200),                   -- for transfers in
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

-- ============================================================
-- GUARDIANS
-- ============================================================
CREATE TABLE guardians (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id),
  student_id          UUID NOT NULL REFERENCES students(id),
  relationship        VARCHAR(30),
  -- father|mother|guardian|aunt|uncle|grandparent|sibling
  is_primary          BOOLEAN DEFAULT FALSE,
  can_pickup          BOOLEAN DEFAULT TRUE,
  verified            BOOLEAN DEFAULT FALSE,
  verified_at         TIMESTAMPTZ,
  verified_by         UUID REFERENCES users(id),
  -- Legal / access restrictions
  has_restricted_access  BOOLEAN DEFAULT FALSE,
  access_restriction_note TEXT,                       -- court order details (encrypted)
  is_active           BOOLEAN DEFAULT TRUE,           -- can be deactivated (e.g. deceased)
  deactivated_at      TIMESTAMPTZ,
  deactivated_by      UUID REFERENCES users(id),
  deactivation_reason VARCHAR(50),
  -- Phone number change tracking
  previous_phones     TEXT[],                         -- history of old numbers
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, student_id)
);

-- ============================================================
-- CBC LEARNING AREAS
-- ============================================================
CREATE TABLE learning_areas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id),
  name        VARCHAR(100) NOT NULL,
  code        VARCHAR(20),
  cbc_stage   VARCHAR(20),
  -- lower_primary|upper_primary|jss
  is_jss_area BOOLEAN DEFAULT FALSE,
  -- JSS-only: Pre-Tech, Agriculture, Business, Home Science, etc.
  color       VARCHAR(7),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Strands per learning area
CREATE TABLE strands (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_area_id UUID NOT NULL REFERENCES learning_areas(id),
  name             VARCHAR(100) NOT NULL,
  order_index      INTEGER DEFAULT 0
);

-- Sub-strands
CREATE TABLE sub_strands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strand_id   UUID NOT NULL REFERENCES strands(id),
  name        VARCHAR(200) NOT NULL,
  order_index INTEGER DEFAULT 0
);

-- ============================================================
-- TIMETABLE (Normal + Exam)
-- ============================================================
CREATE TABLE timetable_periods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id),
  name        VARCHAR(30) NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  is_break    BOOLEAN DEFAULT FALSE,
  order_index INTEGER NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE timetable_slots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id),
  term_id          UUID NOT NULL REFERENCES terms(id),
  stream_id        UUID NOT NULL REFERENCES streams(id),
  learning_area_id UUID NOT NULL REFERENCES learning_areas(id),
  teacher_id       UUID NOT NULL REFERENCES teachers(id),
  period_id        UUID NOT NULL REFERENCES timetable_periods(id),
  day_of_week      INTEGER NOT NULL,                  -- 1=Mon...5=Fri
  room             VARCHAR(50),
  is_double_lesson BOOLEAN DEFAULT FALSE,
  second_period_id UUID REFERENCES timetable_periods(id),  -- for double lessons
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(teacher_id, period_id, day_of_week, term_id),
  UNIQUE(stream_id, period_id, day_of_week, term_id)
);

-- QR tokens: one per slot per lesson occurrence, time-bound
CREATE TABLE classroom_qr_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id),
  slot_id     UUID NOT NULL REFERENCES timetable_slots(id),
  token       VARCHAR(100) NOT NULL UNIQUE,
  valid_from  TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TEACHER ATTENDANCE
-- ============================================================
CREATE TABLE teacher_attendance (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id),
  teacher_id            UUID NOT NULL REFERENCES teachers(id),
  slot_id               UUID REFERENCES timetable_slots(id),   -- null on exam days
  exam_slot_id          UUID REFERENCES exam_timetable_slots(id),
  date                  DATE NOT NULL,
  checked_in_at         TIMESTAMPTZ,
  checked_out_at        TIMESTAMPTZ,
  check_in_lat          DECIMAL(10,8),
  check_in_lng          DECIMAL(11,8),
  geofence_passed       BOOLEAN DEFAULT FALSE,
  qr_scanned            BOOLEAN DEFAULT FALSE,
  status                VARCHAR(20) DEFAULT 'pending',
  -- pending|present|absent|covered|late
  minutes_late          INTEGER,                               -- null if on time
  absence_reason        VARCHAR(50),
  lesson_notes          TEXT,
  substitute_teacher_id UUID REFERENCES teachers(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(teacher_id, slot_id, date)
);

-- ============================================================
-- STUDENT ATTENDANCE
-- ============================================================
CREATE TABLE student_daily_attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id),
  student_id  UUID NOT NULL REFERENCES students(id),
  date        DATE NOT NULL,
  arrived_at  TIMESTAMPTZ,
  departed_at TIMESTAMPTZ,
  status      VARCHAR(20) DEFAULT 'absent',
  -- present|absent|late|half_day
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, date)
);

CREATE TABLE student_lesson_attendance (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            UUID NOT NULL REFERENCES schools(id),
  student_id           UUID NOT NULL REFERENCES students(id),
  slot_id              UUID REFERENCES timetable_slots(id),
  exam_slot_id         UUID REFERENCES exam_timetable_slots(id),
  date                 DATE NOT NULL,
  status               VARCHAR(20) NOT NULL,
  -- present|absent|late|excused
  absence_reason       VARCHAR(50),
  -- sick|activity|disciplinary|unknown|parent_pickup|event
  marked_by            UUID NOT NULL REFERENCES users(id),
  parent_notified      BOOLEAN DEFAULT FALSE,
  notification_held    BOOLEAN DEFAULT FALSE,   -- in buffer, not yet sent
  notification_job_id  VARCHAR(100),            -- BullMQ job ID (for cancellation)
  notification_sent_at TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, slot_id, date)
);

-- ============================================================
-- ASSESSMENTS & RESULTS
-- ============================================================
CREATE TABLE assessments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id),
  term_id          UUID NOT NULL REFERENCES terms(id),
  learning_area_id UUID NOT NULL REFERENCES learning_areas(id),
  stream_id        UUID NOT NULL REFERENCES streams(id),
  teacher_id       UUID NOT NULL REFERENCES teachers(id),
  title            VARCHAR(200) NOT NULL,
  type             VARCHAR(20) NOT NULL,
  -- cat|exam|assignment|portfolio|project|knec_external
  source           VARCHAR(20) DEFAULT 'internal',
  -- internal|knec (external KNEC assessments tracked separately)
  max_marks        DECIMAL(5,2),
  weight_percent   DECIMAL(5,2),
  assessment_date  DATE,
  due_date         DATE,
  instructions     TEXT,
  -- Workflow states
  status           VARCHAR(20) DEFAULT 'draft',
  -- draft|hod_review|published|locked
  submitted_for_review_at TIMESTAMPTZ,
  reviewed_by      UUID REFERENCES users(id),   -- HoD approval
  reviewed_at      TIMESTAMPTZ,
  published_at     TIMESTAMPTZ,
  locked_at        TIMESTAMPTZ,                 -- no edits after lock
  locked_by        UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE assessment_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id   UUID NOT NULL REFERENCES assessments(id),
  student_id      UUID NOT NULL REFERENCES students(id),
  marks_obtained  DECIMAL(5,2),
  teacher_comment TEXT,
  submitted_at    TIMESTAMPTZ,
  -- Lock state mirrors parent assessment
  is_locked       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(assessment_id, student_id)
);

-- CBC Rubric scores per sub-strand
CREATE TABLE rubric_scores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id     UUID NOT NULL REFERENCES assessment_results(id),
  sub_strand_id UUID NOT NULL REFERENCES sub_strands(id),
  score         VARCHAR(5) NOT NULL,           -- EE|ME|AE|BE
  comment       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(result_id, sub_strand_id)
);

-- JSS Portfolio artefacts (photos of projects, written reflections)
CREATE TABLE portfolio_artefacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES students(id),
  term_id       UUID NOT NULL REFERENCES terms(id),
  learning_area_id UUID NOT NULL REFERENCES learning_areas(id),
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  artefact_type VARCHAR(30),                   -- photo|document|video|reflection
  file_url      TEXT NOT NULL,                 -- S3 URL
  uploaded_by   UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Term report cards
CREATE TABLE term_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id),
  student_id            UUID NOT NULL REFERENCES students(id),
  term_id               UUID NOT NULL REFERENCES terms(id),
  stream_id             UUID NOT NULL REFERENCES streams(id),
  class_teacher_comment TEXT,
  principal_comment     TEXT,
  overall_score         DECIMAL(5,2),
  position              INTEGER,
  out_of                INTEGER,
  total_lessons         INTEGER,
  lessons_attended      INTEGER,
  conduct               VARCHAR(30),
  generated_at          TIMESTAMPTZ,
  pdf_url               TEXT,
  published_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, term_id)
);

-- ============================================================
-- FEE MANAGEMENT — FULL KENYAN REALITY
-- ============================================================
CREATE TABLE fee_structures (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id),
  term_id     UUID NOT NULL REFERENCES terms(id),
  name        VARCHAR(100) NOT NULL,
  applies_to  VARCHAR(20) DEFAULT 'all',        -- all|boarding|day
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fee_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_structure_id     UUID NOT NULL REFERENCES fee_structures(id),
  name                 VARCHAR(100) NOT NULL,
  amount               DECIMAL(12,2) NOT NULL,
  is_mandatory         BOOLEAN DEFAULT TRUE,
  is_optional_activity BOOLEAN DEFAULT FALSE,
  priority_order       INTEGER DEFAULT 0,
  -- Which items are paid first when partial payment received
  -- 1=tuition (highest), 2=lunch, 3=activity, etc.
  description          TEXT,
  order_index          INTEGER DEFAULT 0
);

CREATE TABLE student_fees (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id),
  student_id       UUID NOT NULL REFERENCES students(id),
  term_id          UUID NOT NULL REFERENCES terms(id),
  fee_item_id      UUID NOT NULL REFERENCES fee_items(id),
  amount_due       DECIMAL(12,2) NOT NULL,
  discount         DECIMAL(12,2) DEFAULT 0,
  discount_reason  VARCHAR(100),
  -- Types: bursary|sibling|scholarship|waiver|write_off
  discount_type    VARCHAR(30),
  discount_approved_by UUID REFERENCES users(id),
  prorated         BOOLEAN DEFAULT FALSE,       -- mid-term joiners
  prorate_start_date DATE,                      -- first day in school this term
  carry_forward_from_term_id UUID REFERENCES terms(id),  -- auto carry-forward
  carry_forward_amount DECIMAL(12,2) DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, term_id, fee_item_id)
);

-- Instalment plans
CREATE TABLE fee_instalments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id),
  student_id  UUID NOT NULL REFERENCES students(id),
  term_id     UUID NOT NULL REFERENCES terms(id),
  instalment_number INTEGER NOT NULL,
  amount_due  DECIMAL(12,2) NOT NULL,
  due_date    DATE NOT NULL,
  is_paid     BOOLEAN DEFAULT FALSE,
  paid_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fee_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id),
  student_id      UUID NOT NULL REFERENCES students(id),
  term_id         UUID NOT NULL REFERENCES terms(id),
  receipt_number  VARCHAR(20) NOT NULL UNIQUE,  -- sequential, school-prefixed
  amount          DECIMAL(12,2) NOT NULL,
  payment_method  VARCHAR(20) NOT NULL,          -- mpesa|bank|cash|cheque
  mpesa_code      VARCHAR(20) UNIQUE,
  mpesa_phone     VARCHAR(20),
  mpesa_name      VARCHAR(100),
  bank_reference  VARCHAR(100),
  paid_at         TIMESTAMPTZ NOT NULL,
  recorded_by     UUID REFERENCES users(id),     -- null = auto via STK
  notes           TEXT,
  -- Allocation: which fee items does this payment cover
  allocations     JSONB DEFAULT '[]',
  -- [{ fee_item_id, amount_allocated }]
  -- Reversal
  is_reversed     BOOLEAN DEFAULT FALSE,
  reversed_at     TIMESTAMPTZ,
  reversed_by     UUID REFERENCES users(id),
  reversal_reason TEXT,
  -- Overpayment
  overpayment_amount DECIMAL(12,2) DEFAULT 0,
  overpayment_action VARCHAR(20),               -- carry_forward|refund|credit
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Sequential receipt number generator (per school)
CREATE SEQUENCE receipt_seq START 1000;
-- receipt_number = school_prefix || LPAD(nextval, 6, '0')
-- e.g. "NKA-001247"

-- Payment disputes
CREATE TABLE payment_disputes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id),
  student_id        UUID NOT NULL REFERENCES students(id),
  raised_by         UUID NOT NULL REFERENCES users(id), -- parent
  mpesa_code_claimed VARCHAR(20),
  amount_claimed    DECIMAL(12,2),
  screenshot_url    TEXT,                         -- S3 URL of MPesa screenshot
  status            VARCHAR(20) DEFAULT 'open',   -- open|investigating|resolved|rejected
  daraja_lookup_result JSONB,                     -- raw Daraja transaction query response
  resolved_by       UUID REFERENCES users(id),
  resolved_at       TIMESTAMPTZ,
  resolution_note   TEXT,
  payment_id        UUID REFERENCES fee_payments(id), -- linked if resolved
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CO-CURRICULAR ACTIVITIES
-- ============================================================
CREATE TABLE activities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES schools(id),
  name         VARCHAR(100) NOT NULL,
  description  TEXT,
  fee_per_term DECIMAL(12,2) DEFAULT 0,
  max_capacity INTEGER,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE student_activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students(id),
  activity_id UUID NOT NULL REFERENCES activities(id),
  term_id     UUID NOT NULL REFERENCES terms(id),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  enrolled_by UUID REFERENCES users(id),
  UNIQUE(student_id, activity_id, term_id)
);

-- ============================================================
-- MESSAGING
-- ============================================================
CREATE TABLE messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES schools(id),
  sender_id    UUID NOT NULL REFERENCES users(id),
  recipient_id UUID REFERENCES users(id),         -- null for broadcast
  stream_id    UUID REFERENCES streams(id),
  subject      VARCHAR(200),
  body         TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'direct',
  -- direct|class|school_wide|automated
  sent_via     TEXT[],                             -- ['push','sms','in_app']
  read_at      TIMESTAMPTZ,
  sms_sent     BOOLEAN DEFAULT FALSE,
  sms_message_id VARCHAR(100),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  type        VARCHAR(50) NOT NULL,
  title       VARCHAR(200) NOT NULL,
  body        TEXT NOT NULL,
  data        JSONB DEFAULT '{}',
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG (append-only, immutable)
-- ============================================================
CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  school_id   UUID REFERENCES schools(id),
  actor_id    UUID REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,
  table_name  VARCHAR(50) NOT NULL,
  record_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
-- No UPDATE or DELETE ever on this table.

-- ============================================================
-- SUBSCRIPTION INVOICES (for school billing)
-- ============================================================
CREATE TABLE subscription_invoices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id),
  invoice_number VARCHAR(20) NOT NULL UNIQUE,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  amount        DECIMAL(12,2) NOT NULL,
  status        VARCHAR(20) DEFAULT 'unpaid',     -- unpaid|paid|void
  mpesa_code    VARCHAR(20),
  paid_at       TIMESTAMPTZ,
  pdf_url       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_students_school ON students(school_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_students_stream ON students(stream_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_students_nemis ON students(nemis_number);
CREATE INDEX idx_students_status ON students(school_id, status);
CREATE INDEX idx_student_lesson_att_date ON student_lesson_attendance(student_id, date);
CREATE INDEX idx_student_lesson_att_slot ON student_lesson_attendance(slot_id, date);
CREATE INDEX idx_student_lesson_notification ON student_lesson_attendance(notification_held, notification_job_id) WHERE notification_held = TRUE;
CREATE INDEX idx_teacher_att_date ON teacher_attendance(teacher_id, date);
CREATE INDEX idx_teacher_att_status ON teacher_attendance(school_id, date, status);
CREATE INDEX idx_fee_payments_student ON fee_payments(student_id, term_id);
CREATE INDEX idx_fee_payments_mpesa ON fee_payments(mpesa_code) WHERE mpesa_code IS NOT NULL;
CREATE INDEX idx_fee_disputes_status ON payment_disputes(school_id, status);
CREATE INDEX idx_slots_teacher ON timetable_slots(teacher_id, term_id);
CREATE INDEX idx_slots_stream ON timetable_slots(stream_id, term_id);
CREATE INDEX idx_calendar_days ON school_calendar_days(school_id, date, day_type);
CREATE INDEX idx_messages_recipient ON messages(recipient_id, created_at DESC);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at, created_at DESC);
CREATE INDEX idx_audit_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id, created_at DESC);
```

---

## 5. Project Structure — Next.js App Router

```
edutrack-kenya/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── onboarding/                       # School setup wizard (NEW)
│   │       ├── layout.tsx
│   │       ├── step-1-school/page.tsx         # Name, logo, contact
│   │       ├── step-2-geofence/page.tsx       # GPS capture (stand at gate)
│   │       ├── step-3-calendar/page.tsx       # Term dates, holidays
│   │       ├── step-4-grades/page.tsx         # Grade + stream setup
│   │       ├── step-5-fees/page.tsx           # Fee structure for current term
│   │       └── step-6-done/page.tsx           # Summary + first import prompt
│   │
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   │
│   │   ├── admin/
│   │   │   ├── page.tsx                       # Overview dashboard
│   │   │   ├── students/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [id]/page.tsx
│   │   │   │   ├── [id]/transfer/page.tsx     # Student transfer out (NEW)
│   │   │   │   ├── import/page.tsx
│   │   │   │   └── new/page.tsx
│   │   │   ├── teachers/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [id]/page.tsx
│   │   │   │   └── [id]/duties/page.tsx       # Duty schedule (NEW)
│   │   │   ├── timetable/
│   │   │   │   ├── page.tsx                   # Normal timetable builder
│   │   │   │   └── exam/page.tsx              # Exam timetable (NEW)
│   │   │   ├── attendance/
│   │   │   │   ├── page.tsx
│   │   │   │   └── reports/page.tsx
│   │   │   ├── calendar/page.tsx              # School calendar editor (NEW)
│   │   │   ├── promotion/page.tsx             # Year-end promotion wizard (NEW)
│   │   │   └── settings/
│   │   │       ├── school/page.tsx
│   │   │       ├── geofence/page.tsx
│   │   │       ├── academic/page.tsx
│   │   │       └── notifications/page.tsx     # Notification rules (NEW)
│   │   │
│   │   ├── bursar/
│   │   │   ├── page.tsx
│   │   │   ├── fees/
│   │   │   │   ├── structure/page.tsx
│   │   │   │   ├── payments/page.tsx
│   │   │   │   ├── record/page.tsx
│   │   │   │   └── disputes/page.tsx          # Payment disputes (NEW)
│   │   │   ├── mpesa/page.tsx
│   │   │   ├── instalments/page.tsx           # Instalment plans (NEW)
│   │   │   ├── carry-forward/page.tsx         # Term transition tool (NEW)
│   │   │   ├── activities/page.tsx
│   │   │   ├── receipts/[id]/page.tsx         # Printable receipt (NEW)
│   │   │   └── reports/page.tsx
│   │   │
│   │   ├── teacher/
│   │   │   ├── page.tsx                       # Today: timetable + duties
│   │   │   ├── attendance/
│   │   │   │   ├── [slotId]/page.tsx
│   │   │   │   └── history/page.tsx
│   │   │   ├── markbook/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [assessmentId]/page.tsx
│   │   │   │   └── new/page.tsx
│   │   │   └── messages/page.tsx
│   │   │
│   │   ├── deputy/                            # Deputy principal view (NEW)
│   │   │   ├── page.tsx                       # School-wide live dashboard
│   │   │   ├── teacher-performance/page.tsx   # Punctuality, completion rates
│   │   │   └── uncovered-lessons/page.tsx     # Real-time uncovered alert
│   │   │
│   │   └── parent/
│   │       ├── page.tsx
│   │       ├── [studentId]/
│   │       │   ├── attendance/page.tsx
│   │       │   ├── results/page.tsx
│   │       │   └── fees/page.tsx
│   │       ├── disputes/page.tsx              # Raise payment dispute (NEW)
│   │       ├── messages/page.tsx
│   │       └── settings/
│   │           ├── phone/page.tsx             # Update phone number (NEW)
│   │           └── notifications/page.tsx     # Notification preferences (NEW)
│   │
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── onboarding/route.ts                # Wizard progress save
│       ├── attendance/
│       │   ├── teacher/route.ts
│       │   ├── student/route.ts
│       │   ├── gate/route.ts
│       │   └── notification-cancel/route.ts   # Cancel buffered notification (NEW)
│       ├── timetable/
│       │   ├── route.ts
│       │   ├── exam/route.ts                  # Exam timetable CRUD (NEW)
│       │   └── qr/route.ts
│       ├── calendar/route.ts                  # School calendar CRUD (NEW)
│       ├── assessments/
│       │   ├── route.ts
│       │   └── [id]/
│       │       ├── results/route.ts
│       │       ├── review/route.ts            # HoD review endpoint (NEW)
│       │       ├── publish/route.ts
│       │       └── lock/route.ts              # Lock results (NEW)
│       ├── fees/
│       │   ├── route.ts
│       │   ├── payments/route.ts
│       │   ├── disputes/route.ts              # NEW
│       │   ├── carry-forward/route.ts         # NEW
│       │   ├── instalments/route.ts           # NEW
│       │   ├── receipts/[id]/route.ts         # NEW
│       │   └── mpesa/
│       │       ├── stk-push/route.ts
│       │       ├── callback/route.ts
│       │       └── query/route.ts             # Daraja transaction lookup (NEW)
│       ├── students/
│       │   ├── route.ts
│       │   ├── [id]/route.ts
│       │   └── transfer/route.ts              # Transfer workflow (NEW)
│       ├── promotion/route.ts                 # Year-end bulk promotion (NEW)
│       ├── guardian/
│       │   ├── route.ts
│       │   ├── [id]/deactivate/route.ts       # Deactivate guardian (NEW)
│       │   └── phone-update/route.ts          # Verified phone change (NEW)
│       ├── teacher-performance/route.ts       # NEW
│       ├── substitute/route.ts                # Substitute suggestion engine (NEW)
│       ├── messages/route.ts
│       ├── notifications/route.ts
│       ├── import/students/route.ts
│       ├── export/route.ts
│       ├── subscription/route.ts              # NEW
│       └── webhooks/mpesa/route.ts
│
├── components/
│   ├── ui/
│   ├── onboarding/
│   │   └── WizardShell.tsx
│   ├── attendance/
│   │   ├── TeacherCheckIn.tsx
│   │   ├── StudentRegister.tsx
│   │   ├── AttendanceSummaryCard.tsx
│   │   ├── DailyParentView.tsx
│   │   └── SanityWarning.tsx                  # "38/40 absent — confirm?" (NEW)
│   ├── timetable/
│   │   ├── TimetableGrid.tsx
│   │   ├── ExamTimetableGrid.tsx              # NEW
│   │   ├── SlotEditor.tsx
│   │   └── ConflictAlert.tsx
│   ├── fees/
│   │   ├── FeeBalanceCard.tsx
│   │   ├── PaymentHistory.tsx
│   │   ├── MpesaPayButton.tsx
│   │   ├── ReceiptPrint.tsx                   # NEW
│   │   ├── DisputeForm.tsx                    # NEW
│   │   └── CarryForwardSummary.tsx            # NEW
│   ├── results/
│   │   ├── CbcRubricGrid.tsx
│   │   ├── MarkbookTable.tsx
│   │   ├── ReportCardPreview.tsx
│   │   ├── PortfolioUploader.tsx              # NEW (JSS)
│   │   └── ResultModerationBadge.tsx          # NEW
│   ├── students/
│   │   └── TransferWizard.tsx                 # NEW
│   ├── teacher/
│   │   ├── PerformanceDashboard.tsx           # NEW
│   │   └── SubstituteSuggestions.tsx          # NEW
│   ├── calendar/
│   │   └── SchoolCalendarEditor.tsx           # NEW
│   └── layout/
│       ├── Sidebar.tsx
│       ├── MobileNav.tsx
│       └── OfflineBanner.tsx
│
├── lib/
│   ├── db.ts
│   ├── redis.ts
│   ├── queue/
│   │   ├── index.ts
│   │   └── workers/
│   │       ├── attendance.worker.ts
│   │       ├── notification.worker.ts         # includes buffer logic
│   │       ├── sms.worker.ts
│   │       ├── mpesa.worker.ts
│   │       ├── carry-forward.worker.ts        # NEW
│   │       └── promotion.worker.ts            # NEW
│   ├── mpesa/
│   │   ├── daraja.ts
│   │   ├── stk-push.ts
│   │   ├── callback-handler.ts
│   │   └── transaction-query.ts              # NEW — dispute resolution
│   ├── sms/africastalking.ts
│   ├── auth/
│   │   ├── config.ts
│   │   └── rbac.ts
│   ├── geofence/check.ts
│   ├── qr/token.ts
│   ├── notifications/
│   │   ├── intelligence.ts                    # NEW — buffer + suppression engine
│   │   └── templates.ts                       # SMS/push templates
│   ├── fees/
│   │   ├── allocation.ts                      # NEW — partial payment allocation
│   │   ├── carry-forward.ts                   # NEW — term-end balance transfer
│   │   └── receipt.ts                         # NEW — receipt number generator
│   ├── students/
│   │   └── promotion.ts                       # NEW — bulk promotion logic
│   ├── teacher/
│   │   └── performance.ts                     # NEW — punctuality/completion metrics
│   ├── export/csv.ts
│   ├── export/pdf.ts
│   ├── import/students.ts
│   └── validations/
│       ├── student.schema.ts
│       ├── attendance.schema.ts
│       └── fee.schema.ts
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── workers/index.ts
├── public/manifest.json
├── middleware.ts
└── next.config.ts
```

---

## 6. School Onboarding Wizard

A non-technical IT admin or school secretary must be able to onboard their school completely in under 30 minutes without calling you.

### Wizard Flow (6 Steps)

```
Step 1 — School Identity
  Fields: School name, KNEC code (optional), County, Sub-county,
          Phone, Email, Logo upload
  Validation: Name required. Logo optional but recommended.
  Saves to: schools table, onboarding_step = 1

Step 2 — Geofence Setup
  "Walk to the school gate and press the button below."
  Button: [📍 Capture My Location]
  Browser geolocation → lat/lng auto-filled
  Map preview shows pin + circle (Leaflet.js)
  Slider: adjust radius 50m–500m
  "Tip: Set radius to include the entire school compound."
  Saves to: schools.latitude, longitude, geofence_radius, step = 2

Step 3 — Academic Calendar
  Current year pre-filled (e.g. 2025)
  3 term cards: Term 1, Term 2, Term 3
  Each card: start date picker, end date picker
  Mid-term break dates (optional)
  Pre-populated with standard Kenya private school dates (editable)
  Saves to: academic_years, terms, step = 3

Step 4 — Grades & Streams
  Toggle which grades the school has (PP1 → Grade 9)
  For each selected grade: add stream names
  Default suggestion: "A, B" (editable to "Nyota, Jua, Mwanga")
  Capacity per stream (default 40)
  Saves to: grades, streams, step = 4

Step 5 — Fee Structure (Current Term)
  Select current term
  Add fee items one by one:
    [ Tuition Fee ........... KES [_______] Mandatory ✓ ]
    [ Lunch Fee ............. KES [_______] Mandatory ✓ ]
    [ Activity Fee .......... KES [_______] Optional  □ ]
    [+ Add Fee Item]
  Set priority order (drag to reorder — tuition always first)
  Saves to: fee_structures, fee_items, step = 5

Step 6 — Done
  Summary: "Your school is set up. Here's what's ready:"
  ✓ School profile created
  ✓ 3 terms configured
  ✓ X grades, Y streams ready
  ✓ Fee structure for Term N set
  Next steps (action buttons):
  [Import Students via CSV] [Add Teachers Manually] [Go to Dashboard]
  Marks: onboarding_completed = TRUE
```

### Wizard Resilience

- Progress saved after every step (can close browser and resume)
- On next login if `onboarding_completed = FALSE` → redirect to wizard at `onboarding_step`
- Cannot access main dashboard until wizard complete
- Admin can re-enter wizard from Settings anytime to update

---

## 7. Authentication & Guardian Access Model

### Standard Auth Flow

```
Login → NextAuth Credentials Provider
     → bcrypt verify (12 rounds)
     → Check school subscription (suspended? → read-only mode, not logout)
     → 2FA check (admin/bursar mandatory)
     → Issue JWT (15min access + 7day refresh, httpOnly cookie)
     → Log to audit_logs
```

### Guardian Edge Cases (All Handled)

**Shared phone number:**
Users can share a phone number but must have unique emails, OR use a family PIN (4-digit PIN set at onboarding, different from login OTP). When OTP is sent to a shared phone, any guardian on that number can enter it, but they only see their own linked children.

**Phone number change:**
```
Parent requests phone update in Settings
  → Enter new number
  → OTP sent to NEW number (verify it works)
  → OTP sent to OLD number ("confirm you authorise this change")
  → Both OTPs entered → number updated
  → Old number stored in users.previous_phones[]
  → SMS to old number: "Your EduTrack phone was updated. Not you? Call school."
  → Admin notified of the change (audit log + notification)
```

**Guardian deactivation (deceased, custody change):**
```
Admin navigates to Student → Guardians → [Guardian Name] → Deactivate
  → Select reason: deceased | custody_change | request | court_order
  → Confirm
  → guardian.is_active = FALSE, deactivated_at, deactivated_by set
  → All active sessions for that user immediately invalidated (Redis session blacklist)
  → SMS to school admin: "Guardian X deactivated for student Y — logged."
```

**Legal access restriction:**
```
Guardian record has: has_restricted_access = TRUE
                     access_restriction_note = "Court order ref. HC/2024/1234 — no location data"
Effect:
  → Guardian can see results and fees (normal)
  → Cannot see attendance location/time data
  → Cannot see daily arrival time
  → Admin sees warning badge on this guardian's profile
```

**Unmarried / divorced parents both needing access:**
Both parents get separate user accounts linked to the same student via guardians table. Each sees all the same data (unless restricted). Both receive notifications. Fee payments from either are recorded against the student.

### Role-Based Access Control

```typescript
export const ROLE_PERMISSIONS = {
  admin:    ['*'],
  deputy:   ['attendance:read', 'teacher_performance:read', 'results:read',
             'discipline:write', 'substitute:write'],
  teacher:  ['attendance:write', 'markbook:write', 'messages:write',
             'own_timetable:read'],
  bursar:   ['fees:*', 'payments:*', 'disputes:*'],
  parent:   ['own_child:read', 'messages:write', 'fees:pay', 'disputes:raise'],
  it_admin: ['school:settings', 'import:write', 'export:read', 'users:manage'],
} as const;
```

---

## 8. Academic Calendar Engine

### How It Works

Every attendance-related operation checks `school_calendar_days` before executing. Attendance records are never created for non-school days.

```typescript
// lib/calendar/check.ts
async function isSchoolDay(schoolId: string, date: Date): Promise<CalendarDay | null> {
  const day = await db.schoolCalendarDays.findUnique({
    where: { school_id_date: { school_id: schoolId, date } }
  });
  // Returns null if date not in calendar (also treated as non-school day)
  return day?.day_type === 'school_day' ? day : null;
}

async function getTimetableType(schoolId: string, date: Date): Promise<string> {
  const day = await db.schoolCalendarDays.findUnique({
    where: { school_id_date: { school_id: schoolId, date } }
  });
  return day?.timetable_type ?? 'none'; // 'normal' | 'exam' | 'event' | 'none'
}
```

### Bulk Closure Tool

```
Admin action: "Close school today from 12PM"
  → System marks all afternoon periods on today as cancelled
  → timetable_type for today's calendar_day updated to 'partial_closure'
  → All pending absence notifications for afternoon cancelled (BullMQ job IDs)
  → One broadcast notification to all parents:
    "School closes at 12PM today due to [reason]. Students should be collected by 12:30PM."
```

### Event Day Attendance

```
Sports Day / Open Day / Music Festival:
  → calendar_day.day_type = 'event_day'
  → calendar_day.timetable_type = 'event'
  → Student attendance marked as: status = 'present' (event)
  → Normal lesson attendance NOT generated
  → No absence notifications fire
  → Parent gets broadcast: "[School] is hosting Sports Day today. No normal lessons."
```

### Mid-Term Break

When a term's `mid_term_start` and `mid_term_end` are set, the calendar engine auto-populates those dates as `mid_term_break` days. Attendance engine ignores them completely.

---

## 9. Attendance Engine

### Calendar Check Before Any Attendance Write

```typescript
// Always first
const calendarDay = await isSchoolDay(schoolId, date);
if (!calendarDay) throw new Error('NOT_A_SCHOOL_DAY');

const timetableType = calendarDay.timetable_type;
if (timetableType === 'exam') {
  // Use exam_timetable_slots, not timetable_slots
  // Teacher is an invigilator, not a lesson teacher
}
```

### Teacher Check-In (Geofence + QR + Double Lesson Handling)

```typescript
// Double lesson QR logic:
// Period 3 (10:00–10:45) and Period 4 (10:45–11:30) are a double lesson
// Teacher scans QR once at Period 3 start
// System auto-marks Period 4 as attended (linked via second_period_id)
// If teacher scans QR at Period 4 instead: also accepted (fallback)
// Check-in time recorded against Period 3 slot, Period 4 marked covered

// Punctuality tracking:
const periodStart = new Date(`${date}T${period.start_time}`);
const minutesLate = differenceInMinutes(checkedInAt, periodStart);
await db.teacherAttendance.update({
  data: {
    minutes_late: minutesLate > 0 ? minutesLate : null,
    status: minutesLate > 10 ? 'late' : 'present',
  }
});
```

### Student Register — Sanity Check

```typescript
// Before saving register:
const absentCount = register.filter(s => s.status === 'absent').length;
const totalCount = register.length;

if (absentCount / totalCount > 0.8) {
  // More than 80% absent → require confirmation
  return {
    requiresConfirmation: true,
    message: `You are marking ${absentCount} of ${totalCount} students absent. 
              Is this correct? (Common cause: school event or trip not marked in calendar)`
  };
}
// Teacher must click "Yes, confirm" before saving
```

### Notification Intelligence (Critical)

```typescript
// When student marked absent:
// 1. Save the attendance record
// 2. Schedule a DELAYED notification job (15 minutes)
const job = await notificationQueue.add(
  'absence-alert',
  { studentId, slotId, date, lessonName, reason },
  { delay: 15 * 60 * 1000 } // 15 minute buffer
);

// Save the BullMQ job ID to cancel if teacher corrects
await db.studentLessonAttendance.update({
  where: { id: attendanceId },
  data: { notification_held: true, notification_job_id: job.id }
});

// If teacher corrects the mark to 'present':
await notificationQueue.remove(existingJobId); // cancel the job
await db.studentLessonAttendance.update({
  data: { notification_held: false, notification_job_id: null }
});
// Parent never gets notified — teacher corrected before buffer expired

// When the delayed job runs (15 mins later):
async function processAbsenceAlert(data) {
  // Re-fetch current status (may have been corrected)
  const record = await db.studentLessonAttendance.findUnique(...);
  if (record.status !== 'absent') return; // corrected, do nothing

  // Check calendar — is today an event day?
  const calDay = await getCalendarDay(schoolId, date);
  if (calDay.timetable_type !== 'normal') return; // suppress

  // Check how many absences today
  const todayAbsences = await countTodayAbsences(studentId, date);

  // Check parent notification preference
  const parent = await getPrimaryGuardian(studentId);
  if (parent.notification_pref === 'daily_digest') {
    // Don't send now — add to today's 3:30PM digest batch
    await digestQueue.add('add-to-digest', { parentId: parent.user_id, ... });
    return;
  }

  // All checks passed — send now
  await dispatchAbsenceNotification(parent, student, lessonName, reason);
}
```

---

## 10. Notification Intelligence System

### Notification Rules Engine

```typescript
// lib/notifications/intelligence.ts

interface NotificationRule {
  check: (context: NotificationContext) => Promise<boolean>;
  reason: string;
}

const SUPPRESSION_RULES: NotificationRule[] = [
  {
    check: async (ctx) => ctx.calendarDay?.timetable_type !== 'normal',
    reason: 'Not a normal school day (exam/event/closure)',
  },
  {
    check: async (ctx) => {
      const absentCount = await countDayAbsences(ctx.studentId, ctx.date);
      return absentCount > 1; // Second+ absence → batch into daily digest
    },
    reason: 'Multiple absences today — batching into daily digest',
  },
  {
    check: async (ctx) => ctx.parent.notification_pref === 'daily_digest',
    reason: 'Parent prefers daily digest',
  },
  {
    check: async (ctx) => ctx.parent.notification_pref === 'none',
    reason: 'Parent opted out of notifications',
  },
];

// 3:30 PM daily digest (scheduled job)
// Gathers all held notifications for digest-preference parents
// Sends ONE message: "Today's summary for Amara: Absent from Science (sick), 
//                     all other lessons attended. Arrived 7:43 AM."
```

### Parent Notification Preferences

Stored in `users.notification_pref`:
- `immediate` — get notified within 15 minutes of each absence
- `daily_digest` — get one summary at 3:30 PM with everything
- `urgent_only` — only if absent from ALL lessons (whole-day absence)
- `none` — opted out (still sees everything in the app)

Parent can change this in Settings → Notifications.

---

## 11. Timetable Engine — Full Complexity

### Exam Timetable (First-Class Concept)

Exam timetable is completely separate from the normal timetable. During exam days:
- Normal timetable is suspended
- Exam slots define: date, time, stream, learning area, invigilator
- Teacher attendance records link to `exam_timetable_slots` not `timetable_slots`
- Student attendance is marked per exam session, not per lesson
- QR tokens reference exam slots during exam periods

```typescript
// Attendance engine routing:
const timetableType = await getTimetableType(schoolId, date);

if (timetableType === 'exam') {
  // Load exam_timetable_slots for today
  // Teacher = invigilator (may not be their normal class)
  // Student attendance = per exam session
} else if (timetableType === 'normal') {
  // Load timetable_slots (normal day)
}
```

### Teacher Duty Schedule

Teachers have non-teaching duties (gate duty, games supervision, library, invigilation). These appear in their daily view alongside their teaching slots. A teacher on gate duty from 7:00–7:30 AM is not "absent" — they're on duty. Their teaching attendance starts at their first lesson.

```
Teacher daily view (Mr. Omondi — Monday):
  7:00 AM  🏫 Gate Duty (non-teaching)
  8:00 AM  Grade 7A — Mathematics          [Check In]
  9:00 AM  Grade 7B — Mathematics          [Check In]
 10:00 AM  Break
 10:30 AM  Grade 8A — Mathematics          [Check In]
 11:30 AM  FREE PERIOD (prep time)
 12:30 PM  Lunch
  1:30 PM  Grade 6A — Mathematics          [Check In]
  2:30 PM  🏃 Games Supervision (non-teaching)
```

### Timetable Import

```typescript
// CSV format for timetable import:
// stream, day_of_week, period_name, learning_area, teacher_national_id, room

// Validation:
// - Teacher exists and teaches this learning area
// - Stream exists
// - Period exists
// - No conflicts before importing
// Preview + confirm before saving
```

---

## 12. CBC Grading & Results Module — JSS Complete

### Assessment Workflow with Moderation

```
Teacher creates assessment (draft)
        ↓
Teacher enters marks/rubric scores (draft)
        ↓
Teacher clicks "Submit for Review"
        ↓
HoD receives notification: "New assessment pending review"
HoD reviews marks (read-only view + comment field)
        ↓
HoD approves → assessment_status = 'published'
      OR
HoD rejects → returns to teacher with comment
        ↓
Parents see results (published only)
        ↓
Admin can lock: assessment_status = 'locked'
No further edits possible.
If locked result must change:
  Admin unlocks → full audit trail entry → edit → re-lock
```

### JSS-Specific Features

**Portfolio Artefacts:**
```typescript
// JSS students submit physical project work
// Teacher photographs it → uploads via app
// Stored in S3, linked to student + term + learning area
// Parent sees portfolio gallery in their child's results view

// Artefact types:
// photo (project photos), document (written work scan),
// reflection (student's own written reflection), video (performance)
```

**Cross-Learning-Area Projects:**
```typescript
// Some JSS projects assessed by multiple teachers
// e.g. Agriculture project graded by:
//   - Agriculture teacher (content: 60%)
//   - English teacher (report writing: 40%)
// assessment has: multi_marker = true
// assessment_results has separate entries per teacher
// Final score = weighted average
```

**KNEC External Assessments:**
```typescript
// source = 'knec'
// These are recorded when results come from KNEC (Grade 6 national, Grade 9 national)
// School enters the received scores
// Cannot be moderated or modified (locked immediately)
// Stored separately from internal assessments in reports
```

**Result Locking:**
```typescript
// Once published and parent has viewed:
// Results auto-lock 14 days after publication
// Or admin can lock immediately
// Locked result: read-only everywhere
// To change: admin unlocks → audit log records: who, when, why →