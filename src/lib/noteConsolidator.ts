/**
 * Note consolidation: when a user accumulates >6 live notes for an asset, auto-merge
 * down to ≤4 using Vault.merge() before the next withdrawal would exceed the N=6 cap.
 *
 * merge(N) circuit: N input notes → 1 consolidated note, no ETH out, no recipient.
 * Public signals: [stateRoot, mergedCommitment, nullifierHash[0..N-1]]
 */
import { ethers, Contract } from 'ethers';
import { buildPoseidon } from 'circomlibjs';
import { prepareMergeTransaction } from './generateProof';
import { getSigner } from './nexus';
import { getNetwork, getSelectedChainId } from './networks';
import entrypointArtifact from './abi/Entrypoint.json';
import nativeVaultAbiJson from './abi/NativeVault.json';
import merkleTreeAbiJson from './abi/MerkleTree.json';
import { invalidateLeafCache, getLogsChunked, getReadProvider } from './zkHandler';
import type { TokenInfo } from './zkHandler';

const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const TREE_DEPTH = 32;
const MAX_NOTES = 6;
const CONSOLIDATE_THRESHOLD = MAX_NOTES; // trigger when live notes == threshold

// Same Poseidon zeros as zkHandler (depth 32)
const ZEROS: bigint[] = [
  0n,
  14744269619966411208579211824598458697587494354926760081771325075741142829156n,
  7423237065226347324353380772367382631490014989348495481811164164159255474657n,
  11286972368698509976183087595462810875513684078608517520839298933882497716792n,
  3607627140608796879659380071776844901612302623152076817094415224584923813162n,
  19712377064642672829441595136074946683621277828620209496774504837737984048981n,
  20775607673010627194014556968476266066927294572720319469184847051418138353016n,
  3396914609616007258851405644437304192397291162432396347162513310381425243293n,
  21551820661461729022865262380882070649935529853313286572328683688269863701601n,
  6573136701248752079028194407151022595060682063033565181951145966236778420039n,
  12413880268183407374852357075976609371175688755676981206018884971008854919922n,
  14271763308400718165336499097156975241954733520325982997864342600795471836726n,
  20066985985293572387227381049700832219069292839614107140851619262827735677018n,
  9394776414966240069580838672673694685292165040808226440647796406499139370960n,
  11331146992410411304059858900317123658895005918277453009197229807340014528524n,
  15819538789928229930262697811477882737253464456578333862691129291651619515538n,
  19217088683336594659449020493828377907203207941212636669271704950158751593251n,
  21035245323335827719745544373081896983162834604456827698288649288827293579666n,
  6939770416153240137322503476966641397417391950902474480970945462551409848591n,
  10941962436777715901943463195175331263348098796018438960955633645115732864202n,
  15019797232609675441998260052101280400536945603062888308240081994073687793470n,
  11702828337982203149177882813338547876343922920234831094975924378932809409969n,
  11217067736778784455593535811108456786943573747466706329920902520905755780395n,
  16072238744996205792852194127671441602062027943016727953216607508365787157389n,
  17681057402012993898104192736393849603097507831571622013521167331642182653248n,
  21694045479371014653083846597424257852691458318143380497809004364947786214945n,
  8163447297445169709687354538480474434591144168767135863541048304198280615192n,
  14081762237856300239452543304351251708585712948734528663957353575674639038357n,
  16619959921569409661790279042024627172199214148318086837362003702249041851090n,
  7022159125197495734384997711896547675021391130223237843255817587255104160365n,
  4114686047564160449611603615418567457008101555090703535405891656262658644463n,
  12549363297364877722388257367377629555213421373705596078299904496781819142130n,
];

function buildMerklePath(
  leaves: bigint[],
  leafIndex: number,
  poseidonHash: (a: bigint, b: bigint) => bigint,
): { pathElements: bigint[]; pathIndices: number[] } {
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];
  let levelNodes = leaves.slice();
  let idx = leafIndex;
  for (let level = 0; level < TREE_DEPTH; level++) {
    const isRight = idx % 2;
    pathIndices.push(isRight);
    const sibling = isRight === 1 ? idx - 1 : idx + 1;
    pathElements.push(sibling < levelNodes.length ? levelNodes[sibling] : ZEROS[level]);
    const next: bigint[] = [];
    for (let i = 0; i < levelNodes.length; i += 2) {
      next.push(poseidonHash(levelNodes[i], i + 1 < levelNodes.length ? levelNodes[i + 1] : ZEROS[level]));
    }
    levelNodes = next;
    idx = Math.floor(idx / 2);
  }
  return { pathElements, pathIndices };
}

/**
 * Check if consolidation is needed and, if so, merge the oldest MAX_NOTES notes into one.
 * Returns the new merged commitment key on success, null if no consolidation was needed,
 * or an error string on failure.
 */
