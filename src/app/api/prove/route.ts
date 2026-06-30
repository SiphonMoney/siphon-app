import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const PROVING_RELAYER_URL = process.env.PROVING_RELAYER_URL || '';
const RELAYER_API_TOKEN   = process.env.RELAYER_API_TOKEN   || '';

const ZK_BUILD_DIR   = process.env.ZK_BUILD_DIR   || '/Users/adityamane/Siphon_Money/Siphon/siphon-zk/circuits/build';
const RAPIDSNARK_BIN = process.env.RAPIDSNARK_BIN || '/opt/homebrew/bin/rapidsnark';
const ZKEY_PATH      = join(ZK_BUILD_DIR, 'zkey_final.zkey');
const WASM_PATH      = join(ZK_BUILD_DIR, 'main_js/main.wasm');
const GEN_WITNESS_JS = join(ZK_BUILD_DIR, 'main_js/generate_witness.js');

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { inputs, circuit } = body;
  if (!inputs || typeof inputs !== 'object') {
    return NextResponse.json({ error: 'Missing inputs' }, { status: 400 });
  }

  if (PROVING_RELAYER_URL) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (RELAYER_API_TOKEN) headers['X-API-TOKEN'] = RELAYER_API_TOKEN;

    const upstream = await fetch(`${PROVING_RELAYER_URL}/prove`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ inputs, circuit }),
    });

    const payload = await upstream.json().catch(() => ({}));
    return NextResponse.json(payload, { status: upstream.status });
  }

  const id = randomBytes(8).toString('hex');
  const tmpDir = join(tmpdir(), `siphon-prove-${id}`);

  const inputPath   = join(tmpDir, 'input.json');
  const witnessPath = join(tmpDir, 'witness.wtns');
  const proofPath   = join(tmpDir, 'proof.json');
  const publicPath  = join(tmpDir, 'public.json');

  try {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(inputPath, JSON.stringify(inputs));

    const t0 = Date.now();
    await execFileAsync('node', [GEN_WITNESS_JS, WASM_PATH, inputPath, witnessPath], {
      timeout: 30_000,
    });
    const witnessMs = Date.now() - t0;

    const t1 = Date.now();
    await execFileAsync(RAPIDSNARK_BIN, [ZKEY_PATH, witnessPath, proofPath, publicPath], {
      timeout: 60_000,
    });
    const proveMs = Date.now() - t1;

    const [proofRaw, publicRaw] = await Promise.all([
      readFile(proofPath, 'utf8'),
      readFile(publicPath, 'utf8'),
    ]);

    const proof         = JSON.parse(proofRaw);
    const publicSignals = JSON.parse(publicRaw);

    console.log(`[/api/prove] witness=${witnessMs}ms prove=${proveMs}ms total=${Date.now() - t0}ms`);

    return NextResponse.json({ proof, publicSignals });

  } catch (err: unknown) {
    console.error('[/api/prove] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Proof generation failed' }, { status: 500 });

  } finally {
    await Promise.allSettled([
      unlink(inputPath).catch(() => {}),
      unlink(witnessPath).catch(() => {}),
      unlink(proofPath).catch(() => {}),
      unlink(publicPath).catch(() => {}),
    ]);
    await import('fs/promises').then(fs => fs.rmdir(tmpDir).catch(() => {}));
  }
}
