import { NextRequest, NextResponse } from "next/server";
import { getManualSources, setManualSources } from "@/lib/manual-sources";

export const runtime = "nodejs";

export async function GET() {
  const urls = await getManualSources();
  return NextResponse.json({ urls });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const urls = Array.isArray(body?.urls) ? body.urls.map(String) : [];
  const saved = await setManualSources(urls);
  return NextResponse.json({ urls: saved });
}
