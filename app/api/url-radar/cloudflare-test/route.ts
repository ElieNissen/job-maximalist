import { NextRequest, NextResponse } from "next/server";
import {
  canUseCloudflareForUrl,
  fetchRenderedHtmlViaCloudflare,
  fetchRenderedHtmlViaCloudflareCrawl,
  isCloudflareRenderingConfigured
} from "@/lib/cloudflare-browser-rendering";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const defaultUrl = "https://example.com";
  const targetUrl = request.nextUrl.searchParams.get("url")?.trim() || defaultUrl;

  if (!isCloudflareRenderingConfigured()) {
    return NextResponse.json({
      ok: false,
      targetUrl,
      canUse: false,
      configured: false,
      error: "Cloudflare non configure"
    });
  }

  if (!canUseCloudflareForUrl(targetUrl)) {
    return NextResponse.json({
      ok: false,
      targetUrl,
      canUse: false,
      configured: true,
      error: "URL non compatible avec le test Cloudflare"
    });
  }

  const result: Record<string, unknown> = {
    ok: true,
    targetUrl,
    configured: true,
    canUse: true
  };

  try {
    const html = await fetchRenderedHtmlViaCloudflare(targetUrl);
    result.content = {
      ok: Boolean(html),
      htmlLength: html?.length ?? 0
    };
  } catch (error) {
    result.content = {
      ok: false,
      error: error instanceof Error ? error.message : "Cloudflare content failed"
    };
  }

  try {
    const html = await fetchRenderedHtmlViaCloudflareCrawl(targetUrl);
    result.crawl = {
      ok: Boolean(html),
      htmlLength: html?.length ?? 0
    };
  } catch (error) {
    result.crawl = {
      ok: false,
      error: error instanceof Error ? error.message : "Cloudflare crawl failed"
    };
  }

  return NextResponse.json(result);
}
