# Siphon Protocol — Change Log

Chronological log of significant changes made during active development sessions. Most recent first.

---

## 2026-06-17

### Security Fixes

**`siphon-app/src/lib/noteStore.ts` — Encryption key separated from auth signature**
- Previously, one `signMessage` call was used for both AES-GCM key derivation and the `X-Signature` auth header. The same signature was both used as keying material and transmitted to the server — a key disclosure vulnerability.
- Fix: two separate signatures. `'Siphon-Encryption-Key-v1'` (stable, never transmitted) derives the encryption key and is cached in memory per wallet session. `'Siphon auth v1:<timestamp>'` (timestamp-rotated) goes in auth headers only.
- Bonus: key is cached in `_keyCache` (Map keyed by wallet address) so users sign the encryption message only once per browser session.

**`siphon-app/src/app/api/prove/route.ts` — Error message not leaked to client**
- Previously, internal error messages from `rapidsnark` / Node.js (which can include file paths and circuit internals) were returned in the JSON response body.
- Fix: full error details log server-side only; client receives generic `'Proof generation failed'`.

---

### Merge Conflict Resolution — `siphon-app` (git pull + stash pop)

Pulled latest from the `siphon-app` remote and resolved three-way merge conflicts in:

**`BuildNav.tsx`** — kept upstream's restart button; kept our removal of `desktop-only` class from the execute button.

**`BuildNodes.tsx`** — combined upstream's rich legacy inputs (Range/TWAP/DCA/Limit Order fields) with our Multi-Asset `TreeBuilderNode` toggle at the top. Legacy mode shows upstream UI; Multi-Asset mode shows our composable node builder.

**`Build.tsx`** — three conflicts resolved:
1. Imports: kept both `processBuilderTurn` (upstream AI agent) and `exportNotes / importNotes / validateRecipientAddress` (our note management).
2. Success messages: kept upstream's `triggerLabel / rangeDetail / scheduleDetail` for legacy strategies and our composable strategy success message.
3. JSX structure: merged upstream's `blueprint-workspace` container + `BuildAiPrompt` footer with our floating `note-sync-controls` export/import panel (now placed inside `blueprint-canvas` as a positioned overlay sibling to `ReactFlow`).

---

## 2026-06-16

### Server-Side Proof Generation — `/api/prove`

**New file: `siphon-app/src/app/api/prove/route.ts`**
- Next.js API route that generates Groth16 proofs server-side using `rapidsnark`.
- Replaces browser-side `snarkjs` (~10s) with ~200ms server-side proving.
- Flow: writes inputs to a temp directory → `node generate_witness.js` → `rapidsnark` → returns `{ proof, publicSignals }` → cleans up temp files in `finally`.
- Env vars: `ZK_BUILD_DIR` (default: `siphon-zk/circuits/build`), `RAPIDSNARK_BIN` (default: `/opt/homebrew/bin/rapidsnark`).
- Witness timeout: 30s. Proof timeout: 60s.

**New file: `siphon-app/src/lib/proofRelayer.ts`**
- Unified proof-request client. If `NEXT_PUBLIC_PROVING_RELAYER_URL` is set, routes to the external relayer with wallet-signed auth headers. Otherwise routes to local `/api/prove` (no auth required — same-origin).
- Handles all Poseidon hash precomputation client-side before sending inputs.
- Returns structured calldata: `{ pA, pB, pC, publicSignals, nullifierHash, newCommitment, ... }`.

---

### Note Management Database

**`siphon-fhe/trade-executor/database.py` — Note model**
- Added `Note` SQLAlchemy model: stores encrypted note payloads (ciphertext + IV) per wallet, with `commitment`, `nullifier_hash`, `chain_id`, `asset`, and `spent` (three-state string).
- `spent` column type changed from boolean `0/1` to string `'false' | 'pending' | 'true'`.
- `app.py` runs a SQLite migration on startup: converts legacy boolean rows to string values; adds `condition_tree`, `to_chain`, `from_chain` columns if missing.

**`siphon-fhe/trade-executor/notes.py` — REST API for notes**
- `POST /notes` — save encrypted note (wallet-authenticated via `X-Signature`)
- `GET /notes` — fetch all notes for authenticated wallet
- `POST /notes/<id>/mark_spent` — update `spent` status (`'true' | 'pending' | 'false'`)
- `DELETE /notes/<id>` — delete note

**`siphon-app/src/lib/noteStore.ts`**
- `postNote`, `fetchNotes`, `markNoteSpent` — client-side API to the trade-executor notes endpoint.
- Notes are AES-GCM encrypted in the browser before upload; server stores only ciphertext + IV.
- `exportNotes` / `importNotes` — wallet-authenticated JSON export/import for note portability.
- `NoteSpentStatus` type: `'false' | 'pending' | 'true'`.

**`siphon-app/src/lib/zkHandler.ts`**
- Server note sync: only fetches notes where `spent === 'false'`.
- localStorage scan: accepts `spent === 'false'`, `false` (legacy boolean), or `undefined` (old schema) as unspent.

---

### Three-State Nullifier Lifecycle (`siphon-fhe/trade-executor/scheduler.py`)

Before triggering execution, the scheduler now marks the note `spent='pending'` to block any concurrent strategy from reusing the same nullifier.

Post-execution revert rules:
- **Success**: mark `spent='true'` (nullifier confirmed on-chain).
- **`FatalExecutionError`** (tx failed before ZK withdraw): revert to `spent='false'` (safe to retry).
- **`NullifierSpentSwapFailed`** (ZK withdraw confirmed, swap failed): set `spent='true'` (nullifier IS spent on-chain, funds are in executor wallet — do not reuse).

