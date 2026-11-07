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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const choice = resolveProvider();
    if (choice.kind === "none") return { ok: false, code: "not_configured", message: "المساعد الذكي يحتاج إلى إعداد مزوّد الذكاء الاصطناعي أولًا." };

    const last = data.messages[data.messages.length - 1]!;
    if (last.role !== "user" || last.content.length > AI_LIMITS.maxMessageChars)
      return { ok: false, code: "provider_error", message: `الرسالة طويلة جدًا (الحد ${AI_LIMITS.maxMessageChars} حرف).` };

    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await supabaseAdmin.from("ai_interactions").select("id", { count: "exact", head: true }).eq("user_id", context.userId).gte("created_at", since);
    if ((count ?? 0) >= AI_LIMITS.requestsPerHour) return { ok: false, code: "rate_limited", message: "وصلت للحد المسموح من الأسئلة هذه الساعة. حاول لاحقًا." };

    const subject = data.subject === "physics" ? "الفيزياء" : data.subject === "chemistry" ? "الكيمياء" : "الفيزياء والكيمياء";
    const system = [
      `أنت مدرس مساعد لطلاب الصف الثالث الثانوي في مصر في مادة ${subject}.`,
      "أجب بالعربية الفصحى المبسطة. اكتب المعادلات بصيغة LaTeX بين $...$.",
      STYLE[data.style],
      data.length === "concise" ? "اجعل الإجابة مختصرة (فقرة أو فقرتان)." : "قدّم شرحًا مفصلًا منظمًا بعناوين قصيرة.",
      "مهم: شرحك مولَّد وليس من الكتاب المدرسي الرسمي. لا تدّعِ أبدًا أن إجابتك رسمية أو من منهج الوزارة، وإن لم تكن متأكدًا من تفصيلة في المنهج فقل ذلك صراحة ونبّه الطالب للرجوع لمعلمه أو الكتاب المعتمد.",
    ].join("\n");

    const provider = createClaudeProvider(choice);
    const history = data.messages.slice(-AI_LIMITS.maxHistoryMessages);
    try {
      const text = await provider.generate(system, history, AI_LIMITS.maxOutputTokens);
      await supabaseAdmin.from("ai_interactions").insert({ user_id: context.userId, provider: provider.name, model: provider.model, prompt_chars: last.content.length, response_chars: text.length, status: "ok" });
      return { ok: true, text, provider: provider.name, model: provider.model };
    } catch (e) {
      const status = e instanceof AiProviderError ? e.status : 500;
      console.error("ai tutor error", status);
      await supabaseAdmin.from("ai_interactions").insert({ user_id: context.userId, provider: provider.name, model: provider.model, prompt_chars: last.content.length, status: `error_${status}` });
      if (status === 429) return { ok: false, code: "rate_limited", message: "الخدمة مشغولة الآن. حاول بعد قليل." };
      if (status === 402) return { ok: false, code: "credits", message: "رصيد الذكاء الاصطناعي نفد. يحتاج صاحب المنصة لإضافة رصيد." };
      if (status === 401 || status === 403) return { ok: false, code: "denied", message: "تعذّر الوصول لمزوّد الذكاء الاصطناعي أو رُفض الطلب." };
      return { ok: false, code: "provider_error", message: "حدث خطأ أثناء توليد الإجابة. حاول مرة أخرى." };
    }
  });
