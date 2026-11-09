import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import type { AiTutorProvider, ChatMessage } from "./types";
import type { ProviderChoice } from "./config.server";

export class AiProviderError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function createClaudeProvider(
  choice: Exclude<ProviderChoice, { kind: "none" }>,
): AiTutorProvider {
  const anthropic = createAnthropic({ apiKey: choice.apiKey });

  return {
    name: "anthropic",
    model: choice.model,
    async generate(system: string, messages: ChatMessage[], maxOutputTokens: number) {
      let failure: unknown;
      const result = streamText({
        model: anthropic(choice.model),
        system,
        messages,
        maxOutputTokens,
        maxRetries: 0,
        onError: ({ error }: { error: unknown }) => {
          failure = error;
        },
      });
      const text = await Promise.resolve(result.text).catch((e: unknown) => {
        failure ??= e;
        return "";
      });
      if (failure) {
        const status = (failure as { statusCode?: number }).statusCode ?? 500;
        throw new AiProviderError(status, String((failure as Error)?.message ?? failure));
      }
      const finish = await Promise.resolve(result.finishReason).catch(() => undefined);
      if (!text && (finish === "content-filter" || finish === "other"))
        throw new AiProviderError(403, "refusal");
      return text;
    },
  };
}