---

### Uniswap UniversalRouter — Same-Chain Swaps (`siphon-fhe/trade-executor/evm_executor.py`)

**New function: `swap_eth_to_token()`**
- Uses Uniswap UniversalRouter (`0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b` on Sepolia).
- Command sequence: `WRAP_ETH (0x0b)` + `V3_SWAP_EXACT_IN (0x00)`.
- Wraps ETH → WETH in the same tx as the V3 swap. Sends `msg.value = amount_wei`.
- Path encoding: `WETH address (20 bytes) + fee_tier (3 bytes, big-endian) + token_out (20 bytes)`.
- Default fee tier: 3000 (0.3%).

**Routing logic:**
- Cross-chain (different chain IDs): Li.Fi (mainnet only).
- Same-chain ETH → ERC20: `swap_eth_to_token()` via UniversalRouter.
- Same-chain same asset: direct ETH transfer.

**New exception: `NullifierSpentSwapFailed(FatalExecutionError)`**
- Raised when the ZK withdrawal tx confirms but the subsequent swap fails.
- Tells the scheduler to mark note `spent='true'` (not `'false'`) since the nullifier is already spent on-chain.

---

### RBF (Replace-By-Fee) — Stuck Mempool Tx (`siphon-fhe/trade-executor/evm_executor.py`)

`send_tx()` now detects and handles stuck transactions:
- Detects: `pending_nonce > confirmed_nonce` → tx is in mempool but not confirmed.
- Bumps: priority fee 2 gwei → 15 gwei; max fee `3×base + priority` → `4×base + priority`.
- Forces `nonce = confirmed_nonce` to replace the stuck tx (same nonce = RBF replacement).
- `wait_for_transaction_receipt` timeout extended from 120s → 600s.

---

### Gunicorn Timeout Fix

gunicorn must be started with `--timeout 700`:
```bash
gunicorn -w 1 -b 0.0.0.0:5005 --timeout 700 app:app
```
Default 30s timeout killed the worker during ZK withdraw + swap sequences that can take up to 600s waiting for Sepolia block confirmation.

---

### Builder UI — Note Export / Import Controls (`siphon-app`)

**`Build.tsx`** — floating `note-sync-controls` panel added inside `blueprint-canvas`:
- **EXPORT NOTES** button: calls `exportNotes(signer)` → downloads wallet-encrypted note backup as JSON.
- **IMPORT NOTES** label/file-input: calls `importNotes(signer, file)` → decrypts and re-uploads notes from a backup file.
- Positioned `bottom: 24px, left: 24px` with `zIndex: 1000` so it sits above the ReactFlow canvas.

---

## Earlier Sessions

### ZK Circuit (siphon-zk)

- Circuit entry: `circuits/main.circom` — 5 public signals: `[withdrawnValue, stateRoot, newCommitment, nullifierHash, recipient]`
- `LessEqThan(128)` for underflow protection (not `Num2Bits(256)` — BN254 field wraparound is not caught by bit decomposition)
- Binary path index constraint: `pathIndex * (1 - pathIndex) === 0`
- Optimized 2-multiplication Selector (diff/swap identity)
- `recipient` bound via `signal recipientSquare <== recipient * recipient`
- `nullifiersEqual = IsZero(); out === 0` — passes when nullifiers differ
- Proof system: Groth16 + circom. Both EVM and Solana share the same `.zkey` and `.wasm`.

### EVM Contracts (siphon-contracts/evm)

- `Entrypoint.sol` deployed: `0x8Be4A7A074468F571271192A0A0824cf6F08a1f6` (Sepolia)
- Known open issues (not yet fixed): `C-01` (no `onlyOwner` on `initializeVaults`), `C-03` (missing `rootExists`), `C-04` (missing `onlyEntrypoint`), `H-02` (missing `onlyVault` on `MerkleTree.insert`), `MerkleTree._computeRootFor` broken for multi-leaf trees.

### Solana Program (siphon-contracts/solana)

- Program ID: `3CVsp1zayXhNsT8Ktrh85rTewvBJxWy8VcUtQAKdnQMb` (devnet)
- 6 instructions: `initialize`, `deposit_sol`, `deposit_spl`, `withdraw_sol`, `withdraw_spl`, `update_root`
- Missing: on-chain Groth16 verifier (currently trust-based relayer)

---

## Known Open Issues (as of 2026-06-17)

See `CLAUDE.md` § "Pending Security Fixes" for the full audit backlog. Top priority items:

| ID | Area | Issue |
|---|---|---|
| C-01 | EVM contract | `initializeVaults()` has no `onlyOwner` |
| C-04 | EVM contract | Vault external functions missing `onlyEntrypoint` |
| H-02 | EVM contract | `MerkleTree.insert` missing `onlyVault` |
| FHE-01 | Backend | Rotate committed private key; scrub git history |
| FHE-02 | Backend | Hard-fail on startup if `API_TOKEN` not set |
| FHE-05 | Backend | `_minAmountOut` is zero — sandwich attack vector |
| F-01 | Frontend | Encrypt secrets in localStorage (currently plaintext) |
| F-03 | Frontend | `Math.random()` for nullifiers → `crypto.randomBytes` |
| Verifier | EVM | Deploy Groth16Verifier.sol, update `publicInputs[4] == recipient` |
| Solana | Verifier | Build on-chain Groth16 verifier program |
