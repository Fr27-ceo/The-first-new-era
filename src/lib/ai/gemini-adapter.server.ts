import { GoogleGenAI } from "@google/genai";
import type { AiTutorProvider, ChatMessage } from "./types";
import type { ProviderChoice } from "./config.server";
import { AiProviderError } from "./claude-adapter.server";

export function createGeminiProvider(
  choice: Extract<ProviderChoice, { kind: "gemini" }>,
): AiTutorProvider {
  const ai = new GoogleGenAI({
    apiKey: choice.apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  return {
    name: "gemini",
    model: choice.model,
    async generate(system: string, messages: ChatMessage[], maxOutputTokens: number) {
      try {
        const contents = messages.map((m) => ({
          role: m.role === "assistant" ? ("model" as const) : ("user" as const),
          parts: [{ text: m.content }],
        }));

        const response = await ai.models.generateContent({
          model: choice.model,
          contents,
          config: {
            systemInstruction: system,
            maxOutputTokens,
          },
        });

        const text = response.text ?? "";
        if (!text) {
          throw new AiProviderError(500, "Empty response from Gemini");
        }
        return text;
      } catch (err) {
        if (err instanceof AiProviderError) throw err;
        const status =
          (err as { status?: number; statusCode?: number }).status ??
          (err as { statusCode?: number }).statusCode ??
          500;
        const message = err instanceof Error ? err.message : String(err);
        throw new AiProviderError(status, message);
      }
    },
  };
}
