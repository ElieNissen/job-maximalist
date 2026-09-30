"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AssistanceMode, RepairInfo } from "@/lib/local-assistance-types";

type Action = "download" | "repair" | "defer" | "connect" | "finish_connection" | "cancel_connection" | "forget_session";
type Status = { available: boolean; modelReady: boolean; downloading: boolean; downloadMessage: string | null; mode: AssistanceMode; urls: string[]; sources: Record<string, RepairInfo | undefined>; sessions?: Record<string, "none" | "opening" | "connecting" | "saved"> };
type Context = { status: Status | null; error: string | null; act: (action: Action, url?: string) => Promise<void>; refresh: () => Promise<void> };
const AssistanceContext = createContext<Context | null>(null);
export function AssistanceProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previous = useRef<Status | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/url-radar/assistance", { cache: "no-store" });
      if (!response.ok) return;
      const next: Status = await response.json();
      if (previous.current && Object.entries(next.sources).some(([url, info]) => info?.status === "repaired" && previous.current?.sources[url]?.updatedAt !== info.updatedAt)) {
        window.dispatchEvent(new Event("radar-repair-completed"));
      }
      previous.current = next; setStatus(next);
    } catch { /* App remains usable when optional assistance is unavailable. */ }
  }, []);
  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (active) timeout = setTimeout(poll, previous.current?.downloading || Object.values(previous.current?.sources ?? {}).some((s) => s && ["queued", "repairing"].includes(s.status)) ? 3000 : 15000);
    };
    void poll();
    window.addEventListener("radar-config-saved", refresh);
    return () => { active = false; clearTimeout(timeout); window.removeEventListener("radar-config-saved", refresh); };
  }, [refresh]);
  const act = useCallback(async (action: Action, url?: string) => {
    setError(null);
    try {
      const response = await fetch("/api/url-radar/assistance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, url }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "L’assistance est indisponible.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "L’assistance est indisponible."); }
  }, [refresh]);
  return <AssistanceContext.Provider value={{ status, error, act, refresh }}>{children}</AssistanceContext.Provider>;
}
function useAssistance() {
  const context = useContext(AssistanceContext);
  if (!context) throw new Error("AssistanceProvider is missing");
  return context;
}
function sourceInfo(status: Status | null, url: string) {
  try { const u = new URL(url); u.hash = ""; u.searchParams.sort(); return status?.sources[u.href]; } catch { return undefined; }
}

export function AssistanceSettings({ value, onChange }: { value: AssistanceMode; onChange: (value: AssistanceMode) => void }) {
  const { status, error, act, refresh } = useAssistance();
  return <section className="radar-filter-group radar-local-assistance" aria-label="Assistance locale">
    <strong>Assistance locale</strong>
    <p className="radar-secondary-note">Si un site change, une IA sur ton ordinateur peut rétablir la récupération des offres. Elle intervient uniquement pour réparer, puis s’arrête.</p>
    <div className="radar-filter-preferences__row" role="radiogroup" aria-label="Autorisation de réparation">
      {([["off", "Désactivée"], ["ask", "Me demander"], ["auto", "Automatique"]] as const).map(([mode, label]) => <label key={mode} className={`radar-checkbox-row radar-checkbox-row--compact radar-radio-row${value === mode ? " is-checked" : ""}`}>
        <input className="radar-checkbox-row__input" type="radio" name="assistance-mode" checked={value === mode} onChange={() => onChange(mode)} />
        <span className="radar-checkbox-row__control" aria-hidden="true" /><span className="radar-checkbox-row__label">{label}</span>
      </label>)}
    </div>
    {value === "off" ? <p className="radar-secondary-note">Certains sites peuvent cesser de fournir des offres après une modification. Tu pourras activer l’assistance plus tard.</p> : <>
      <p className="radar-secondary-note">{value === "ask" ? "Ton accord sera demandé avant chaque réparation." : "Les réparations se feront en arrière-plan, sans confirmation répétée."} Enregistre pour appliquer ce choix.</p>
      {!status ? <p role="status">Vérification de l’installation…</p> : !status.available ? <div className="radar-inline-actions">
        <a className="radar-inline-button" href="https://ollama.com/download" target="_blank" rel="noreferrer">Installer Ollama</a>
        <button type="button" className="radar-inline-button" onClick={() => void refresh()}>Vérifier à nouveau</button>
        <p className="radar-secondary-note">Installe puis ouvre Ollama. Tu pourras télécharger le modèle ici.</p>
      </div> : status.modelReady ? <p className="radar-secondary-note">L’assistance est prête sur cet ordinateur.</p> : <>
        <p className="radar-secondary-note">Téléchargement unique de Qwen 3.5 4B : environ 3,4 Go, en plus d’Ollama. Aucun abonnement. Les pages analysées restent sur cet ordinateur.</p>
        <button type="button" className="radar-inline-button" disabled={status.downloading} onClick={() => void act("download")}>{status.downloading ? "Téléchargement en cours…" : "Télécharger le modèle (3,4 Go)"}</button>
      </>}
      {status?.downloadMessage ? <p className="radar-secondary-note" role="status">{status.downloadMessage}</p> : null}
    </>}
    {error ? <p role="alert" className="radar-inline-error">{error}</p> : null}
  </section>;
}

