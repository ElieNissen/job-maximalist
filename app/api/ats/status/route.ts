import { NextResponse } from "next/server";
import { getAtsStatus } from "@/lib/ats-service";
import { initScheduler } from "@/lib/scheduler";

export const runtime = "nodejs";

export async function GET() {
  initScheduler();

  try {
    const data = await getAtsStatus();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        totalVisibleAtsJobs: 0,
        runs: [],
        error: error instanceof Error ? error.message : "ATS status failed"
      },
      { status: 200 }
    );
  }
}
