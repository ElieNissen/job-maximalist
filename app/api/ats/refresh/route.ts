import { NextResponse } from "next/server";
import { getAtsConfig } from "@/lib/ats-config";
import { refreshAts } from "@/lib/ats-service";
import { initScheduler } from "@/lib/scheduler";

export const runtime = "nodejs";

async function runRefresh() {
  initScheduler();

  try {
    const config = await getAtsConfig();
    if (!config.enabled) {
      return NextResponse.json({ ok: true, totalNew: 0, summary: {}, skipped: "ATS disabled" });
    }

    const result = await refreshAts(config);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        totalNew: 0,
        summary: {},
        error: error instanceof Error ? error.message : "ATS refresh failed"
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
