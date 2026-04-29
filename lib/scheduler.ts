import cron, { type ScheduledTask } from "node-cron";
import { getUrlRadarConfig } from "@/lib/url-radar-config";
import { refreshUrlRadar } from "@/lib/url-radar-service";

let scheduler: ScheduledTask | null = null;
let schedulerEnabled = false;
let urlRadarRunning = false;
let lastUrlRadarRunAt = 0;

async function runUrlRadarIfDue() {
  if (urlRadarRunning) return;

  const config = await getUrlRadarConfig();
  if (!config.enabled) return;

  const intervalMs = Math.max(15, config.intervalMinutes) * 60 * 1000;
  const now = Date.now();
  if (now - lastUrlRadarRunAt < intervalMs) return;

  urlRadarRunning = true;
  try {
    await refreshUrlRadar(config);
    lastUrlRadarRunAt = Date.now();
  } finally {
    urlRadarRunning = false;
  }
}

export function initScheduler() {
  if (schedulerEnabled) return;

  scheduler = cron.schedule(
    "*/5 * * * *",
    async () => {
      await runUrlRadarIfDue();
    },
    {
      timezone: "Europe/Paris"
    }
  );

  schedulerEnabled = true;
}

export function getSchedulerStatus() {
  return {
    enabled: schedulerEnabled,
    running: scheduler?.getStatus() === "scheduled",
    urlRadarRunning,
    lastUrlRadarRunAt: lastUrlRadarRunAt > 0 ? new Date(lastUrlRadarRunAt).toISOString() : null
  };
}
