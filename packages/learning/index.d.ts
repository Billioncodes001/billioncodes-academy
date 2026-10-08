export type WalkthroughStep = { from: number; to: number; title: string; text: string };
export type Walkthrough = { code: string; steps: WalkthroughStep[] };
export type WalkNode = { text: string } | { tag: string; from: number; to: number; children: WalkNode[]; inputType?: string; alt?: string };
export type Lesson = { id: string; title: string; body: string[]; walkthrough?: Walkthrough };
export type Course = { id: string; title: string; level: string; format: string; summary: string; lessons: Lesson[] };
export type Catalog = { courses: Course[]; training: { status: string }; payments: { enabled: boolean } };
export type Challenge = { id: string; title: string; brief: string; minutes: number; starter: string; hint: string; goals: string[]; example?: Walkthrough };
export type Check = { label: string; passed: boolean };
export type Feedback = { passed: boolean; checks: Check[]; error?: string };
export type Progress = { version: 1; read: Record<string, string[]>; drafts: Record<string, string>; solved: Record<string, string>; lastLesson: { courseId: string; lessonId: string } | null };
export const challenges: readonly Challenge[];
export const MAX_CODE_LENGTH: number;
export const WORKSPACE_KEY: string;
export const CATALOG_KEY: string;
export function gradeChallenge(id: string, code: string): Feedback;
/** Reconstructs a small inert HTML subset. It is not an arbitrary HTML sanitizer. */
export function previewHTML(code: string): string;
export function emptyProgress(): Progress;
export function normalizeProgress(value: unknown): Progress;
export function saveDraft(progress: Progress, id: string, code: string): Progress;
export function recordAttempt(progress: Progress, id: string, code: string): Progress;
export function recordRead(progress: Progress, courseId: string, lessonId: string, completed: boolean): Progress;
export function rememberLesson(progress: Progress, courseId: string, lessonId: string): Progress;
export function parseCatalog(value: unknown): Catalog | null;
export const primer: Course;
export const WALKTHROUGH_LIMITS: { code: number; lines: number; steps: number; title: number; text: number };
/** Throws an Error with a learner-facing message when the walkthrough is invalid. */
export function validateWalkthrough(input: unknown): Walkthrough;
/** An inert, source-mapped view of example HTML for previews. Never returns HTML. */
export function walkthroughTree(code: string): WalkNode[];
