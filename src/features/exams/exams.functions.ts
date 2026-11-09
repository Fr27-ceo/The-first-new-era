import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AiExamQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  svgDiagram?: string;
};

export type GenerateExamResult =
  | { ok: true; examTitle: string; questions: AiExamQuestion[]; provider: string }
  | { ok: false; message: string };

const generateExamSchema = z.object({
  subject: z.enum(["physics", "chemistry"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  count: z.number().int().min(3).max(10),
  topic: z.string().max(120).optional(),
});

export const generateAiExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => generateExamSchema.parse(d))
  .handler(async ({ data, context }): Promise<GenerateExamResult> => {
    const { resolveProvider } = await import("@/lib/ai/config.server");
    const { createClaudeProvider } = await import("@/lib/ai/claude-adapter.server");
    const { createGeminiProvider } = await import("@/lib/ai/gemini-adapter.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const choice = resolveProvider();
    if (choice.kind === "none") {
      return {
        ok: false,
        message: "توليد الامتحانات بالذكاء الاصطناعي يحتاج إلى ضبط مفتاح API (GEMINI_API_KEY).",
      };
    }

    let studentSummary = "طالب ثانوية عامة";
    try {
      const [{ data: xpRows }, { data: streakRow }] = await Promise.all([
        supabaseAdmin.from("xp_transactions").select("amount").eq("user_id", context.userId),
        supabaseAdmin
          .from("streaks")
          .select("current_streak")
          .eq("user_id", context.userId)
          .maybeSingle(),
      ]);
      const totalXp = (xpRows ?? []).reduce((sum, r) => sum + (r.amount ?? 0), 0);
      const streak = streakRow?.current_streak ?? 0;
      studentSummary = `طالب لديه ${totalXp} نقطة خبرة (XP) وسلسلة التزام ${streak} أيام`;
    } catch {
      // تجاهل في حال عدم توفر قاعدة البيانات
    }

    const subjectAr = data.subject === "physics" ? "الفيزياء" : "الكيمياء";
    const diffAr =
      data.difficulty === "easy"
        ? "متوسط/تمهيدي"
        : data.difficulty === "medium"
          ? "ثانوية عامة قياسي"
          : "متفوقين/تحدي";
    const topicPart = data.topic?.trim()
      ? `في موضوع: ${data.topic.trim()}`
      : "في موضوعات متنوعة من المنهج";

    const systemPrompt = [
      `أنت خبير وضع امتحانات ${subjectAr} للصف الثالث الثانوي في مصر.`,
      `بيانات الطالب: ${studentSummary}.`,
      `أنشئ امتحانًا جديدًا تمامًا ومبتكرًا مكونًا من ${data.count} أسئلة اختيار من متعدد ${topicPart} بمستوى (${diffAr}).`,
      "أرجع النتيجة بصيغة JSON صالحة فقط بدون أي نص إضافي أو علامات Markdown، بالشكل التالي:",
      `{
  "examTitle": "عنوان الامتحان",
  "questions": [
    {
      "id": "q1",
      "prompt": "نص السؤال (يمكن استخدام LaTeX بين $...$)",
      "options": ["الخيار 1", "الخيار 2", "الخيار 3", "الخيار 4"],
      "correctIndex": 0,
      "explanation": "شرح مبسط لسبب صحة الإجابة",
      "svgDiagram": "<svg viewBox=\\"0 0 400 180\\" xmlns=\\"http://www.w3.org/2000/svg\\">...</svg> (اختياري: أضفه فقط إذا كان السؤال يحتاج رسمًا توضيحيًا)"
    }
  ]
}`,
      `ملاحظة: تأكد أن الأسئلة جديدة ومختلفة في كل مرة (معرف الجلسة العشوائي: ${Date.now()}).`,
    ].join("\n");

    const provider =
      choice.kind === "gemini" ? createGeminiProvider(choice) : createClaudeProvider(choice);

    try {
      const raw = await provider.generate(
        systemPrompt,
        [{ role: "user", content: `أنشئ امتحان ${subjectAr} من ${data.count} أسئلة الآن.` }],
        4000,
      );

      const cleaned = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned) as {
        examTitle?: string;
        questions?: AiExamQuestion[];
      };

      if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        return { ok: false, message: "تعذّر قراءة أسئلة الامتحان المولّدة. حاول مجددًا." };
      }

      return {
        ok: true,
        examTitle: parsed.examTitle || `امتحان ${subjectAr} (${diffAr})`,
        questions: parsed.questions,
        provider: provider.name,
      };
    } catch (e) {
      console.error("generateAiExam error:", e);
      return {
        ok: false,
        message: "حدث خطأ أثناء توليد الامتحان بالذكاء الاصطناعي. حاول مرة أخرى.",
      };
    }
  });
