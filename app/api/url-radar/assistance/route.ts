import { NextRequest, NextResponse } from "next/server";
import { assistanceStatus, downloadLocalModel, deferLocalRepair, clearSourceConnectionWarning } from "@/lib/local-assistance";
import { getUrlRadarConfig } from "@/lib/url-radar-config";
import { requestSourceRepair } from "@/lib/url-radar-service";
import { beginSourceConnection, finishSourceConnection, cancelSourceConnection, forgetSourceSession, sourceSessionStatus } from "@/lib/source-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const [status, config] = await Promise.all([assistanceStatus(), getUrlRadarConfig()]);
  const sessions = Object.fromEntries(await Promise.all(config.urls.map(async (url) => [url, await sourceSessionStatus(url).catch(() => "none")])));
  return NextResponse.json({ ...status, sessions, mode: config.assistanceMode ?? "off", urls: config.urls });
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
  if (!["repair", "defer", "connect", "finish_connection", "cancel_connection", "forget_session"].includes(body?.action) || typeof body.url !== "string" || !config.urls.includes(body.url)) return NextResponse.json({ error: "Choisis une URL enregistrée." }, { status: 400 });
  try {
    if (body.action === "connect") { await beginSourceConnection(body.url); return NextResponse.json({ ok: true }); }
    if (body.action === "finish_connection") {
      await finishSourceConnection(body.url);
      await clearSourceConnectionWarning(body.url);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "cancel_connection") { await cancelSourceConnection(body.url); return NextResponse.json({ ok: true }); }
    if (body.action === "forget_session") { await forgetSourceSession(body.url); return NextResponse.json({ ok: true }); }
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Connexion indisponible." }, { status: 409 }); }
  if (body.action === "defer") { await deferLocalRepair(body.url); return NextResponse.json({ ok: true }); }
  if (!config.assistanceMode || config.assistanceMode === "off") return NextResponse.json({ error: "Active et enregistre l’assistance locale dans les réglages." }, { status: 409 });
  await requestSourceRepair(body.url);
  return NextResponse.json({ ok: true }, { status: 202 });
}
