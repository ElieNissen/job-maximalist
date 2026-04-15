export async function sendDiscordNotification(webhookUrl: string, lines: string[]): Promise<void> {
  if (!webhookUrl) return;

  const body = {
    content: lines.join("\n").slice(0, 1900)
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed with HTTP ${response.status}`);
  }
}
