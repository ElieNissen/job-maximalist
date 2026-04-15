import { NextResponse } from "next/server";
import { getAtsConfig } from "@/lib/ats-config";
import { sendDiscordNotification } from "@/lib/discord-notifier";

export const runtime = "nodejs";

export async function POST() {
  try {
    const config = await getAtsConfig();
    if (!config.discordWebhookUrl) {
      return NextResponse.json({ ok: false, error: "discordWebhookUrl is empty" }, { status: 200 });
    }

    await sendDiscordNotification(config.discordWebhookUrl, [
      "ATS Radar test notification",
      `Timestamp: ${new Date().toISOString()}`
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Discord test failed" },
      { status: 200 }
    );
  }
}
