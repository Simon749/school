// src/lib/assessments/teaching-options.ts
//
// What a teacher may create an assessment for: ONLY the term + class + subject combinations they are
// timetabled to teach. The server enforces the same rule (decision D20, POST /api/assessments);
// offering only valid choices means a teacher can no longer pick a combination that is then refused.

export interface TimetableSlotRow {
  termId: string;
  streamId: string;
  learningAreaId: string;
  term: { id: string; name: string | null; isCurrent: boolean };
  stream: { id: string; name: string; grade: { name: string; level: number } };
  learningArea: { id: string; name: string };
}

export interface TeachingCombo {
  termId: string;
  streamId: string;
  learningAreaId: string;
}
export interface TermOption {
  id: string;
  name: string;
  isCurrent: boolean;
}
export interface ClassOption {
  id: string;
  /** "Grade 5 A": the grade AND the stream, never the bare stream name. */
  label: string;
}
export interface SubjectOption {
  id: string;
  name: string;
}

export interface TeachingOptions {
  combos: TeachingCombo[];
  terms: TermOption[];
  classes: ClassOption[];
  learningAreas: SubjectOption[];
}

export function buildTeachingOptions(slots: TimetableSlotRow[]): TeachingOptions {
  const combos = new Map<string, TeachingCombo>();
  const terms = new Map<string, TermOption>();
  const classes = new Map<string, ClassOption & { level: number; stream: string }>();
  const areas = new Map<string, SubjectOption>();

  for (const slot of slots) {
    // One row per distinct combination (a subject taught on several days is still one choice).
    combos.set(`${slot.termId}|${slot.streamId}|${slot.learningAreaId}`, {
      termId: slot.termId,
      streamId: slot.streamId,
      learningAreaId: slot.learningAreaId,
    });
    terms.set(slot.term.id, {
      id: slot.term.id,
      name: slot.term.name || 'Unnamed term',
      isCurrent: slot.term.isCurrent,
    });
    classes.set(slot.stream.id, {
      id: slot.stream.id,
      label: `${slot.stream.grade.name} ${slot.stream.name}`,
      level: slot.stream.grade.level,
      stream: slot.stream.name,
    });
    areas.set(slot.learningArea.id, { id: slot.learningArea.id, name: slot.learningArea.name });
  }

  return {
    combos: [...combos.values()],
    terms: [...terms.values()].sort((a, b) => a.name.localeCompare(b.name)),
    classes: [...classes.values()]
      .sort((a, b) => a.level - b.level || a.stream.localeCompare(b.stream))
      .map(({ id, label }) => ({ id, label })),
    learningAreas: [...areas.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
