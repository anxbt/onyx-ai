import { fetch as expoFetch } from "expo/fetch";

import { getModelConfig } from "@/lib/models";
import type { Attachment, Message, ReasoningEffortLevel, Source } from "@/types";

function getWorkerUrl() {
  return (process.env.EXPO_PUBLIC_WORKER_URL || "http://localhost:8787").replace(/\/+$/, "");
}

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
  const workerUrl = getWorkerUrl();
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

export interface StreamCallbacks {
  onContent: (content: string) => void;
  // Accumulated reasoning text (concatenation of `delta.reasoning_details[*].text`
  // entries from streaming chunks). Called repeatedly with the full
  // accumulated trace so far. Only invoked for models that emit reasoning.
  onReasoning?: (accumulated: string) => void;
  onSources?: (sources: Source[]) => void;
  onDone: (result: StreamDoneResult) => void;
  onError: (error: Error) => void;
}

export interface StreamDoneResult {
  messageId: string | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    chargedTotalCostInr: number;
  };
}

export function streamChatFromWorker({
  accessToken,
  conversationId,
  messages,
  modelId,
  attachments,
  enableSearch,
  forceSearch,
  reasoningEffort,
  signal,
  callbacks,
}: {
  accessToken: string;
  conversationId: string;
  messages: Message[];
  modelId: string;
  attachments?: Attachment[];
  enableSearch?: boolean;
  forceSearch?: boolean;
  // Optional per-request reasoning depth. Worker forwards as
  // `reasoning: { effort }` to OpenRouter. Omit (or "none") to disable.
  // Ignored for models with reasoningConfig.kind === "always-on".
  reasoningEffort?: ReasoningEffortLevel;
  signal?: AbortSignal;
  callbacks: StreamCallbacks;
}): () => void {
  const workerUrl = getWorkerUrl();
  const model = getModelConfig(modelId);
  let aborted = false;

  const abortController = new AbortController();
  const linkedSignal = signal ?? abortController.signal;

  const modelSupportsImages = (model.modality ?? "text").includes("image");

  const buildMessageContent = (
    message: Message,
  ): string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> => {
    const msgAttachments = message.attachments?.length ? message.attachments : null;
    if (message.role !== "user" || !msgAttachments) {
      return message.content;
    }

    const imageAttachments = msgAttachments.filter(
      (att) => att.type === "image" && att.remoteUrl,
    );

    if (!imageAttachments.length) {
      return message.content;
    }

    if (!modelSupportsImages) {
      const names = imageAttachments.map((a) => a.name).join(", ");
      return `${message.content}\n\n[Note: ${imageAttachments.length} image attachment(s) (${names}) are in this turn but the current model does not support vision. Ask the user to switch to a vision-capable model to inspect them.]`;
    }

    const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
      { type: "text", text: message.content },
    ];
    for (const att of imageAttachments) {
      parts.push({ type: "image_url", image_url: { url: att.remoteUrl as string } });
    }
    return parts;
  };

  const workerMessages = messages.map((message) => ({
    role: message.role,
    content: buildMessageContent(message),
  }));

  expoFetch(`${workerUrl}/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `${conversationId}:${Date.now()}`,
    },
    body: JSON.stringify({
      conversationId,
      model: model.id,
      messages: workerMessages,
      reasoningEffort,
      enableSearch,
      forceSearch,
    }),
    signal: linkedSignal as never,
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Worker error: ${res.status} ${text}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let accumulatedReasoning = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6).trim();
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "sources" && Array.isArray(parsed.sources)) {
              callbacks.onSources?.(parsed.sources as Source[]);
              continue;
            }

            if (parsed.done) {
              callbacks.onDone({
                messageId: parsed.messageId ?? null,
                usage: parsed.usage,
              });
              return;
            }

            if (parsed.error) {
              callbacks.onError(new Error(parsed.error));
              return;
            }

            // Reasoning content from OpenRouter's normalized delta.
            // `reasoning_details` is an array of typed entries; we concat
            // `text` from "reasoning.text" and "reasoning.summary" types and
            // ignore "reasoning.encrypted" (opaque, nothing to display).
            const reasoningDetails = parsed.choices?.[0]?.delta?.reasoning_details;
            if (Array.isArray(reasoningDetails)) {
              let added = "";
              for (const entry of reasoningDetails) {
                if (
                  entry &&
                  typeof entry === "object" &&
                  (entry.type === "reasoning.text" ||
                    entry.type === "reasoning.summary") &&
                  typeof entry.text === "string"
                ) {
                  added += entry.text;
                }
              }
              if (added) {
                accumulatedReasoning += added;
                callbacks.onReasoning?.(accumulatedReasoning);
              }
            }
            // Some providers also emit `delta.reasoning` directly as a string
            // (older non-normalized shape). Pick that up too.
            const reasoningStr = parsed.choices?.[0]?.delta?.reasoning;
            if (typeof reasoningStr === "string" && reasoningStr.length > 0) {
              accumulatedReasoning += reasoningStr;
              callbacks.onReasoning?.(accumulatedReasoning);
            }

            const delta = parsed.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              accumulated += delta;
              callbacks.onContent(accumulated);
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }

      if (accumulated) {
        callbacks.onDone({
          messageId: null,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, chargedTotalCostInr: 0 },
        });
      }
    })
    .catch((err) => {
      // Belt: AbortSignal authoritatively says we cancelled.
      if (linkedSignal.aborted) return;
      // Braces: expo/fetch throws errors whose `name` is not "AbortError" —
      // its message is literally "Fetch request has been canceled".
      const name = (err as Error)?.name;
      const message = (err as Error)?.message ?? "";
      if (name === "AbortError" || /aborted|cancel(?:l)?ed/i.test(message)) return;
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    });

  signal?.addEventListener("abort", () => {
    aborted = true;
    abortController.abort();
  });

  return () => {
    if (!aborted) {
      abortController.abort();
    }
  };
}

export async function summarizeConversation({
  accessToken,
  conversationId,
}: {
  accessToken: string;
  conversationId: string;
}) {
  const workerUrl = getWorkerUrl();

  const res = await fetch(`${workerUrl}/chat/summarize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ conversationId }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Worker error: ${res.status} ${text}`);
  }

  return await res.json();
}
