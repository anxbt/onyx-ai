import { getModelConfig } from "@/lib/models";
import type { Message } from "@/types";

export async function chatFromWorker({
  accessToken,
  conversationId,
  messages,
  modelId,
}: {
  accessToken: string;
  conversationId: string;
  messages: Message[];
  modelId: string;
}) {
  const workerUrl = (process.env.EXPO_PUBLIC_WORKER_URL || "http://localhost:8787").replace(/\/+$/, "");

  const model = getModelConfig(modelId);
  const res = await fetch(`${workerUrl}/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `${conversationId}:${Date.now()}`,
    },
    body: JSON.stringify({
      conversationId,
      model: model.id,
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Worker error: ${res.status} ${text}`);
  }

  return await res.json();
}

// Backwards-compatible alias (previous name implied streaming)
export { chatFromWorker as streamChatFromWorker };
