import { NextResponse } from "next/server";
import { getUrlRadarConfig } from "@/lib/url-radar-config";
import { refreshUrlRadar } from "@/lib/url-radar-service";
import { initScheduler } from "@/lib/scheduler";

export const runtime = "nodejs";

async function runRefresh() {
  initScheduler();

  try {
    const config = await getUrlRadarConfig();
    const result = await refreshUrlRadar(config);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        totalNew: 0,
        summary: {},
        error: error instanceof Error ? error.message : "URL Radar refresh failed"
      },
      { status: 200 }
    );
  }
}

export async function POST() {
  return runRefresh();
}

export async function GET() {
  return runRefresh();
}
