/** إعدادات المساعد الذكي (للسيرفر فقط، لا تستوردها من كود المتصفح). */
export const AI_LIMITS = {
  maxMessageChars: 2000,
  maxHistoryMessages: 12,
  maxOutputTokens: 1500,
  requestsPerHour: 30,
};

export type ProviderChoice = { kind: "anthropic"; apiKey: string; model: string } | { kind: "none" };

/** يعمل المساعد فقط عند وجود ANTHROPIC_API_KEY في ملف .env */
export function resolveProvider(): ProviderChoice {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return { kind: "none" };
  return { kind: "anthropic", apiKey, model: process.env["ANTHROPIC_MODEL"] || "claude-sonnet-5-5" };
}
