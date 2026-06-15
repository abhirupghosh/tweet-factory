const SEARCH_URL = "https://api.tavily.com/search";
const EXTRACT_URL = "https://api.tavily.com/extract";

export interface SearchResult {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
}
export interface SearchResponse {
  answer?: string;
  results?: SearchResult[];
}

export interface SearchOpts {
  topic?: "news" | "general";
  days?: number;
  max?: number;
  depth?: "basic" | "advanced";
}

export async function tavilySearch(key: string, query: string, opts: SearchOpts = {}): Promise<SearchResponse> {
  const topic = opts.topic ?? "news";
  const body: Record<string, unknown> = {
    api_key: key,
    query,
    max_results: opts.max ?? 5,
    search_depth: opts.depth ?? "basic",
    include_answer: true,
    topic,
  };
  if (topic === "news") body.days = opts.days ?? 7;
  const r = await fetch(SEARCH_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Tavily search failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as SearchResponse;
}

/** Returns the extracted article body, or null on failure. */
export async function tavilyExtract(key: string, url: string): Promise<string | null> {
  const r = await fetch(EXTRACT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, urls: [url], extract_depth: "advanced" }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) return null;
  const data = (await r.json()) as { results?: { raw_content?: string }[] };
  return data.results?.[0]?.raw_content ?? null;
}
