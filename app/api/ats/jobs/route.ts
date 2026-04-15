import { NextRequest, NextResponse } from "next/server";
import { getAtsJobs } from "@/lib/ats-service";
import { initScheduler } from "@/lib/scheduler";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  initScheduler();

  try {
    const page = Number(request.nextUrl.searchParams.get("page") ?? 1);
    const pageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? 20);
    const data = await getAtsJobs(page, pageSize);
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        error: error instanceof Error ? error.message : "ATS jobs failed"
      },
      { status: 200 }
    );
  }
}
