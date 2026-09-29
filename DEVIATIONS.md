# Documented Deviations from SYSTEM_DESIGN.md

Per AGENTS.md §2 (Source of Truth Hierarchy): when a decision knowingly departs from
SYSTEM_DESIGN.md, it must be logged here, not silently substituted.

| # | SYSTEM_DESIGN.md says | We're actually doing | Reason | Decided |
|---|---|---|---|---|
| 1 | NextAuth v5 (Auth.js), Credentials provider | Clerk | Faster to stand up for a solo/small-team build; team already has Clerk experience from the prior repo. Clerk handles authentication (who are you); our own `users` table + `role` enum still handles authorization (what can you do) per AGENTS.md §10. | 2026-08-14, explicit user decision |
| 2 | Next.js 14 App Router | Next.js 14.2.35 (latest patched 14.x) | 14.2.35 has 5 known high-severity vulnerabilities that are only fixed by upgrading to Next.js 16 (breaking major version, not in current scope). Flagged, not silently ignored — revisit before pilot go-live (Phase 6 pre-launch checklist). | 2026-08-14, flagged by agent, needs revisit before Phase 6 |
| 3 | Multi-tenancy enforcement (school switching, cross-school isolation testing) | Schema is multi-tenant-shaped (`school_id` on every table from day one) but the pilot only onboards one school, and full isolation testing is deferred | Matches PROGRESS_TRACKER.md's own post-launch backlog, which lists "Multi-tenancy (shared infrastructure)" as a Phase-2-of-business item, not a pilot requirement. Schema is built in now specifically so this never requires a retrofit (see AGENTS.md §9 and the repo gap-analysis). | 2026-08-14, explicit user decision (Path A/C) |

## Rule going forward

Any time an implementation choice knowingly diverges from SYSTEM_DESIGN.md or
PROGRESS_TRACKER.md, add a row here before writing the code, not after.
