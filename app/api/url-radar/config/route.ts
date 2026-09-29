import { NextRequest, NextResponse } from "next/server";
import { getUrlRadarConfig, setUrlRadarConfig } from "@/lib/url-radar-config";
import { reclassifyUrlRadarState } from "@/lib/url-radar-service";
import { initScheduler } from "@/lib/scheduler";
import { isOnboardingTestProfile } from "@/lib/runtime-paths";
import { cancelLocalRepairs } from "@/lib/local-assistance";

export const runtime = "nodejs";

export async function GET() {
  initScheduler();
  const config = await getUrlRadarConfig();
  return NextResponse.json({ ...config, isOnboardingTestProfile: isOnboardingTestProfile() });
}

export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const saved = await setUrlRadarConfig(body);
  if (saved.assistanceMode === "off") cancelLocalRepairs();
  await reclassifyUrlRadarState(saved);
  return NextResponse.json({ ...saved, isOnboardingTestProfile: isOnboardingTestProfile() });
}
