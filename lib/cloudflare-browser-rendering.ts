import { canUseCloudflareForHost } from "@/lib/url-radar-sources";

const POLL_ATTEMPTS = 8;
const POLL_DELAY_MS = 2500;

interface ContentResponse {
  result?: {
    html?: string;
  };
}

interface CrawlRecord {
  html?: string;
  status?: string;
}

interface CrawlPollResponse {
  result?: {
    status?: string;
    records?: CrawlRecord[];
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCredentials() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !apiToken) return null;
  return { accountId, apiToken };
}

export function isCloudflareRenderingConfigured(): boolean {
  return getCredentials() !== null;
}

export function canUseCloudflareForUrl(targetUrl: string): boolean {
  try {
    return canUseCloudflareForHost(targetUrl);
  } catch {
    return false;
  }
}

function buildHeaders(apiToken: string) {
  return {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json"
  };
}

export async function fetchRenderedHtmlViaCloudflare(targetUrl: string): Promise<string | null> {
  const credentials = getCredentials();
  if (!credentials || !canUseCloudflareForUrl(targetUrl)) return null;

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/browser-rendering/content`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildHeaders(credentials.apiToken),
    body: JSON.stringify({
      url: targetUrl,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      gotoOptions: {
        waitUntil: "networkidle2",
        timeout: 45000
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Cloudflare content failed (${response.status})`);
  }

  const payload = (await response.json()) as ContentResponse;
  return payload.result?.html ?? null;
}

export async function fetchRenderedHtmlViaCloudflareCrawl(targetUrl: string): Promise<string | null> {
  const credentials = getCredentials();
  if (!credentials || !canUseCloudflareForUrl(targetUrl)) return null;

  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/browser-rendering/crawl`;
  const startResponse = await fetch(baseUrl, {
    method: "POST",
    headers: buildHeaders(credentials.apiToken),
    body: JSON.stringify({
      url: targetUrl,
      limit: 1,
      depth: 0,
      source: "links",
      render: true,
      formats: ["html"],
      gotoOptions: {
        waitUntil: "networkidle2",
        timeout: 45000
      }
    })
  });

  if (!startResponse.ok) {
    throw new Error(`Cloudflare crawl failed (${startResponse.status})`);
  }

  const startPayload = (await startResponse.json()) as { result?: string };
  if (!startPayload.result) {
    throw new Error("Cloudflare crawl returned no job id");
  }

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const pollResponse = await fetch(`${baseUrl}/${startPayload.result}?limit=1`, {
      headers: buildHeaders(credentials.apiToken)
    });

    if (!pollResponse.ok) {
      throw new Error(`Cloudflare crawl poll failed (${pollResponse.status})`);
    }

    const payload = (await pollResponse.json()) as CrawlPollResponse;
    const status = payload.result?.status;
    if (status === "running") {
      await sleep(POLL_DELAY_MS);
      continue;
    }

    const record = payload.result?.records?.find((item) => item.status === "completed" && typeof item.html === "string");
    return record?.html ?? null;
  }

  throw new Error("Cloudflare crawl timed out");
}