export function SourceRepair({ url }: { url: string }) {
  const { status, act, error } = useAssistance();
  const [sending, setSending] = useState(false);
  const info = sourceInfo(status, url);
  const enabled = status?.mode !== "off" && status?.urls.includes(url);
  const busy = sending || info?.status === "queued" || info?.status === "repairing";
  const session = status?.sessions?.[url] ?? "none";
  const send = async (action: Action) => { setSending(true); try { await act(action, url); } finally { setSending(false); } };
  if (!url) return null;
  return <div className="radar-local-repair">
    {info ? <p className="radar-secondary-note" role="status">{info.message}</p> : null}
    <button type="button" className="radar-inline-button" disabled={!enabled || busy} onClick={async () => { setSending(true); try { await act("repair", url); } finally { setSending(false); } }}>
      {busy ? "Réparation en cours…" : info?.status === "needs_permission" ? "Autoriser cette réparation" : "Réparer la récupération des offres"}
    </button>
    {info?.status === "needs_permission" && !busy ? <button type="button" className="radar-inline-button" onClick={() => void act("defer", url)}>Plus tard</button> : null}
    {!enabled ? <p className="radar-secondary-note">Active et enregistre l’assistance locale dans l’onglet URLs pour réparer cette source.</p> : null}
    <details className="radar-source-session" open={session === "connecting" || info?.status === "connection_required" ? true : undefined}>
      <summary>Connexion au site{session === "saved" ? " · session sauvegardée" : ""}</summary>
      {session === "connecting" ? <>
        <p className="radar-secondary-note">Connecte-toi dans la fenêtre ouverte, puis reviens ici. La session sera conservée uniquement sur cet ordinateur, pour ce site.</p>
        <div className="radar-inline-actions">
          <button type="button" className="radar-inline-button" disabled={sending} onClick={() => void send("finish_connection")}>{sending ? "Vérification…" : "J’ai terminé la connexion"}</button>
          <button type="button" className="radar-inline-button" disabled={sending} onClick={() => void send("cancel_connection")}>Annuler la connexion</button>
        </div>
      </> : <>
        <p className="radar-secondary-note">{session === "saved" ? "Tu peux fermer la fenêtre de connexion : la session est sauvegardée sur cet ordinateur. Sa durée dépend du site ; si elle expire, reconnecte-toi ici." : "Si les offres nécessitent un compte, ouvre une fenêtre dédiée pour te connecter. Tes identifiants ne sont pas transmis à l’IA."}</p>
        <div className="radar-inline-actions">
          <button type="button" className="radar-inline-button" disabled={sending || session === "opening" || !status?.urls.includes(url)} onClick={() => void send("connect")}>{sending || session === "opening" ? "Ouverture…" : session === "saved" ? "Se reconnecter" : "Se connecter au site"}</button>
          {session === "saved" ? <button type="button" className="radar-inline-button" disabled={sending} onClick={() => void send("forget_session")}>Oublier la session locale</button> : null}
        </div>
      </>}
    </details>
    {error ? <p className="radar-inline-error" role="alert">{error}</p> : null}
  </div>;
}

export function AssistanceActivity({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { status } = useAssistance();
  if (!status) return null;
  const relevant = status.urls.map((url) => sourceInfo(status, url)).filter(Boolean);
  const pending = status.mode !== "off" ? relevant.filter((s) => s?.status === "needs_permission").length : 0;
  const busy = relevant.some((s) => s?.status === "queued" || s?.status === "repairing");
  const unavailable = relevant.some((s) => s?.status === "connection_required" || s?.status === "incomplete" || (status.mode !== "off" && (s?.status === "unavailable" || s?.status === "failed")));
  if (!pending && !busy && !unavailable) return null;
  return <div className="radar-assistance-activity" role="status">
    <span>{busy ? "Rétablissement d’une source en arrière-plan…" : pending ? `${pending} source(s) attendent ton accord pour une réparation.` : "Une source nécessite ton attention."}</span>
    <button type="button" className="radar-inline-button" onClick={onOpenSettings}>Ouvrir les réglages</button>
  </div>;
}
