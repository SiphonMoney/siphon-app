// TxList.tsx - Transaction list from localStorage (deposit/withdraw)
"use client";

export interface TxEntry {
  type: "deposit" | "withdraw";
  timestamp: number;
  txHash: string;
  amount?: string;
  token?: string;
}

const STORAGE_KEY = "siphon-darkpool-tx-list";
const EXPLORER_BASE = "https://explorer.solana.com/tx";

export function getTxList(): TxEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TxEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendTx(entry: TxEntry): void {
  const list = getTxList();
  list.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 200)));
}

interface TxListProps {
  entries: TxEntry[];
}

export default function TxList({ entries }: TxListProps) {
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const isExplorerLink = (hash: string) =>
    hash.startsWith("mock_") === false &&
    hash.startsWith("deposit_") === false;

  return (
    <div className="tx-list-section">
      <h3>Recent transactions</h3>
      {entries.length === 0 ? (
        <p className="tx-list-empty">No transactions yet. Deposit or withdraw to see history here.</p>
      ) : (
        <ul className="tx-list">
          {entries.map((entry, i) => (
            <li key={`${entry.timestamp}-${entry.txHash}-${i}`} className="tx-list-item">
              <span className={`tx-type tx-type-${entry.type}`}>{entry.type}</span>
              {entry.amount != null && entry.token ? (
                <span className="tx-amount">{entry.amount} {entry.token}</span>
              ) : null}
              <span className="tx-time">{formatTime(entry.timestamp)}</span>
              {isExplorerLink(entry.txHash) ? (
                <a
                  href={`${EXPLORER_BASE}/${entry.txHash}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tx-hash"
                >
                  {entry.txHash.slice(0, 8)}...{entry.txHash.slice(-8)}
                </a>
              ) : (
                <span className="tx-hash tx-hash-muted">{entry.txHash.slice(0, 12)}...</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
