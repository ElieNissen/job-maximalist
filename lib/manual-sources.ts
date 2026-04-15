import fs from "fs/promises";
import path from "path";

const DEFAULT_MANUAL_SOURCES = [
  "https://www.linkedin.com/jobs/search-results/?currentJobId=4378805531&keywords=Product%20Designer%20OR%20UX%2FUI%20Designer%20OR%20UX%20Designer&origin=JOB_SEARCH_PAGE_JOB_FILTER&referralSearchId=MHHJXUCr6fOPFINe6SutdA%3D%3D&f_TPR=r86400",
  "https://www.welcometothejungle.com/fr/jobs?query=Product%20Designer%20OR%20UX%2FUI%20Designer%20OR%20UX%20Designer&refinementList%5Bcontract_type%5D%5B%5D=full_time&refinementList%5Boffices.country_code%5D%5B%5D=FR&page=1&sortBy=mostRecent",
  "https://choisirleservicepublic.gouv.fr/nos-offres/filtres/mot-cles/designer/localisation/208/"
];

const FILE_PATH = path.join(process.cwd(), "data", "manual-sources.json");

function sanitize(list: string[]): string[] {
  return Array.from(
    new Set(
      list
        .map((url) => url.trim())
        .filter((url) => url.length > 0)
        .filter((url) => /^https?:\/\//i.test(url))
    )
  );
}

export async function getManualSources(): Promise<string[]> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_MANUAL_SOURCES;
    return sanitize(parsed.map(String));
  } catch {
    await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
    await fs.writeFile(FILE_PATH, JSON.stringify(DEFAULT_MANUAL_SOURCES, null, 2), "utf8");
    return DEFAULT_MANUAL_SOURCES;
  }
}

export async function setManualSources(urls: string[]): Promise<string[]> {
  const cleaned = sanitize(urls);
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(cleaned, null, 2), "utf8");
  return cleaned;
}
