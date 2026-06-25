import { getModelConfig } from "@/lib/models";
import type { Attachment, Message, ReasoningEffortLevel, ResearchMode, ResearchTraceEvent, Source } from "@/types";

import { supabase } from "./supabase";
import { getWorkerUrl } from "./worker";

export interface StreamCallbacks {
  onContent: (content: string) => void;
  onSources?: (sources: Source[]) => void;
  onResearchStep?: (event: ResearchTraceEvent) => void;
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

type WorkerContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

async function refreshStreamAccessToken() {
  if (!supabase) return null;

  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.data.session?.access_token) {
    return refreshed.data.session.access_token;
  }

  const current = await supabase.auth.getSession();
  return current.data.session?.access_token ?? null;
}

export function streamChatFromWorker({
  accessToken,
  conversationId,
  messages,
  modelId,
  attachments,
  enableSearch,
  forceSearch,
  researchMode,
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
  researchMode?: ResearchMode;
  reasoningEffort?: ReasoningEffortLevel;
  signal?: AbortSignal;
  callbacks: StreamCallbacks;
}): () => void {
  const model = getModelConfig(modelId);
  let aborted = false;
  const abortController = new AbortController();
  const linkedSignal = abortController.signal;
  const modelSupportsImages = (model.modality ?? "text").includes("image");
  const idempotencyKey = `${conversationId}:${Date.now()}`;

  signal?.addEventListener(
    "abort",
    () => {
      aborted = true;
      abortController.abort();
    },
    { once: true },
  );

  const buildMessageContent = (message: Message): WorkerContent => {
    const msgAttachments = message.attachments?.length ? message.attachments : null;
    if (message.role !== "user" || !msgAttachments) {
      return message.content;
    }

    const imageAttachments = msgAttachments.filter((att) => att.type === "image" && att.remoteUrl);
    if (!imageAttachments.length) {
      return message.content;
    }

    if (!modelSupportsImages) {
      const names = imageAttachments.map((attachment) => attachment.name).join(", ");
      return `${message.content}\n\n[Note: ${imageAttachments.length} image attachment(s) (${names}) are in this turn but the current model does not support vision. Ask the user to switch to a vision-capable model to inspect them.]`;
    }

    return [
      { type: "text", text: message.content },
      ...imageAttachments.map((attachment) => ({
        type: "image_url" as const,
        image_url: { url: attachment.remoteUrl as string },
      })),
    ];
  };

  const workerMessages = messages.map((message) => ({
    role: message.role,
    content: buildMessageContent(message),
  }));

  const requestBody = JSON.stringify({
    conversationId,
    model: model.id,
    messages: workerMessages,
    attachments,
    enableSearch,
    forceSearch,
    researchMode,
    reasoningEffort,
  });

  const makeRequest = (token: string) =>
    fetch(`${getWorkerUrl()}/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: requestBody,
      signal: linkedSignal,
    });

  makeRequest(accessToken)
    .then(async (res) => {
      if (res.status === 401) {
        const refreshedToken = await refreshStreamAccessToken().catch(() => null);
        if (refreshedToken && refreshedToken !== accessToken) {
          res = await makeRequest(refreshedToken);
        }
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Worker error: ${res.status}${text ? ` ${text}` : ""}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Worker response is not streamable");
      }

      const decoder = new TextDecoder();
      let accumulated = "";
      let bufferedLine = "";

      const processLine = (line: string) => {
        if (!line.startsWith("data: ")) return false;

        const data = line.slice(6).trim();
        if (!data) return false;

        try {
          const parsed = JSON.parse(data);

          if (parsed.type === "sources" && Array.isArray(parsed.sources)) {
            callbacks.onSources?.(parsed.sources as Source[]);
            return false;
          }

          if (parsed.type === "research_step" && parsed.event) {
            callbacks.onResearchStep?.(parsed.event as ResearchTraceEvent);
            return false;
          }

          if (parsed.done) {
            callbacks.onDone({
              messageId: parsed.messageId ?? null,
              usage: parsed.usage ?? {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                chargedTotalCostInr: 0,
              },
            });
            return true;
          }

          if (parsed.error) {
            callbacks.onError(new Error(parsed.error));
            return true;
          }

          const delta = parsed.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            accumulated += delta;
            callbacks.onContent(accumulated);
          }
        } catch {
          // Ignore malformed SSE lines.
        }

        return false;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        bufferedLine += decoder.decode(value, { stream: true });
        const lines = bufferedLine.split("\n");
        bufferedLine = lines.pop() ?? "";

        for (const line of lines) {
          if (processLine(line)) return;
        }
      }

      const tail = bufferedLine + decoder.decode();
      if (tail && processLine(tail)) {
        return;
      }

      if (accumulated) {
        callbacks.onDone({
          messageId: null,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, chargedTotalCostInr: 0 },
        });
      }
    })
    .catch((err) => {
      if ((err as DOMException)?.name === "AbortError") return;
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    });

  return () => {
    if (!aborted) {
      abortController.abort();
    }
  };
}
