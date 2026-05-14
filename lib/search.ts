function getWorkerUrl() {
  return (process.env.EXPO_PUBLIC_WORKER_URL || "http://localhost:8787").replace(/\/+$/, "");
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface SearchResponse {
  ok: boolean;
  results: SearchResult[];
  answer: string;
  topics: string[];
  relatedFacts: Array<{ content: string; category: string }>;
  searchId: string | null;
}

export async function searchWeb(
  query: string,
  conversationId: string | null,
  accessToken: string,
): Promise<SearchResponse> {
  const res = await fetch(`${getWorkerUrl()}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, conversationId }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Search failed: ${res.status} ${text}`);
  }

  return (await res.json()) as SearchResponse;
}
