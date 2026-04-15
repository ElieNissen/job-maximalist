import type { NormalizedJob } from "@/lib/types";
import { deterministicHash } from "@/lib/hash";
import { canonicalUrl, normalizeText } from "@/lib/utils";

export function buildFingerprint(job: NormalizedJob): string {
  const payload = [
    normalizeText(job.title),
    normalizeText(job.company),
    normalizeText(job.location),
    canonicalUrl(job.url)
  ].join("|");

  return deterministicHash(payload);
}
