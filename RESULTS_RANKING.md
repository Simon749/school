# Class results, rankings and special exams — decision record

Added at the owner's request (2026-11-24). This feature is **not** in SYSTEM_DESIGN.md or the
original tracker (which only has a never-populated `term_reports.position` column). Every rule
below was decided explicitly by the owner, or is labelled as a recommendation that still needs
sign-off. Nothing here may be changed silently — add a dated row instead.

## Status

| Step | What | State |
|---|---|---|
| 1 | Make marks entry trustworthy (ABS state, honest auto-save, publish completeness, post-publish lock, special exam, parent averages) | Implemented, unit/component-tested with mocks. **Migration not yet applied to a real database. Not integration-tested.** |
| 2 | Rankings read-model + class-teacher / subject-teacher / admin / deputy views | Not started |
| 3 | Most improved / dropped | Not started |

## Decisions (owner)

| # | Question | Decision |
|---|---|---|
| R1 | Ranking basis | **CBC performance levels → points.** Teachers keep entering marks out of the maximum; the system converts marks → % → level → points. |
| R2 | Combining assessments in a subject | *Decided by the assistant at the owner's request:* weighted average of the **percentages** using `weight_percent` (equal weights if any assessment has no weight), converted to a level **once**. Converting each assessment first would discard information (89% and 75% are both EE2). |
| R3 | Absent learners | Explicit **ABS = zero**, and is ranked. Three distinct states per learner: score / ABS / blank. **Blank (not entered) blocks publishing** and is never a silent zero. |
| R3a | 0 / ABS vs the scale | The scale has no band for 0%. **ABS and 0% = 0 points** (below BE2's 1 point), shown as ABS. |
| R3b | Special exam | The **only** edit allowed after publishing: ABS → score. Subject teacher alone, no second approver, **fully audited** (who, when, reason, old + new). Ranks are computed when viewed, so they update automatically. |
| R4 | Ties | Same rank: 1, 2, 2, 4. |
| R5 | Most improved / dropped | Class teacher, admin, deputy: **this term vs previous term**. Subject teachers: that **plus** latest vs previous published assessment in the same subject and class. |
| R6 | Which assessments count | **Published only.** |
| R7 | Who sees rankings | Admin and deputy: school-wide. Class teacher: all subjects of own stream. Subject teacher: own subject. **Parents never see ranks** (working assumption, consistent with D13 — owner has not objected). |
| R8 | Where the 8-level scale applies | **JSS only (Grades 7–9).** PP1–Grade 6 are not ranked on this scale. |

## Assistant decisions inside the above (reviewable)

* Overall class rank uses **mean points per subject**, not the total, because stream-mates can
  take different optional subjects. The total is shown beside it.
* Percentages are **rounded to the nearest whole %** (half up) before the band lookup, because the
  published bands are whole-number ranges.
* "Improved / dropped" is ordered by **change in mean points**, with **no minimum threshold**
  (the ±5-point figure in the parent API has no documented source and is not reused).
* Learners with no earlier data are left out of improved/dropped lists. An ABS row is **tagged**
  in those lists so a learner who missed one exam is not read as having "dropped".
* Rubric-only assessments (no maximum mark) are **excluded** from rankings and labelled as such.
  This also avoids needing the still-open D13 rule for rolling sub-strand levels into one level.

## The scale — verification status

KNEC's national Grade 9 exam (KJSEA) uses 8 levels. Taken from several news reports quoting KNEC;
**KNEC's own document was not retrieved**, and one older report gives a different 4.0-point
version. Treat as likely-correct, **confirm with the school / KNEC before go-live**.

| Level | Marks % | Points |
|---|---|---|
| EE1 | 90–100 | 8 |
| EE2 | 75–89 | 7 |
| ME1 | 58–74 | 6 |
| ME2 | 41–57 | 5 |
| AE1 | 31–40 | 4 |
| AE2 | 21–30 | 3 |
| BE1 | 11–20 | 2 |
| BE2 | 1–10 | 1 |
| (ABS / 0%) | — | 0 (owner decision R3a) |

Limits: published for KJSEA, not for termly tests; applying it to internal JSS assessments is an
owner decision (R8), not a KNEC rule.

## Still open

* Should a parent be notified when a published ABS result is changed by a special exam? Not built.
* The 8-level scale needs confirming against KNEC's own publication.
* The CBC rubric (`EE/ME/AE/BE` per sub-strand) cannot be used today: nothing creates strands or
  sub-strands. Ranking does not depend on it (R1).
