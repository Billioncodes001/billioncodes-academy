import { gradeChallenge, recordAttempt, saveDraft, type Feedback, type Progress } from '@billioncodes/learning';

/** Keep a shared-parser failure recoverable without losing the learner's draft. */
export function checkAttempt(progress: Progress, id: string, code: string): { progress: Progress; feedback: Feedback } {
  try {
    const feedback = gradeChallenge(id, code);
    return { feedback, progress: recordAttempt(progress, id, code) };
  } catch {
    return {
      progress: saveDraft(progress, id, code),
      feedback: { passed: false, checks: [], error: 'This HTML could not be checked safely. Simplify deeply nested markup and try again. Your draft has been kept.' },
    };
  }
}
