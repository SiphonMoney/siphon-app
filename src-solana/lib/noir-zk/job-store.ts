/**
 * File-based job store for async withdrawal processing
 *
 * Uses /tmp for persistence across serverless function instances
 */

import * as fs from 'fs';
import * as path from 'path';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface WithdrawalJob {
  id: string;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;

  // Input
  tokenType: string;
  amount: number;
  recipientAddress: string;
  ownerAddress: string;
  mintAddress?: string;
  utxos?: unknown[];

  // Progress
  step: string;
  progress: number; // 0-100

  // Result (when completed)
  signature?: string;
  depositSignature?: string;
  error?: string;
}

// File-based storage directory (persists across serverless invocations in same environment)
const JOB_STORE_DIR = '/tmp/siphon-jobs';

// Ensure directory exists
function ensureDir() {
  try {
    if (!fs.existsSync(JOB_STORE_DIR)) {
      fs.mkdirSync(JOB_STORE_DIR, { recursive: true });
    }
  } catch (e) {
    console.error('[JobStore] Failed to create directory:', e);
  }
}

function getJobPath(id: string): string {
  return path.join(JOB_STORE_DIR, `${id}.json`);
}

// Job cleanup - remove jobs older than 1 hour
const JOB_TTL = 60 * 60 * 1000; // 1 hour

function cleanupOldJobs() {
  try {
    ensureDir();
    const files = fs.readdirSync(JOB_STORE_DIR);
    const now = Date.now();

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(JOB_STORE_DIR, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const job = JSON.parse(content) as WithdrawalJob;
        if (now - job.createdAt > JOB_TTL) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // Ignore individual file errors
      }
    }
  } catch (e) {
    console.error('[JobStore] Cleanup error:', e);
  }
}

export function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export function createJob(params: {
  tokenType: string;
  amount: number;
  recipientAddress: string;
  ownerAddress: string;
  mintAddress?: string;
  utxos?: unknown[];
}): WithdrawalJob {
  cleanupOldJobs();
  ensureDir();

  const id = generateJobId();
  const now = Date.now();

  const job: WithdrawalJob = {
    id,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    tokenType: params.tokenType,
    amount: params.amount,
    recipientAddress: params.recipientAddress,
    ownerAddress: params.ownerAddress,
    mintAddress: params.mintAddress,
    utxos: params.utxos,
    step: 'Queued',
    progress: 0,
  };

  // Write to file
  try {
    fs.writeFileSync(getJobPath(id), JSON.stringify(job, null, 2));
    console.log('[JobStore] Created job:', id);
  } catch (e) {
    console.error('[JobStore] Failed to write job:', e);
  }

  return job;
}

export function getJob(id: string): WithdrawalJob | undefined {
  try {
    ensureDir();
    const filePath = getJobPath(id);
    if (!fs.existsSync(filePath)) {
      console.log('[JobStore] Job not found:', id);
      return undefined;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as WithdrawalJob;
  } catch (e) {
    console.error('[JobStore] Failed to read job:', e);
    return undefined;
  }
}

export function updateJob(id: string, updates: Partial<WithdrawalJob>): WithdrawalJob | undefined {
  const job = getJob(id);
  if (!job) return undefined;

  const updated = {
    ...job,
    ...updates,
    updatedAt: Date.now(),
  };

  try {
    fs.writeFileSync(getJobPath(id), JSON.stringify(updated, null, 2));
    console.log('[JobStore] Updated job:', id, 'status:', updated.status);
  } catch (e) {
    console.error('[JobStore] Failed to update job:', e);
  }

  return updated;
}

export function getAllJobs(): WithdrawalJob[] {
  try {
    ensureDir();
    const files = fs.readdirSync(JOB_STORE_DIR);
    const jobs: WithdrawalJob[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = fs.readFileSync(path.join(JOB_STORE_DIR, file), 'utf-8');
        jobs.push(JSON.parse(content) as WithdrawalJob);
      } catch {
        // Ignore individual file errors
      }
    }

    return jobs;
  } catch {
    return [];
  }
}

export function deleteJob(id: string): boolean {
  try {
    const filePath = getJobPath(id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
