function getWorkerUrl() {
  return (process.env.EXPO_PUBLIC_WORKER_URL || "http://localhost:8787").replace(/\/+$/, "");
}

export interface CrawlResult {
  ok: boolean;
  title: string;
  url: string;
  content: string;
  contentLength: number;
}

export async function crawlUrl(url: string, accessToken: string): Promise<CrawlResult> {
  const res = await fetch(`${getWorkerUrl()}/crawl`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Crawl failed: ${res.status} ${text}`);
  }

  return (await res.json()) as CrawlResult;
}
