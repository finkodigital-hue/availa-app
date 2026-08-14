import { createAnthropic } from "@ai-sdk/anthropic";

export function createAiProvider(apiKey: string) {
  return createAnthropic({ apiKey });
}
