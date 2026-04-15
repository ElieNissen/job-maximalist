import cron, { type ScheduledTask } from "node-cron";
import { refreshJobs } from "@/lib/refresh-service";
import { getAtsConfig } from "@/lib/ats-config";
import { refreshAts } from "@/lib/ats-service";
import { getPolitepolConfig } from "@/lib/politepol-config";
import { refreshPolitepol } from "@/lib/politepol-service";
import { getUrlRadarConfig } from "@/lib/url-radar-config";
import { refreshUrlRadar } from "@/lib/url-radar-service";

let scheduler: ScheduledTask | null = null;
let schedulerEnabled = false;
let atsRunning = false;
let politepolRunning = false;
let urlRadarRunning = false;
let lastAtsRunAt = 0;
let lastPolitepolRunAt = 0;
let lastUrlRadarRunAt = 0;

async function runAtsIfDue() {
  if (atsRunning) return;

  const config = await getAtsConfig();
  if (!config.enabled) return;

  const intervalMs = Math.max(15, config.intervalMinutes) * 60 * 1000;
  const now = Date.now();
  if (now - lastAtsRunAt < intervalMs) return;

  atsRunning = true;
  try {
    await refreshAts(config);
    lastAtsRunAt = Date.now();
  } finally {
    atsRunning = false;
  }
}

async function runPolitepolIfDue() {
  if (politepolRunning) return;

  const config = await getPolitepolConfig();
  if (!config.enabled) return;

  const intervalMs = Math.max(15, config.intervalMinutes) * 60 * 1000;
  const now = Date.now();
  if (now - lastPolitepolRunAt < intervalMs) return;

  politepolRunning = true;
  try {
    await refreshPolitepol(config);
    lastPolitepolRunAt = Date.now();
  } finally {
    politepolRunning = false;
  }
}

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
      const now = new Date();
      const parisHour = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Paris",
          hour: "2-digit",
          hourCycle: "h23"
        }).format(now)
      );

      if (parisHour >= 8 && parisHour <= 19) {
        await refreshJobs();
      }

      await runAtsIfDue();
      await runPolitepolIfDue();
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
    atsRunning,
    politepolRunning,
    urlRadarRunning,
    lastAtsRunAt: lastAtsRunAt > 0 ? new Date(lastAtsRunAt).toISOString() : null,
    lastPolitepolRunAt: lastPolitepolRunAt > 0 ? new Date(lastPolitepolRunAt).toISOString() : null,
    lastUrlRadarRunAt: lastUrlRadarRunAt > 0 ? new Date(lastUrlRadarRunAt).toISOString() : null
  };
}