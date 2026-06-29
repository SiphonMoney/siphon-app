export const runtime = 'nodejs';
// This route shells out to rapidsnark — snarkjs is never imported here.
// Keep it that way: snarkjs is ~300MB and would bust the 250MB Vercel function limit.

import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const ZK_BUILD_DIR   = process.env.ZK_BUILD_DIR   || '/Users/adityamane/Siphon_Money/Siphon/siphon-zk/circuits/build';
const RAPIDSNARK_BIN = process.env.RAPIDSNARK_BIN || '/opt/homebrew/bin/rapidsnark';

const VALID_CIRCUITS = new Set([
  'w1','w2','w3','w4','w5','w6',
  'm2','m3','m4','m5','m6',
]);

function circuitPaths(circuit: string) {
  const prefix = `main_${circuit}`;
  const base   = join(ZK_BUILD_DIR, circuit, `${prefix}_js`);
  return {
    wasm:       join(base, `${prefix}.wasm`),
    zkey:       join(ZK_BUILD_DIR, circuit, 'zkey_final.zkey'),
    witnessGen: join(base, 'generate_witness.js'),
  };
}

export async function POST(req: NextRequest) {
  const id     = randomBytes(8).toString('hex');
  const tmpDir = join(tmpdir(), `siphon-prove-${id}`);

  const inputPath   = join(tmpDir, 'input.json');
  const witnessPath = join(tmpDir, 'witness.wtns');
  const proofPath   = join(tmpDir, 'proof.json');
  const publicPath  = join(tmpDir, 'public.json');

  try {
    const body    = await req.json();
    const inputs  = body.inputs;
    const circuit = (body.circuit || '').toLowerCase();

    if (!inputs) {
      return NextResponse.json({ error: 'Missing inputs' }, { status: 400 });
    }
    if (!VALID_CIRCUITS.has(circuit)) {
      return NextResponse.json(
        { error: `Invalid circuit '${circuit}'. Valid: ${[...VALID_CIRCUITS].sort().join(', ')}` },
        { status: 400 },
      );
    }

    const { wasm, zkey, witnessGen } = circuitPaths(circuit);

    await mkdir(tmpDir, { recursive: true });
    await writeFile(inputPath, JSON.stringify(inputs));

    const t0 = Date.now();
    await execFileAsync('node', [witnessGen, wasm, inputPath, witnessPath], { timeout: 60_000 });
    const witnessMs = Date.now() - t0;

    const t1 = Date.now();
    await execFileAsync(RAPIDSNARK_BIN, [zkey, witnessPath, proofPath, publicPath], { timeout: 120_000 });
    const proveMs = Date.now() - t1;

    const [proofRaw, publicRaw] = await Promise.all([
      readFile(proofPath, 'utf8'),
      readFile(publicPath, 'utf8'),
    ]);

    console.log(`[/api/prove] circuit=${circuit} witness=${witnessMs}ms prove=${proveMs}ms`);

    return NextResponse.json({
      proof:         JSON.parse(proofRaw),
      publicSignals: JSON.parse(publicRaw),
    });

  } catch (err: unknown) {
    console.error('[/api/prove]', err instanceof Error ? err.message : String(err));
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
