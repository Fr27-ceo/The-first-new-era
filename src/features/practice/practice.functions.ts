import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  cairoDay,
  MIN_ANSWERS_FOR_QUALIFYING_SESSION,
  nextStreak,
  sessionXp,
} from "@/lib/gamification";

const input = z.object({
  conceptId: z.string().uuid(),
  answers: z
    .array(z.object({ questionId: z.string().uuid(), optionId: z.string().uuid() }))
    .min(1)
    .max(50),
});

/**
 * Grades a practice session on the server and is the ONLY writer of
 * attempts, XP transactions, streaks and achievements.
 */
export const completePracticeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: questions, error: qErr } = await supabaseAdmin
      .from("questions")
      .select("id, xp_value, explanation_ar, question_options(id, is_correct)")
      .eq("concept_id", data.conceptId);
    if (qErr || !questions?.length) throw new Error("تعذّر تحميل أسئلة هذا المفهوم.");

    const byId = new Map(questions.map((q) => [q.id, q]));
    const seen = new Set<string>();
    const graded = data.answers
      .filter((a) => byId.has(a.questionId) && !seen.has(a.questionId) && seen.add(a.questionId))
      .map((a) => {
        const q = byId.get(a.questionId)!;
        const opt = q.question_options.find((o) => o.id === a.optionId);
        if (!opt) throw new Error("إجابة غير صالحة.");
        const correctOpt = q.question_options.find((o) => o.is_correct);
        return {
          ...a,
          isCorrect: opt.is_correct,
          correctOptionId: correctOpt?.id ?? null,
          explanation: q.explanation_ar,
          xp: q.xp_value,
        };
      });

    const correct = graded.filter((g) => g.isCorrect).length;
    const xp = sessionXp({
      totalQuestions: questions.length,
      answered: graded.length,
      correct,
      xpPerQuestion: graded.filter((g) => g.isCorrect).map((g) => g.xp),
    });
    const qualifying =
      graded.length === questions.length && graded.length >= MIN_ANSWERS_FOR_QUALIFYING_SESSION;

    const { data: attempt, error: aErr } = await supabaseAdmin
      .from("quiz_attempts")
      .insert({
        user_id: userId,
        concept_id: data.conceptId,
        completed_at: new Date().toISOString(),
        correct_count: correct,
        total_count: graded.length,
        xp_awarded: xp,
      })
      .select("id")
      .single();
    if (aErr || !attempt) throw new Error("تعذّر حفظ المحاولة.");

    await supabaseAdmin.from("attempt_answers").insert(
      graded.map((g) => ({
        attempt_id: attempt.id,
        user_id: userId,
        question_id: g.questionId,
        option_id: g.optionId,
        is_correct: g.isCorrect,
      })),
    );

    let streak = 0;
    const newAchievements: string[] = [];
    if (qualifying) {
      if (xp > 0)
        await supabaseAdmin
          .from("xp_transactions")
          .insert({ user_id: userId, amount: xp, reason: "practice_session", ref_id: attempt.id });

      const { data: s } = await supabaseAdmin
        .from("streaks")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      const next = nextStreak(
        {
          current: s?.current_streak ?? 0,
          longest: s?.longest_streak ?? 0,
          lastDay: s?.last_activity_date ?? null,
        },
        cairoDay(new Date()),
      );
      streak = next.current;
      await supabaseAdmin.from("streaks").upsert({
        user_id: userId,
        current_streak: next.current,
        longest_streak: next.longest,
        last_activity_date: next.lastDay,
        updated_at: new Date().toISOString(),
      });

      const codes = [
        "first_practice",
        ...(correct === graded.length ? ["perfect_session"] : []),
        ...(next.current >= 3 ? ["streak_3"] : []),
      ];
      const { data: achs } = await supabaseAdmin
        .from("achievements")
        .select("id, code, title_ar, xp_reward")
        .in("code", codes);
      const { data: owned } = await supabaseAdmin
        .from("user_achievements")
        .select("achievement_id")
        .eq("user_id", userId);
      const ownedIds = new Set((owned ?? []).map((o) => o.achievement_id));
      for (const a of achs ?? []) {
        if (ownedIds.has(a.id)) continue;
        await supabaseAdmin
          .from("user_achievements")
          .insert({ user_id: userId, achievement_id: a.id });
        if (a.xp_reward > 0)
          await supabaseAdmin.from("xp_transactions").insert({
            user_id: userId,
            amount: a.xp_reward,
            reason: `achievement:${a.code}`,
            ref_id: a.id,
          });
        newAchievements.push(a.title_ar);
      }
    }

    return {
      correct,
      total: graded.length,
      xp,
      streak,
      qualifying,
      newAchievements,
      review: graded.map((g) => ({
        questionId: g.questionId,
        optionId: g.optionId,
        isCorrect: g.isCorrect,
        correctOptionId: g.correctOptionId,
        explanation: g.explanation,
      })),
    };
  });
