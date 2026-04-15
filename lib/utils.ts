export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function normalizeText(input: string): string {
  return decodeHtmlEntities(input)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function normalizeLocation(input: string): string {
  return normalizeText(input).replace(/\s+/g, " ");
}

export function parseContractType(input: string): "CDI" | "CDD" | "OTHER" {
  const normalized = normalizeText(input);
  if (normalized.includes("cdi")) return "CDI";
  if (normalized.includes("cdd")) return "CDD";
  return "OTHER";
}

export function canonicalUrl(input: string): string {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();

    if (host.includes("indeed.")) {
      const jk = url.searchParams.get("jk") || url.searchParams.get("vjk");
      if ((url.pathname === "/viewjob" || url.pathname === "/rc/clk") && jk) {
        return `${url.origin}/viewjob?jk=${jk}`;
      }
    }

    return `${url.origin}${url.pathname}`.replace(/\/$/, "");
  } catch {
    const withoutQuery = input.split("?")[0] ?? input;
    return withoutQuery.replace(/\/$/, "");
  }
}
