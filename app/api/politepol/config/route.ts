import { NextRequest, NextResponse } from "next/server";
import { getPolitepolConfig, setPolitepolConfig } from "@/lib/politepol-config";
import { initScheduler } from "@/lib/scheduler";

export const runtime = "nodejs";

export async function GET() {
  initScheduler();
  const config = await getPolitepolConfig();
  return NextResponse.json(config);
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const saved = await setPolitepolConfig(body);
  return NextResponse.json(saved);
}
