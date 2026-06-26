import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/noir-zk/job-store';

export const maxDuration = 10; // Fast endpoint - just reads job status

/**
 * GET /api/noir-zk/job-status/[jobId]
 *
 * Returns the current status of a withdrawal job.
 *
 * Response:
 * - success: boolean
 * - job: WithdrawalJob | null
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  console.log('[Job Status] GET called for:', jobId);

  if (!jobId) {
    return NextResponse.json(
      { success: false, error: 'Missing jobId parameter' },
      { status: 400 }
    );
  }

  const job = getJob(jobId);

  if (!job) {
    return NextResponse.json(
      { success: false, error: 'Job not found', jobId },
      { status: 404 }
    );
  }

  console.log('[Job Status] Job found:', { id: job.id, status: job.status, step: job.step, progress: job.progress });

  return NextResponse.json({
    success: true,
    job: {
      id: job.id,
      status: job.status,
      step: job.step,
      progress: job.progress,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      signature: job.signature,
      depositSignature: job.depositSignature,
      error: job.error,
    },
  });
}