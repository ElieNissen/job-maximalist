import { NextRequest, NextResponse } from "next/server";
import { initScheduler } from "@/lib/scheduler";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteParams) {
  initScheduler();
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  const data: { viewed?: boolean; saved?: boolean } = {};

  if (typeof body?.viewed === "boolean") {
    data.viewed = body.viewed;
  }
  if (typeof body?.saved === "boolean") {
    data.saved = body.saved;
  }

  const updated = await prisma.job.update({
    where: { id },
    data
  });

  return NextResponse.json(updated);
}