export async function consolidateIfNeeded(
  chainId: number,
  token: TokenInfo,
): Promise<{ merged: true; key: string } | { merged: false } | { error: string }> {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const poseidonHash = (a: bigint, b: bigint): bigint => BigInt(F.toObject(poseidon([a, b])));

  const { scanNoteMeta, readNote, writeNote, markNoteSpent } = await import('./localNoteStore');
  const signer = getSigner();
  if (!signer) return { error: 'Wallet not connected' };

  const tokenAddress = token.symbol === 'ETH' ? NATIVE_TOKEN : token.address;
  const noteMetas = scanNoteMeta(`${chainId}-${token.symbol}-`);
  const unspent = noteMetas.filter(m => m.spent !== true && m.spent !== 'true' && m.commitment && m.amount);

  if (unspent.length < CONSOLIDATE_THRESHOLD) return { merged: false };

  console.log(`[consolidate] ${unspent.length} notes for ${token.symbol} — merging ${MAX_NOTES}`);

  // Fetch on-chain leaves + root
  const net = getNetwork(chainId);
  const provider = getReadProvider(chainId);
  const epContract = new Contract(
    getNetwork(chainId).entrypoint,
    entrypointArtifact.abi as ethers.InterfaceAbi,
    provider,
  );
  const vaultAddr = await epContract.getVault(tokenAddress);
  const vaultContract = new Contract(vaultAddr, nativeVaultAbiJson.abi as ethers.InterfaceAbi, provider);
  const merkleTreeAddr = await vaultContract.merkleTree();
  const merkleTreeContract = new Contract(merkleTreeAddr, merkleTreeAbiJson.abi as ethers.InterfaceAbi, provider);

  const LEAF_INSERTED_TOPIC = ethers.id('LeafInserted(uint256,uint256,uint256)');
  const latest = await provider.getBlockNumber();
  const rawLogs = await getLogsChunked(
    provider,
    { address: merkleTreeAddr, topics: [LEAF_INSERTED_TOPIC] },
    net.deployBlock,
    latest,
  );
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const parsed = rawLogs.map(log => {
    const [index, leaf] = abiCoder.decode(['uint256', 'uint256', 'uint256'], log.data);
    return { index: BigInt(index.toString()), leaf: BigInt(leaf.toString()) };
  }).sort((a, b) => (a.index < b.index ? -1 : 1));
  const leaves = parsed.map(p => p.leaf);

  const onChainRoot = BigInt((await merkleTreeContract.getRoot()).toString());

  // Pick up to MAX_NOTES confirmed notes
  interface MergeNote { key: string; nullifier: string; secret: string; amountWei: bigint; leafIndex: number }
  const toMerge: MergeNote[] = [];

  for (const meta of unspent) {
    if (toMerge.length >= MAX_NOTES) break;
    const data = await readNote(meta.key, signer);
    if (!data?.nullifier || !data.secret || !data.commitment) continue;
    const commitment = BigInt(data.commitment);
    const leafIndex = leaves.findIndex(l => l === commitment);
    if (leafIndex === -1) continue;
    const amountWei = BigInt(ethers.parseUnits(data.amount.toString(), token.decimals).toString());
    toMerge.push({ key: meta.key, nullifier: data.nullifier, secret: data.secret, amountWei, leafIndex });
  }

  const N = toMerge.length;
  if (N < 2) return { merged: false };

  // Claim merge output note secrets from pool — persisted in DB before tx is submitted.
  const { claimFromPool } = await import('./sparePool');
  const mergePoolClaimed = await claimFromPool(signer);
  const mergedNullifier = BigInt(mergePoolClaimed.nullifier);
  const mergedSecret = BigInt(mergePoolClaimed.secret);
  const mergePoolId = mergePoolClaimed.id;
  const mergedValue = toMerge.reduce((acc, n) => acc + n.amountWei, 0n);
  const mergedPrecommitment = BigInt(mergePoolClaimed.precommitment);
  const mergedCommitment = BigInt(F.toObject(poseidon([mergedValue, mergedPrecommitment])));

  // Build Merkle paths
  const pathElementsAll = toMerge.map(n => buildMerklePath(leaves, n.leafIndex, poseidonHash).pathElements.map(v => v.toString()));
  const pathIndicesAll = toMerge.map(n => buildMerklePath(leaves, n.leafIndex, poseidonHash).pathIndices.map(String));

  const circuitInput = {
    stateRoot:        onChainRoot.toString(),
    mergedNullifier:  mergedNullifier.toString(),
    mergedSecret:     mergedSecret.toString(),
    mergedValue:      mergedValue.toString(),
    inValue:          toMerge.map(n => n.amountWei.toString()),
    inNullifier:      toMerge.map(n => n.nullifier),
    inSecret:         toMerge.map(n => n.secret),
    pathElements:     pathElementsAll,
    pathIndices:      pathIndicesAll,
  };

  // Also fetch server commitments so we can mark input notes spent server-side after tx.
  let serverCommitmentIds: Record<string, string> = {};
  try {
    const { fetchCommitments } = await import('./commitmentStore');
    const serverComms = await fetchCommitments(signer);
    for (const c of serverComms) {
      if (c.spent === 'false') {
        const key = `${c.decrypted.chainId}-${token.symbol}-${c.decrypted.commitment}`;
        serverCommitmentIds[key] = c.id;
      }
    }
  } catch (e) {
    console.warn('[consolidate] Server commitment fetch failed, server-side marking skipped:', e);
  }

  console.log(`[consolidate] Generating M${N} merge proof…`);
  const { proof, publicSignals } = await prepareMergeTransaction(circuitInput, N);
  // publicSignals: [stateRoot, mergedCommitment, nullifierHash[0..N-1]]
  // Use circuit's authoritative mergedCommitment output (publicSignals[1]), not locally-computed.
  const mergedCommitmentOnChain = BigInt(publicSignals[1]);
  const nullifierHashes: string[] = toMerge.map((_, i) => publicSignals[2 + i]);
  const mergedNullifierHash = BigInt(F.toObject(poseidon([mergedNullifier]))).toString();

  // Send on-chain merge tx via Entrypoint.merge()
  const epSigned = new Contract(
    getNetwork(chainId).entrypoint,
    entrypointArtifact.abi as ethers.InterfaceAbi,
    signer,
  );

  // Persist merge output secrets before tx so recovery is possible if writeNote fails post-mining.
  const mergeHintKey = `merge-hint-${mergePoolId}`;
  localStorage.setItem(mergeHintKey, JSON.stringify({
    nullifier:     mergedNullifier.toString(),
    secret:        mergedSecret.toString(),
    precommitment: mergedPrecommitment.toString(),
    amount:        ethers.formatUnits(mergedValue, token.decimals),
    chainId,
    symbol:        token.symbol,
    pending:       true,
  }));

  let receipt: ethers.TransactionReceipt | null = null;
  try {
    const tx = await epSigned.getFunction('merge')(
      tokenAddress,
      onChainRoot.toString(),
      nullifierHashes,
      mergedCommitmentOnChain.toString(),
      proof.pA,
      proof.pB,
      proof.pC,
    ) as ethers.TransactionResponse;
    console.log('[consolidate] merge tx sent:', tx.hash);
    receipt = await tx.wait();
    if (!receipt) throw new Error('merge tx not mined');
    // Invalidate immediately after mining so any subsequent getLeafSet sees the merged output leaf.
    invalidateLeafCache();
  } catch (txErr) {
    localStorage.removeItem(mergeHintKey);  // tx never mined — clean up hint
    try {
      const { releasePrecommitment } = await import('./precommitmentStore');
      await releasePrecommitment(signer, mergePoolId);
    } catch { /* best-effort */ }
    throw txErr;
  }

  // Mark all merged input notes spent: localStorage + server commitments table (M2 fix)
  const { markCommitmentSpent } = await import('./commitmentStore');
  for (const n of toMerge) {
    markNoteSpent(n.key);
    const serverId = serverCommitmentIds[n.key];
    if (serverId) {
      markCommitmentSpent(signer, serverId, 'true').catch(e =>
        console.warn('[consolidate] Failed to mark server commitment spent:', n.key, e)
      );
    }
  }

  // Write merged output note: localStorage + server commitments table (M1 fix)
  const mergedKey = `${chainId}-${token.symbol}-${mergedCommitmentOnChain.toString()}`;
  await writeNote(mergedKey, {
    nullifier:     mergedNullifier.toString(),
    secret:        mergedSecret.toString(),
    commitment:    mergedCommitmentOnChain.toString(),
    precommitment: mergedPrecommitment.toString(),
    nullifierHash: mergedNullifierHash,
    amount:        ethers.formatUnits(mergedValue, token.decimals),
    spent:         false,
  }, signer);
  localStorage.removeItem(mergeHintKey);

  try {
    const { postCommitment } = await import('./commitmentStore');
    await postCommitment(
      signer,
      {
        nullifier:     mergedNullifier.toString(),
        secret:        mergedSecret.toString(),
        commitment:    mergedCommitmentOnChain.toString(),
        amount:        ethers.formatUnits(mergedValue, token.decimals),
        chainId,
        nullifierHash: mergedNullifierHash,
        precommitment: mergedPrecommitment.toString(),
      },
      token.symbol,
      'change',
    );
  } catch (e) {
    console.warn('[consolidate] Failed to post merged note to server:', e);
  }

  // Resolve the pool precommitment — merge output note is now confirmed on-chain.
  try {
    const { resolvePrecommitment } = await import('./precommitmentStore');
    await resolvePrecommitment(signer, mergePoolId);
  } catch (e) {
    console.warn('[consolidate] Failed to resolve pool precommitment:', e);
  }
  // Refill pool async.
  try {
    const { ensurePool } = await import('./sparePool');
    ensurePool(signer);
  } catch { /* best-effort */ }

  console.log('[consolidate] Merged', N, 'notes into', mergedKey);
  return { merged: true, key: mergedKey };
}
