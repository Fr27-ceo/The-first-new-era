/** إعدادات المساعد الذكي (للسيرفر فقط، لا تستوردها من كود المتصفح). */
export const AI_LIMITS = {
  maxMessageChars: 2000,
  maxHistoryMessages: 12,
  maxOutputTokens: 2500,
  requestsPerHour: 30,
};

export type ProviderChoice =
  | { kind: "gemini"; apiKey: string; model: string }
  | { kind: "anthropic"; apiKey: string; model: string }
  | { kind: "none" };

/** يفضّل Gemini عند وجود GEMINI_API_KEY، أو Anthropic عند وجود ANTHROPIC_API_KEY */
export function resolveProvider(): ProviderChoice {
  const geminiKey = (
    process.env["GEMINI_API_KEY"] ||
    process.env["GOOGLE_GENERATIVE_AI_API_KEY"] ||
    ""
  ).trim();
  if (geminiKey) {
    return {
      kind: "gemini",
      apiKey: geminiKey,
      model: (process.env["GEMINI_MODEL"] || "gemini-3.8-flash").trim(),
    };
  }

  const anthropicKey = (process.env["ANTHROPIC_API_KEY"] || "").trim();
  if (anthropicKey) {
    return {
      kind: "anthropic",
      apiKey: anthropicKey,
      model: (process.env["ANTHROPIC_MODEL"] || "claude-sonnet-5-5").trim(),
    };
  }

  return { kind: "none" };
}
