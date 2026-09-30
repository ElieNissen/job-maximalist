export type AssistanceMode = "off" | "ask" | "auto";
export type RepairStatus = "needs_permission" | "queued" | "repairing" | "repaired" | "failed" | "unavailable" | "empty" | "deferred" | "connection_required" | "incomplete";
export interface RepairInfo {
  status: RepairStatus;
  message: string;
  updatedAt: string;
}
export const LOCAL_MODEL = "qwen3.5:4b";
