import { NextRequest, NextResponse } from "next/server";
import { updateUrlRadarJobStatus } from "@/lib/url-radar-service";

export const runtime = "nodejs";

interface Context {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  const viewed = Boolean(body?.viewed);
  const saved = Boolean(body?.saved);

  const updated = await updateUrlRadarJobStatus(id, viewed, saved);
  if (!updated) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}