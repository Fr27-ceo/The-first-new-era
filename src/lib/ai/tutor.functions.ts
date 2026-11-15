import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TutorResult } from "./types";

export const getAiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { resolveProvider } = await import("./config.server");
    const p = resolveProvider();
    return { configured: p.kind !== "none", provider: p.kind };
  });

const req = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(6000) }))
    .min(1)
    .max(40),
  style: z.enum(["balanced", "simple", "examples", "socratic"]),
  length: z.enum(["concise", "detailed"]),
  subject: z.enum(["physics", "chemistry"]).nullable().optional(),
});

const STYLE: Record<string, string> = {
  balanced: "اشرح بوضوح وتوازن بين الفكرة والمثال.",
  simple: "اشرح بأبسط لغة ممكنة كأنك تشرح لمبتدئ.",
  examples: "اعتمد على أمثلة محلولة خطوة بخطوة.",
  socratic: "وجّه الطالب بأسئلة متتابعة ليصل للإجابة بنفسه.",
};

export const askTutor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => req.parse(d))
  .handler(async ({ data, context }): Promise<TutorResult> => {
    const { resolveProvider, AI_LIMITS } = await import("./config.server");
    const { createClaudeProvider, AiProviderError } = await import("./claude-adapter.server");
    const { createGeminiProvider } = await import("./gemini-adapter.server");
    const { getStudentAdaptiveSummary } = await import("./student-context.server");
    const { hasSupabaseAdminEnv, supabaseAdmin } =
      await import("@/integrations/supabase/client.server");

    const choice = resolveProvider();
    if (choice.kind === "none")
      return {
        ok: false,
        code: "not_configured",
        message: "المساعد الذكي يحتاج إلى إعداد مزوّد الذكاء الاصطناعي أولًا (GEMINI_API_KEY).",
      };

    const last = data.messages[data.messages.length - 1]!;
    if (last.role !== "user" || last.content.length > AI_LIMITS.maxMessageChars)
      return {
        ok: false,
        code: "provider_error",
        message: `الرسالة طويلة جدًا (الحد ${AI_LIMITS.maxMessageChars} حرف).`,
      };

    const [rateLimitOk, student] = await Promise.all([
      (async () => {
        if (!hasSupabaseAdminEnv) return true;
        try {
          const since = new Date(Date.now() - 3_600_000).toISOString();
          const { count } = await supabaseAdmin
            .from("ai_interactions")
            .select("id", { count: "exact", head: true })
            .eq("user_id", context.userId)
            .gte("created_at", since);
          return (count ?? 0) < AI_LIMITS.requestsPerHour;
        } catch {
          return true;
        }
      })(),
      getStudentAdaptiveSummary(context.userId),
    ]);

    if (!rateLimitOk)
      return {
        ok: false,
        code: "rate_limited",
        message: "وصلت للحد المسموح من الأسئلة هذه الساعة. حاول لاحقًا.",
      };

    const subject =
      data.subject === "physics"
        ? "الفيزياء"
        : data.subject === "chemistry"
          ? "الكيمياء"
          : "الفيزياء والكيمياء";

    const system = [
      `أنت مدرس مساعد ذكي متكيف لطلاب الصف الثالث الثانوي في مصر في مادة ${subject}.`,
      student.promptSummary,
      "أجب بالعربية الفصحى المبسطة. اكتب المعادلات بصيغة LaTeX بين $...$.",
      STYLE[data.style],
      data.length === "concise"
        ? "اجعل الإجابة مختصرة (فقرة أو فقرتان)."
        : "قدّم شرحًا مفصلًا منظمًا بعناوين قصيرة.",
      "يمكنك أيضًا إنشاء أسئلة تدريبية أو امتحان قصير للطالب عندما يطلب ذلك.",
      'إذا طلب الطالب رسمًا توضيحيًا أو كان المفهوم يحتاج إلى رسم (مثل دائرة كهربائية، مجال مغناطيسي، موجة، أو رابطة كيميائية)، استخرج رسمًا توضيحيًا نظيفًا بصيغة SVG داخل كتلة ```svg ... ``` بأبعاد viewBox="0 0 400 220" وبألوان واضحة مناسبة للوضع الداكن (مثل #a78bfa و #38bdf8 و #f8fafc) مع تسميات واضحة.',
      "مهم: شرحك مولَّد وليس من الكتاب المدرسي الرسمي. لا تدّعِ أبدًا أن إجابتك رسمية أو من منهج الوزارة، وإن لم تكن متأكدًا من تفصيلة في المنهج فقل ذلك صراحة ونبّه الطالب للرجوع لمعلمه أو الكتاب المعتمد.",
    ]
      .filter(Boolean)
      .join("\n");

    const provider =
      choice.kind === "gemini" ? createGeminiProvider(choice) : createClaudeProvider(choice);
    const history = data.messages.slice(-AI_LIMITS.maxHistoryMessages);

    try {
      const text = await provider.generate(system, history, AI_LIMITS.maxOutputTokens);
      if (hasSupabaseAdminEnv) {
        supabaseAdmin
          .from("ai_interactions")
          .insert({
            user_id: context.userId,
            provider: provider.name,
            model: provider.model,
            prompt_chars: last.content.length,
            response_chars: text.length,
            status: "ok",
          })
          .then(undefined, () => {});
      }
      return { ok: true, text, provider: provider.name, model: provider.model };
    } catch (e) {
      const status = e instanceof AiProviderError ? e.status : 500;
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error("ai tutor error", status, errMsg);
      if (hasSupabaseAdminEnv) {
        supabaseAdmin
          .from("ai_interactions")
          .insert({
            user_id: context.userId,
            provider: provider.name,
            model: provider.model,
            prompt_chars: last.content.length,
            status: `error_${status}`,
          })
          .then(undefined, () => {});
      }
      if (status === 429)
        return { ok: false, code: "rate_limited", message: "الخدمة مشغولة الآن. حاول بعد قليل." };
      if (status === 402)
        return {
          ok: false,
          code: "credits",
          message: "رصيد الذكاء الاصطناعي نفد. يحتاج صاحب المنصة لإضافة رصيد.",
        };
      if (status === 401 || status === 403 || status === 400)
        return {
          ok: false,
          code: "denied",
          message:
            "تعذّر الوصول لمزوّد الذكاء الاصطناعي. تأكد من صحة مفتاح GEMINI_API_KEY في الإعدادات.",
        };
      return {
        ok: false,
        code: "provider_error",
        message: "حدث خطأ أثناء توليد الإجابة. حاول مرة أخرى.",
      };
    }
  });
