# Class results, rankings and special exams — decision record

Added at the owner's request (2026-11-24). Not in SYSTEM_DESIGN.md or the original tracker (which has
only a never-populated `term_reports.position` column). Every rule below was decided by the owner, or
is labelled as an assistant decision that is open to review. Change a rule by adding a dated row,
never silently.

## Status

| Step | What | State |
|---|---|---|
| 0 | One design for "absent": `result_status` (GitHub PR #2). Interim `is_absent` converted and removed | Migration written and **tested on a real Postgres** (data carried over, rules enforced, full history replays from empty). **Not yet applied to the owner's Neon database.** |
| 1 | Special exam (audited), max marks required, parent averages fixed, locked results visible | Implemented, unit-tested (mocked DB). Not integration-tested. |
| 2 | My Class card shows real data; attendance analytics per learner | Not started |
| 3 | Results tab: subject analytics (all teachers), whole class (class teacher only) | Not started |

## Decisions (owner)

| # | Question | Decision |
|---|---|---|
| R0 | How "absent" is stored | **`result_status`** ('scored' / 'absent' / 'not_entered'), stored as a Postgres enum; an absent learner is stored as marks = 0, enforced by a database CHECK (migration `20261126090000`). The interim `is_absent` flag is gone. |
| R1 | Ranking basis | **CBC performance levels → points.** Teachers keep entering marks out of the maximum; the system converts marks → % → level → points. |
| R3 | Absent learners | Counted as **zero** and ranked. **Not entered blocks publishing** and is never a silent zero. |
| R3a | 0 / absent vs the scale | The scale has no band for 0%. **Absent and 0% = 0 points**, below BE2's 1 point, shown as ABS. |
| R3b | Special exam | The **only** edit allowed after publishing: absent → scored. Subject teacher alone, no second approver, **fully audited** (who, when, reason, old + new). The change is one atomic conditional update. |
| R4 | Ties | Same rank: 1, 2, 2, 4. |
| R5 | Most improved / dropped | Class teacher, admin, deputy: **this term vs previous term**. Subject teachers: that **plus** latest vs previous published assessment in the same subject and class. |
| R6 | Which assessments count | **Published only.** |
| R7 | Who sees what | Admin and deputy: school-wide. **Class teacher: every subject of their own stream ("whole class") and attendance analytics for their own stream.** Subject teacher: enters marks and sees analytics for **their own subject only**. **Parents never see ranks.** |
| R8 | Where the 8-level scale applies | **JSS only (Grades 7–9).** PP1–Grade 6 are not ranked on this scale. |

## Assistant decisions (reviewable)

* **Combining assessments in a subject:** weighted average of the **percentages** using `weight_percent`
  (equal weights if any assessment has no weight), converted to a level **once**.
* **Overall class rank:** **mean points per subject**, not the total, because stream-mates can take
  different optional subjects. The total is shown beside it.
* **Level lookup (CORRECTS an earlier assumption):** a mark earns the **highest level whose lower bound it
  reaches** (≥90 EE1, ≥75 EE2, ≥58 ME1, ≥41 ME2, ≥31 AE1, ≥21 AE2, ≥11 BE1, ≥1 BE2, below 1 = 0 points).
  74.5% is therefore ME1 and is never rounded up. This replaces the earlier "round to the nearest whole %"
  idea, which had no source. Based on one secondary source: confirm.
* **Improved / dropped:** ordered by **change in mean points**, no minimum threshold (the ±5-point figure in
  the parent API has no documented source and is not reused). Absent rows are **tagged** so a learner who
  missed one exam is not read as having "dropped". Learners with no earlier data are left out.
* Rubric-only assessments (no maximum mark) are **excluded** from rankings and labelled as such.

## The scale — verification status

Eight levels for Junior School (Grade 9 national exam KJSEA is reported on it; Grade 7–8 school-based
assessment feeds Grade 10 placement). Taken from several education/news sources quoting KNEC; **KNEC's own
document was not retrieved**. Two point scales circulate — 1–8 and 0.5–4.0 — and the second is exactly half
of the first, so **rankings are identical either way**. KNEC reports no class position or mean grade, so
rankings here are an internal, staff-only school tool and are never shown to parents.

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
| (absent / 0%) | — | 0 |

## Still open

* **CBC report-card model (D13 / R6-03): the "Generate report card" button is deliberately NOT built** until it is decided (owner, 2026-11-24). The existing generator pools one percentage across all subjects, which the code itself flags as not CBC.

* Confirm the scale and the level-lookup rule against KNEC's own publication before go-live.
* Should a parent be notified when a special exam changes a published absent result? Not built.
* The CBC rubric (`EE/ME/AE/BE` per sub-strand) cannot be used today: nothing creates strands or
  sub-strands. Rankings do not depend on it.
* The notification-held partial index from the removed `20261112` migration does not exist (SCH-04).
