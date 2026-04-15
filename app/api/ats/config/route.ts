import { NextRequest, NextResponse } from "next/server";
import { getAtsConfig, setAtsConfig } from "@/lib/ats-config";
import { initScheduler } from "@/lib/scheduler";

export const runtime = "nodejs";

export async function GET() {
  initScheduler();
  const config = await getAtsConfig();
  return NextResponse.json(config);
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const saved = await setAtsConfig(body);
  return NextResponse.json(saved);
}
