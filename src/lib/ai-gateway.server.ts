import { createAnthropic } from "@ai-sdk/anthropic";

export function createAnthropicChatProvider(apiKey: string) {
  return createAnthropic({ apiKey });
}
