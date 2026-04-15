import { NextResponse } from "next/server";
import { getPolitepolConfig } from "@/lib/politepol-config";
import { refreshPolitepol } from "@/lib/politepol-service";
import { initScheduler } from "@/lib/scheduler";

export const runtime = "nodejs";

async function runRefresh() {
  initScheduler();

  try {
    const config = await getPolitepolConfig();
    if (!config.enabled) {
      return NextResponse.json({ ok: true, totalNew: 0, summary: {}, skipped: "PolitePol disabled" });
    }

    const result = await refreshPolitepol(config);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        totalNew: 0,
        summary: {},
        error: error instanceof Error ? error.message : "PolitePol refresh failed"
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
