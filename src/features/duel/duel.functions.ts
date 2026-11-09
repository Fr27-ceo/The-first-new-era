/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// دوال التحدي المباشر ووضع الشبح. منطق اللعبة في قاعدة البيانات (duels.sql و competition-modes.sql)،
// والسيرفر هنا يتحقق من هوية الطالب فقط ثم يستدعي الدوال.

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await (await admin()).rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

async function subjectIdFromSlug(slug?: string): Promise<string | null> {
  if (!slug) return null;
  const { data } = await (
    await admin()
  )
    .from("subjects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return data?.id ?? null;
}

const setup = z.object({
  subject: z.string().max(40).optional(),
  mode: z.enum(["points", "speed", "penalties"]).default("points"),
  scope: z.enum(["subject", "unit", "lesson"]).default("subject"),
  pack: z.string().uuid().nullish(),
});
const duelInput = z.object({ duelId: z.string().uuid() });

async function stateOf(userId: string, duelId: string) {
  await rpc("duel_tick", { p_duel: duelId });
  return rpc("duel_state", { p_user: userId, p_duel: duelId });
}

/** الباكات المتاحة: كل المادة، ثم كل فصل، ثم دروسه، مع عدد الأسئلة. */
export const listPacks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ subject: z.string().max(40).optional() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const sid = await subjectIdFromSlug(data.subject);
    let coursesQuery = db.from("courses").select("id");
    if (sid) coursesQuery = coursesQuery.eq("subject_id", sid);
    const { data: courses } = await coursesQuery;
    const { data: units } = await db
      .from("units")
      .select(
        "id, title_ar, sort_order, lessons(id, title_ar, sort_order, concepts(questions(id)))",
      )
      .in(
        "course_id",
        (courses ?? []).map((c: any) => c.id),
      )
      .order("sort_order");

    const packs: {
      scope: string;
      id: string | null;
      title: string;
      group: string;
      count: number;
    }[] = [];
    let total = 0;
    const rest: typeof packs = [];
    for (const u of units ?? []) {
      const lessons = [...(u.lessons ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order);
      const lessonPacks = lessons.map((l: any) => ({
        scope: "lesson",
        id: l.id,
        title: l.title_ar,
        group: u.title_ar,
        count: (l.concepts ?? []).reduce((n: number, c: any) => n + (c.questions?.length ?? 0), 0),
      }));
      const unitCount = lessonPacks.reduce((n: number, l: any) => n + l.count, 0);
      total += unitCount;
      rest.push(
        {
          scope: "unit",
          id: u.id,
          title: `كل أسئلة هذا الفصل`,
          group: u.title_ar,
          count: unitCount,
        },
        ...lessonPacks,
      );
    }
    packs.push(
      { scope: "subject", id: null, title: "كل أسئلة المادة", group: "الكل", count: total },
      ...rest,
    );
    return packs;
  });

/** إنشاء تحدٍّ جديد ينتظر منافسًا (يُدعى بالكود). */
export const createDuel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setup.parse(d))
  .handler(async ({ data, context }) => {
    const id = await rpc("duel_create", {
      p_user: context.userId,
      p_subject: await subjectIdFromSlug(data.subject),
      p_open: false,
      p_mode: data.mode,
      p_scope: data.scope,
      p_pack: data.pack ?? null,
    });
    return stateOf(context.userId, id);
  });

/** البحث عن منافس: ينضم لتحدٍّ مفتوح بنفس الوضع والباك أو ينشئ واحدًا ينتظر. */
export const quickMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setup.parse(d))
  .handler(async ({ data, context }) => {
    const id = await rpc("duel_quick_match", {
      p_user: context.userId,
      p_subject: await subjectIdFromSlug(data.subject),
      p_mode: data.mode,
      p_scope: data.scope,
      p_pack: data.pack ?? null,
    });
    return stateOf(context.userId, id);
  });

export const joinDuel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(4).max(10) }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await rpc("duel_join", { p_user: context.userId, p_code: data.code });
    return stateOf(context.userId, id);
  });

export const getDuel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => duelInput.parse(d))
  .handler(async ({ data, context }) => stateOf(context.userId, data.duelId));

export const answerDuel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => duelInput.extend({ optionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await rpc("duel_submit", {
      p_user: context.userId,
      p_duel: data.duelId,
      p_option: data.optionId,
    });
    return stateOf(context.userId, data.duelId);
  });

// ---------- وضع الشبح (نموذج أولي) ----------
// منافس محاكى بمستوى دقة محدد (مبتدئ أو محترف أو بطل) يلعب على نفس الباك والوضع. لا يمنح نقاط خبرة.

const ACCURACY = { beginner: 0.5, pro: 0.7, champion: 0.88 } as const;
const GHOST_NAME = { beginner: "شبح مبتدئ", pro: "شبح محترف", champion: "شبح البطل" } as const;
const QUESTION_COUNT = { points: 7, speed: 5, penalties: 5 } as const;

export const startGhost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    setup.extend({ level: z.enum(["beginner", "pro", "champion"]).default("pro") }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const subjectId = await subjectIdFromSlug(data.subject);
    const count = QUESTION_COUNT[data.mode];
    const ids: string[] | null = await rpc("pick_pack_questions", {
      p_subject: subjectId,
      p_scope: data.scope,
      p_pack: data.pack ?? null,
      p_count: count,
    });
    if (!ids || ids.length < count)
      throw new Error(`الباك المختار لا يحتوي أسئلة كافية لهذا الوضع (يلزم ${count}).`);

    const accuracy = ACCURACY[data.level];
    const pace = accuracy > 0.8 ? 7000 : accuracy > 0.6 ? 9000 : 12000;
    const plan = ids.map(() => ({
      correct: Math.random() < accuracy,
      ms: Math.round(pace * (0.9 + Math.random() * 0.2)),
    }));

    const { data: qs } = await db
      .from("questions")
      .select("id, prompt_ar, question_options(id, label_ar, sort_order)")
      .in("id", ids);
    const byId = new Map<string, any>((qs ?? []).map((q: any) => [q.id, q]));
    const questions = ids.map((id) => {
      const q = byId.get(id);
      return {
        id,
        prompt: q.prompt_ar,
        options: [...q.question_options]
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((o: any) => ({ id: o.id, label: o.label_ar })),
      };
    });
    return { ghostName: GHOST_NAME[data.level], mode: data.mode, plan, questions };
  });

/** تصحيح إجابة واحدة في وضع الشبح. */
export const gradeGhostAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ questionId: z.string().uuid(), optionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: q } = await (
      await admin()
    )
      .from("questions")
      .select("explanation_ar, question_options(id, is_correct, label_ar)")
      .eq("id", data.questionId)
      .maybeSingle();
    const options: { id: string; is_correct: boolean; label_ar: string }[] =
      q?.question_options ?? [];
    const picked = options.find((o) => o.id === data.optionId);
    if (!picked) throw new Error("إجابة غير صالحة.");
    const correct = options.find((o) => o.is_correct);
    return {
      isCorrect: picked.is_correct,
      correctLabel: correct?.label_ar ?? "",
      explanation: q?.explanation_ar ?? "",
    };
  });
