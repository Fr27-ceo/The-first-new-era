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
    const { createClaudeProvider, AiProviderError } =
      await import("@/lib/ai/claude-adapter.server");
    const { createGeminiProvider } = await import("@/lib/ai/gemini-adapter.server");
    const { getStudentAdaptiveSummary } = await import("@/lib/ai/student-context.server");

    const choice = resolveProvider();
    if (choice.kind === "none") {
      return {
        ok: false,
        message: "توليد الامتحانات بالذكاء الاصطناعي يحتاج إلى ضبط مفتاح API (GEMINI_API_KEY).",
      };
    }

    const student = await getStudentAdaptiveSummary(context.userId);
    const subjectAr = data.subject === "physics" ? "الفيزياء" : "الكيمياء";
    const diffAr =
      data.difficulty === "easy"
        ? "متوسط/تمهيدي"
        : data.difficulty === "medium"
          ? "ثانوية عامة قياسي"
          : "متفوقين/تحدي";
    const topicPart = data.topic?.trim()
      ? `في موضوع: ${data.topic.trim()}`
      : student.weakConcepts.length > 0
        ? `مع التركيز على نقاط تحتاج تقوية لدى الطالب (${student.weakConcepts.join("، ")}) وموضوعات أخرى متنوعة من المنهج`
        : "في موضوعات متنوعة من المنهج";

    const systemPrompt = [
      `أنت خبير وضع امتحانات ${subjectAr} للصف الثالث الثانوي في مصر.`,
      student.promptSummary || "طالب ثانوية عامة.",
      `أنشئ امتحانًا جديدًا تمامًا ومبتكرًا مكونًا من ${data.count} أسئلة اختيار من متعدد ${topicPart} بمستوى (${diffAr}).`,
      "أرجع النتيجة بصيغة JSON صالحة فقط بدون أي نص إضافي خارج JSON، بالشكل التالي:",
      `{
  "examTitle": "عنوان الامتحان",
  "questions": [
    {
      "id": "q1",
      "prompt": "نص السؤال (يمكن استخدام LaTeX بين $...$)",
      "options": ["الخيار 1", "الخيار 2", "الخيار 3", "الخيار 4"],
      "correctIndex": 0,
      "explanation": "شرح مبسط لسبب صحة الإجابة",
      "svgDiagram": "<svg viewBox=\\"0 0 400 180\\" xmlns=\\"http://www.w3.org/2000/svg\\">...</svg> (اختياري: أضفه فقط إذا كان السؤال يحتاج رسمًا توضيحيًا بألوان واضحة للوضع الداكن)"
    }
  ]
}`,
      `ملاحظة: تأكد أن الأسئلة جديدة ومختلفة في كل مرة (بذرة التوليد: ${Date.now()}-${Math.floor(Math.random() * 10000)}).`,
    ].join("\n");

    const provider =
      choice.kind === "gemini"
        ? createGeminiProvider(choice, { responseMimeType: "application/json" })
        : createClaudeProvider(choice);

    try {
      const raw = await provider.generate(
        systemPrompt,
        [{ role: "user", content: `أنشئ امتحان ${subjectAr} من ${data.count} أسئلة الآن.` }],
        4096,
      );

      const cleaned = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : cleaned;

      const parsed = JSON.parse(jsonText) as {
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
      const status = e instanceof AiProviderError ? e.status : 500;
      console.error("generateAiExam error:", status, e instanceof Error ? e.message : e);
      if (status === 401 || status === 403 || status === 400) {
        return {
          ok: false,
          message: "تعذّر الاتصال بمزوّد الذكاء الاصطناعي. تأكد من صحة مفتاح GEMINI_API_KEY.",
        };
      }
      if (status === 429) {
        return { ok: false, message: "الخدمة مشغولة حاليًا. حاول بعد قليل." };
      }
      return {
        ok: false,
        message: "حدث خطأ أثناء توليد الامتحان بالذكاء الاصطناعي. حاول مرة أخرى.",
      };
    }
  });
