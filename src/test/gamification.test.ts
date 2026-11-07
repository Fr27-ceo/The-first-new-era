import { describe, expect, it } from "vitest";
import { cairoDay, displayedStreak, levelFromXp, nextStreak, sessionXp } from "@/lib/gamification";

describe("streak rules", () => {
  it("continues the streak on the next day", () => {
    expect(nextStreak({ current: 3, longest: 3, lastDay: "2026-10-16" }, "2026-10-17").current).toBe(4);
  });
  it("resets the streak after a missed day", () => {
    expect(nextStreak({ current: 5, longest: 5, lastDay: "2026-10-14" }, "2026-10-17")).toEqual({ current: 1, longest: 5, lastDay: "2026-10-17" });
  });
  it("counts the same day only once", () => {
    expect(nextStreak({ current: 2, longest: 2, lastDay: "2026-10-17" }, "2026-10-17").current).toBe(2);
  });
  it("shows zero once a day is missed", () => {
    expect(displayedStreak({ current: 4, longest: 4, lastDay: "2026-10-15" }, "2026-10-17")).toBe(0);
  });
  it("uses Cairo calendar days", () => {
    expect(cairoDay(new Date("2026-10-17T22:30:00Z"))).toBe("2026-10-18");
  });
});

describe("xp rules", () => {
  it("gives no XP for an incomplete session", () => {
    expect(sessionXp({ totalQuestions: 3, answered: 2, correct: 2, xpPerQuestion: [10, 10, 10] })).toBe(0);
  });
  it("adds a perfect-session bonus", () => {
    expect(sessionXp({ totalQuestions: 2, answered: 2, correct: 2, xpPerQuestion: [10, 10] })).toBe(35);
  });
  it("levels up every 200 XP", () => {
    expect(levelFromXp(450).level).toBe(3);
  });
});
