# Documented Deviations from SYSTEM_DESIGN.md

Per AGENTS.md §2 (Source of Truth Hierarchy): when a decision knowingly departs from
SYSTEM_DESIGN.md, it must be logged here, not silently substituted.

| # | SYSTEM_DESIGN.md says | We're actually doing | Reason | Decided |
|---|---|---|---|---|
| 1 | NextAuth v5 (Auth.js), Credentials provider | Clerk | Faster to stand up for a solo/small-team build; team already has Clerk experience from the prior repo. Clerk handles authentication (who are you); our own `users` table + `role` enum still handles authorization (what can you do) per AGENTS.md §10. | 2026-08-14, explicit user decision |
| 2 | Next.js 14 App Router | Next.js 14.2.35 (latest patched 14.x) | 14.2.35 has 5 known high-severity vulnerabilities that are only fixed by upgrading to Next.js 16 (breaking major version, not in current scope). Flagged, not silently ignored — revisit before pilot go-live (Phase 6 pre-launch checklist). | 2026-08-14, flagged by agent, needs revisit before Phase 6 |
| 3 | Multi-tenancy enforcement (school switching, cross-school isolation testing) | Schema is multi-tenant-shaped (`school_id` on every table from day one) but the pilot only onboards one school, and full isolation testing is deferred | Matches PROGRESS_TRACKER.md's own post-launch backlog, which lists "Multi-tenancy (shared infrastructure)" as a Phase-2-of-business item, not a pilot requirement. Schema is built in now specifically so this never requires a retrofit (see AGENTS.md §9 and the repo gap-analysis). **Correction (2026-10-26 review):** `school_id` is NOT yet on every table — it is missing on `StudentActivity`, `AssessmentResult`, `PortfolioArtefact` and `Notification` (finding SCH-01, task R5-04). | 2026-08-14, explicit user decision (Path A/C) |
| 4 | Tracker/design show `npm install …` commands | **pnpm** is the package manager (`packageManager` pinned in `package.json`, `pnpm-lock.yaml` is the only lockfile, CI uses `pnpm install --frozen-lockfile`). `package-lock.json` and the placeholder `pnpm-workspace.yaml` were removed. | The repo already used pnpm; the committed `package-lock.json` was out of sync so `npm ci` could never pass in CI. Build-script allow-list lives in `package.json` → `pnpm.onlyBuiltDependencies`. | 2026-10-26, explicit user decision (D10, REMEDIATION_PLAN) |
| 5 | Results distinguish a recorded score, confirmed absence, and unfinished entry | `AssessmentResult.resultStatus` uses `scored`, `absent`, and `not_entered`; existing rows migrate to `not_entered` rather than being inferred as absences. CBC rubric values remain categorical; no KJSEA/numerical conversion is applied without an approved school grading configuration. | Prevents an unentered mark from being confused with zero and avoids inventing a grading conversion. | 2026-11-23, results integrity implementation |

## Rule going forward

Any time an implementation choice knowingly diverges from SYSTEM_DESIGN.md or
PROGRESS_TRACKER.md, add a row here before writing the code, not after.
