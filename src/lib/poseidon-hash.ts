import { buildPoseidon } from 'circomlibjs';

let poseidon: any;

async function getPoseidon() {
  if (!poseidon) {
    poseidon = await buildPoseidon();
  }
  return poseidon;
}

export const poseidonHash2 = async (inputs: [bigint, bigint]): Promise<bigint> => {
  const p = await getPoseidon();
  const F = p.F;
  const hash = p([inputs[0], inputs[1]]);
  return BigInt(F.toObject(hash));
};

export const poseidonHash4 = async (inputs: [bigint, bigint, bigint, bigint]): Promise<bigint> => {
  const p = await getPoseidon();
  const F = p.F;
  const hash = p([inputs[0], inputs[1], inputs[2], inputs[3]]);
  return BigInt(F.toObject(hash));
};

// This is the field size from your "hint" file
const FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export function modField(value: bigint): bigint {
    return value % FIELD_SIZE;
}