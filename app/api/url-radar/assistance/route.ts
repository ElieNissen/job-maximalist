import { NextRequest, NextResponse } from "next/server";
import { assistanceStatus, downloadLocalModel, deferLocalRepair } from "@/lib/local-assistance";
import { getUrlRadarConfig } from "@/lib/url-radar-config";
import { requestSourceRepair } from "@/lib/url-radar-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const [status, config] = await Promise.all([assistanceStatus(), getUrlRadarConfig()]);
  return NextResponse.json({ ...status, mode: config.assistanceMode ?? "off", urls: config.urls });
}
export async function POST(request: NextRequest) {
  // A web page opened elsewhere must not be able to start local inference/downloads.
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (body?.action === "download") {
    downloadLocalModel();
    return NextResponse.json({ ok: true }, { status: 202 });
  }
  const config = await getUrlRadarConfig();
  if (!["repair", "defer"].includes(body?.action) || typeof body.url !== "string" || !config.urls.includes(body.url)) return NextResponse.json({ error: "Choisis une URL enregistrée." }, { status: 400 });
  if (body.action === "defer") { await deferLocalRepair(body.url); return NextResponse.json({ ok: true }); }
  if (!config.assistanceMode || config.assistanceMode === "off") return NextResponse.json({ error: "Active et enregistre l’assistance locale dans les réglages." }, { status: 409 });
  await requestSourceRepair(body.url);
  return NextResponse.json({ ok: true }, { status: 202 });
}
