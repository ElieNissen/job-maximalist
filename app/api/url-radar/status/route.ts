import { NextResponse } from "next/server";
import { getUrlRadarConfig } from "@/lib/url-radar-config";
import { getUrlRadarStatus } from "@/lib/url-radar-service";
import { initScheduler } from "@/lib/scheduler";

export const runtime = "nodejs";

export async function GET() {
  initScheduler();

  try {
    const config = await getUrlRadarConfig();
    const data = await getUrlRadarStatus(config);
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        totalInDb: 0,
        totalVisible: 0,
        excludedReasons: {},
        runs: [],
        error: error instanceof Error ? error.message : "URL Radar status failed"
      },
      { status: 200 }
    );
  }
}
