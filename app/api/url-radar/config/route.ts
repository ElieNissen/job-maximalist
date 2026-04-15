import { NextRequest, NextResponse } from "next/server";
import { getUrlRadarConfig, setUrlRadarConfig } from "@/lib/url-radar-config";
import { reclassifyUrlRadarState } from "@/lib/url-radar-service";
import { initScheduler } from "@/lib/scheduler";

export const runtime = "nodejs";

export async function GET() {
  initScheduler();
  const config = await getUrlRadarConfig();
  return NextResponse.json(config);
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const saved = await setUrlRadarConfig(body);
  await reclassifyUrlRadarState(saved);
  return NextResponse.json(saved);
}
