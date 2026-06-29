/**
 * Per-wallet activity log stored in localStorage on this device only.
 * Entries are keyed by wallet address — other users cannot read them from the app UI.
 */

export type UserActivityKind = "deposit" | "withdraw" | "strategy";

export interface UserActivityEntry {
  id: string;
  kind: UserActivityKind;
  timestamp: string;
  chainId?: number;
  token?: string;
  amount?: string | number;
  txHash?: string | null;
  status?: string;
  label?: string;
  strategyId?: string;
}

const STORAGE_PREFIX = "siphon-activity-v1:";
const MAX_ENTRIES = 500;

function storageKey(wallet: string): string {
  return `${STORAGE_PREFIX}${wallet.toLowerCase()}`;
}

function readRaw(wallet: string): UserActivityEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(wallet));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserActivityEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(wallet: string, entries: UserActivityEntry[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(wallet), JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function getUserActivities(wallet: string): UserActivityEntry[] {
  return readRaw(wallet).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export function appendUserActivity(
  wallet: string,
  entry: Omit<UserActivityEntry, "id" | "timestamp"> & {
    id?: string;
    timestamp?: string;
  },
): UserActivityEntry {
  const row: UserActivityEntry = {
    id: entry.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    kind: entry.kind,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    chainId: entry.chainId,
    token: entry.token,
    amount: entry.amount,
    txHash: entry.txHash,
    status: entry.status,
    label: entry.label,
    strategyId: entry.strategyId,
  };

  const existing = readRaw(wallet);
  const deduped = existing.filter((e) => e.id !== row.id);
  writeRaw(wallet, [row, ...deduped]);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("siphon:userActivityUpdated"));
  }

  return row;
}

export function exportUserActivitiesCsv(
  wallet: string,
  entries: UserActivityEntry[],
): void {
  const header = ["timestamp", "type", "token", "amount", "status", "tx_hash", "label", "chain_id"];
  const rows = entries.map((e) => [
    e.timestamp,
    e.kind,
    e.token ?? "",
    e.amount != null ? String(e.amount) : "",
    e.status ?? "",
    e.txHash ?? "",
    e.label ?? "",
    e.chainId != null ? String(e.chainId) : "",
  ]);

  const escape = (v: string) => {
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };

  const csv = [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `siphon-activity-${wallet.slice(0, 8)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
