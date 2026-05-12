import type { Attachment, Message } from "@/types";

export function estimateTokens(input: string) {
  return Math.max(1, Math.ceil(input.trim().length / 4));
}

export function buildMessagesArray(
  messages: Message[],
  nextContent: string,
  attachments: Attachment[] = [],
) {
  const base = messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  if (!attachments.length) {
    base.push({ role: "user", content: nextContent });
    return base;
  }

  base.push({
    role: "user",
    content: `${nextContent}\n\nAttachments:\n${attachments.map((item) => `- ${item.name}`).join("\n")}`,
  });
  return base;
}

