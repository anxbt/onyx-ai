import { supabase } from "./supabase";

export function getWorkerUrl() {
  return (import.meta.env.VITE_WORKER_URL ?? "http://localhost:8787").replace(/\/+$/, "");
}

async function parseWorkerError(res: Response) {
  const text = await res.text().catch(() => "");
  return new Error(`Worker error: ${res.status}${text ? ` ${text}` : ""}`);
}

async function refreshWorkerAccessToken() {
  if (!supabase) return null;

  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.data.session?.access_token) {
    return refreshed.data.session.access_token;
  }

  const current = await supabase.auth.getSession();
  return current.data.session?.access_token ?? null;
}

export async function postWorker<TResponse, TBody extends object>(
  path: string,
  body: TBody,
  accessToken: string,
): Promise<TResponse> {
  const requestBody = JSON.stringify(body);
  const makeRequest = (token: string) =>
    fetch(`${getWorkerUrl()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: requestBody,
    });

  let res = await makeRequest(accessToken);
  if (res.status === 401) {
    const refreshedToken = await refreshWorkerAccessToken().catch(() => null);
    if (refreshedToken && refreshedToken !== accessToken) {
      res = await makeRequest(refreshedToken);
    }
  }

  if (!res.ok) {
    throw await parseWorkerError(res);
  }

  return (await res.json()) as TResponse;
}

export async function checkWorkerHealth() {
  const res = await fetch(`${getWorkerUrl()}/health`);
  if (!res.ok) {
    throw await parseWorkerError(res);
  }
  return (await res.json()) as { ok?: boolean; service?: string };
}

export function summarizeConversation(body: { conversationId: string }, accessToken: string) {
  return postWorker<{ ok: boolean; summary?: string; key_facts?: string[] }, typeof body>("/chat/summarize", body, accessToken);
}

export function getEmbedding(text: string, accessToken: string) {
  return postWorker<{ ok?: boolean; embedding?: number[] }, { text: string }>("/embed", { text }, accessToken).then(
    (data) => data.embedding ?? [],
  );
}

export function extractMemoryFacts(conversationId: string, accessToken: string) {
  return postWorker<{ ok: boolean; extracted?: number }, { conversationId: string }>("/memory/extract", { conversationId }, accessToken);
}

export function searchWeb(body: { query: string; conversationId?: string }, accessToken: string) {
  return postWorker<
    { ok: boolean; results?: unknown[]; answer?: string; topics?: string[]; relatedFacts?: unknown[]; searchId?: string },
    typeof body
  >("/search", body, accessToken);
}

export function crawlUrl(url: string, accessToken: string) {
  return postWorker<{ ok: boolean; title?: string; url?: string; content?: string; contentLength?: number }, { url: string }>(
    "/crawl",
    { url },
    accessToken,
  );
}

export function analyzeUpload(body: { uploadId: string; storagePath: string; mimeType: string }, accessToken: string) {
  return postWorker<{ ok: boolean; contentType?: string; description?: string; transcribedText?: string }, typeof body>(
    "/upload/analyze",
    body,
    accessToken,
  );
}

export function createOrder(
  body: { packId?: string; amount?: number; amountPaise?: number; currency?: string; receipt?: string },
  accessToken: string,
) {
  return postWorker<{ keyId: string; orderId: string; order_id?: string; amount: number; currency: string }, typeof body>(
    "/payments/create-order",
    body,
    accessToken,
  );
}

export function verifyPayment(
  body: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  },
  accessToken: string,
) {
  return postWorker<{ ok: boolean }, typeof body>("/payments/verify", body, accessToken);
}
