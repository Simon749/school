# EduTrack Kenya

CBC-native school management platform for private schools in Nairobi. See:

- `SYSTEM_DESIGN.md` — full architecture and database design (source of truth for *what* to build)
- `PROGRESS_TRACKER.md` — phase-by-phase build checklist (source of truth for *what's done*)
- `DEVIATIONS.md` — every place this codebase knowingly departs from `SYSTEM_DESIGN.md`, and why
- `GAP_ANALYSIS.md` — audit of the previous repo attempt that led to this rebuild

## Status

Phase 0 — Project Setup, in progress. Not runnable yet: no `DATABASE_URL`, no Clerk keys.

## Getting Started (once you have real secrets)

```bash
npm install
cp .env.example .env.local   # then fill in real values
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Prisma · PostgreSQL (Neon → AWS RDS) ·
Clerk (auth — deviation from SYSTEM_DESIGN.md, see `DEVIATIONS.md`) · Redis (Upstash) · BullMQ

## Contributing rules

This project follows the AI Engineering Constitution provided in the project setup — most
importantly: no scope creep beyond the current tracker phase, no invented business/legal rules,
school-tenant isolation is non-negotiable even though the pilot is single-school, and nothing
gets marked `[x]` in the tracker unless it's actually done (not just "started").
