import { NextResponse } from "next/server";
import { getSchedulerStatus, initScheduler } from "@/lib/scheduler";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  initScheduler();
  const lastRun = await prisma.refreshRun.findFirst({ orderBy: { startedAt: "desc" } });

  return NextResponse.json({
    status: "ok",
    scheduler: getSchedulerStatus(),
    connectors: ["url_radar"],
    lastRun
  });
}

