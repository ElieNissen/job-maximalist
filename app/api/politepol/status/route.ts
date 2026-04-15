import { NextResponse } from "next/server";
import { getPolitepolStatus } from "@/lib/politepol-service";
import { initScheduler } from "@/lib/scheduler";

export const runtime = "nodejs";

export async function GET() {
  initScheduler();

  try {
    const data = await getPolitepolStatus();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        totalVisible: 0,
        totalInDb: 0,
        excludedReasons: {},
        runs: [],
        error: error instanceof Error ? error.message : "PolitePol status failed"
      },
      { status: 200 }
    );
  }
}
