/**
 * Pure gamification rules. The server (practice.functions.ts) is the only
 * place that applies them; the UI only displays results.
 */

export const XP_PER_LEVEL = 200;
export const PERFECT_SESSION_BONUS = 15;
export const MIN_ANSWERS_FOR_QUALIFYING_SESSION = 2;

/** Calendar day in Cairo time (YYYY-MM-DD) — streak days follow students' local day. */
export function cairoDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

export type StreakState = { current: number; longest: number; lastDay: string | null };

/** Apply one qualifying learning activity on `today`. */
export function nextStreak(prev: StreakState, today: string): StreakState {
  if (prev.lastDay === today) return prev;
  const continues = prev.lastDay !== null && dayDiff(prev.lastDay, today) === 1;
  const current = continues ? prev.current + 1 : 1;
  return { current, longest: Math.max(prev.longest, current), lastDay: today };
}

/** Streak as displayed today: broken if the last activity was before yesterday. */
export function displayedStreak(s: StreakState, today: string): number {
  if (!s.lastDay) return 0;
  return dayDiff(s.lastDay, today) <= 1 ? s.current : 0;
}

/** XP for a finished practice session. Incomplete sessions earn nothing. */
export function sessionXp(input: { totalQuestions: number; answered: number; correct: number; xpPerQuestion: number[] }): number {
  if (input.answered < input.totalQuestions || input.answered < MIN_ANSWERS_FOR_QUALIFYING_SESSION) return 0;
  const base = input.xpPerQuestion.slice(0, input.correct).reduce((a, b) => a + b, 0);
  return base + (input.correct === input.totalQuestions ? PERFECT_SESSION_BONUS : 0);
}

export function levelFromXp(xp: number) {
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const into = xp % XP_PER_LEVEL;
  return { level, into, needed: XP_PER_LEVEL, progress: into / XP_PER_LEVEL };
}
