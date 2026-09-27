import type { UIMessage } from "ai";

/** Only conversational text may reach the model from the browser. */
export function cleanAssistantMessages(input: unknown): UIMessage[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > 24)
    return null;
  let totalChars = 0;
  const messages: UIMessage[] = [];
  for (const [index, item] of input.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    if (record.role !== "user" && record.role !== "assistant") return null;
    if (!Array.isArray(record.parts)) return null;
    const text = record.parts
      .filter(
        (part): part is { type: "text"; text: string } =>
          !!part &&
          typeof part === "object" &&
          part.type === "text" &&
          typeof part.text === "string",
      )
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (!text || text.length > (record.role === "user" ? 4_000 : 6_000))
      return null;
    totalChars += text.length;
    if (totalChars > 20_000) return null;
    messages.push({
      id: `message-${index}`,
      role: record.role,
      parts: [{ type: "text", text }],
    });
  }
  return messages.at(-1)?.role === "user" ? messages : null;
}
