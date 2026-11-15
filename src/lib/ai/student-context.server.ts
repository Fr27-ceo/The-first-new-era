import { hasSupabaseAdminEnv, supabaseAdmin } from "@/integrations/supabase/client.server";

export type StudentAdaptiveSummary = {
  totalXp: number;
  streak: number;
  accuracyPct: number | null;
  weakConcepts: string[];
  promptSummary: string;
};

/** يجلب ملخص بيانات الطالب للتكيّف مع مستواه ونقاط ضعفه دون تعطيل المسار عند غياب الاتصال. */
export async function getStudentAdaptiveSummary(userId: string): Promise<StudentAdaptiveSummary> {
  const empty: StudentAdaptiveSummary = {
    totalXp: 0,
    streak: 0,
    accuracyPct: null,
    weakConcepts: [],
    promptSummary: "",
  };

  if (!hasSupabaseAdminEnv) return empty;

  try {
    const [xpRes, streakRes, attemptsRes, mistakesRes] = await Promise.allSettled([
      supabaseAdmin.from("xp_transactions").select("amount").eq("user_id", userId),
      supabaseAdmin.from("streaks").select("current_streak").eq("user_id", userId).maybeSingle(),
      supabaseAdmin
        .from("quiz_attempts")
        .select("correct_count, total_count")
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("attempt_answers")
        .select("questions(concepts(title_ar))")
        .eq("user_id", userId)
        .eq("is_correct", false)
        .order("answered_at", { ascending: false })
        .limit(12),
    ]);

    const xpRows = xpRes.status === "fulfilled" ? (xpRes.value.data ?? []) : [];
    const totalXp = xpRows.reduce((sum, r) => sum + (r.amount ?? 0), 0);

    const streak =
      streakRes.status === "fulfilled" ? (streakRes.value.data?.current_streak ?? 0) : 0;

    let accuracyPct: number | null = null;
    if (attemptsRes.status === "fulfilled" && (attemptsRes.value.data?.length ?? 0) > 0) {
      const rows = attemptsRes.value.data ?? [];
      const correct = rows.reduce((s, r) => s + (r.correct_count ?? 0), 0);
      const total = rows.reduce((s, r) => s + (r.total_count ?? 0), 0);
      if (total > 0) accuracyPct = Math.round((correct / total) * 100);
    }

    const weakSet = new Set<string>();
    if (mistakesRes.status === "fulfilled") {
      for (const row of mistakesRes.value.data ?? []) {
        const q = (row as { questions?: { concepts?: { title_ar?: string } | null } | null })
          .questions;
        const title = q?.concepts?.title_ar;
        if (title) weakSet.add(title);
      }
    }
    const weakConcepts = Array.from(weakSet).slice(0, 4);

    const parts = [
      `إجمالي نقاط الخبرة: ${totalXp} XP`,
      `سلسلة الالتزام: ${streak} أيام`,
      ...(accuracyPct !== null ? [`معدل الدقة في التدريبات الأخيرة: ${accuracyPct}%`] : []),
      ...(weakConcepts.length > 0
        ? [`موضوعات أخطأ فيها الطالب مؤخرًا ويحتاج دعمًا فيها: ${weakConcepts.join("، ")}`]
        : []),
    ];

    return {
      totalXp,
      streak,
      accuracyPct,
      weakConcepts,
      promptSummary: `بيانات الطالب الحالية (${parts.join(" | ")}). كيّف مستوى الشرح والأسئلة والأمثلة لتناسب مستواه الفعلي.`,
    };
  } catch {
    return empty;
  }
}
