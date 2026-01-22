import {
  RangeConfig,
  RangeScreeningRequest,
  RangeScreeningResponse,
  ScreeningResult,
  RiskLevel,
} from './types';

const URL = 'https://api.range.org/v1';
const RISK_THRESHOLD = 70; // risk score > 70 -> block

export class RangeClient {
  private config: RangeConfig;
  private baseUrl: string;
  private riskThreshold: number;

  constructor(config: RangeConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || URL;
    this.riskThreshold = config.riskThreshold || RISK_THRESHOLD;
  }

  async screenAddress(address: string, chain: 'solana' | 'ethereum' = 'solana'): Promise<ScreeningResult> {
    try {
      const response = await this.callRangeAPI({
        address,
        chain,
      });
      const allowed = response.isAllowed && response.riskScore <= this.riskThreshold;
      return {
        allowed,
        address,
        riskScore: response.riskScore,
        riskLevel: response.riskLevel,
        reason: allowed
          ? undefined
          : this.buildRejectionReason(response),
      };
    } catch (error) {
      console.error('Range screening failed:', error);
      // In case of API failure -> allow with a warning
      return {
        allowed: true,
        address,
        reason: 'Compliance check unavailable - proceeding with caution',
      };
    }
  }

 async screenDeposit(senderAddress: string): Promise<ScreeningResult> {
    console.log(`[Range] Screening deposit from: ${senderAddress}`);
    return this.screenAddress(senderAddress, 'solana');
  }

async screenWithdrawal(recipientAddress: string): Promise<ScreeningResult> {
    console.log(`[Range] Screening withdrawal to: ${recipientAddress}`);
    return this.screenAddress(recipientAddress, 'solana');
  }

private async callRangeAPI(request: RangeScreeningRequest): Promise<RangeScreeningResponse> {
    const url = `${this.baseUrl}/screen`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`Range API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

 private buildRejectionReason(response: RangeScreeningResponse): string {
    const reasons: string[] = [];
    if (response.riskScore > this.riskThreshold) {
      reasons.push(`Risk score (${response.riskScore}) exceeds threshold (${this.riskThreshold})`);
    }
    if (!response.isAllowed) {
      reasons.push('Address flagged by compliance system');
    }
    if (response.flags && response.flags.length > 0) {
      const flagDescriptions = response.flags
        .map(f => `${f.category}: ${f.description}`)
        .join('; ');
      reasons.push(`Flags: ${flagDescriptions}`);
    }
    return reasons.join('. ') || 'Address blocked by compliance policy';
  }

 getRiskLevelDescription(level: RiskLevel): string {
    switch (level) {
      case RiskLevel.LOW:
        return 'Low risk';
      case RiskLevel.MEDIUM:
        return 'Medium risk';
      case RiskLevel.HIGH:
        return 'High risk ';
      case RiskLevel.SEVERE:
        return 'Severe risk';
      default:
        return 'Risk level unknown';
    }
  }
}

// --- Helpers ---

let rangeClient: RangeClient | null = null;

export function initializeRangeClient(config: RangeConfig): RangeClient {
  rangeClient = new RangeClient(config);
  console.log('[Range] Compliance client initialized');
  return rangeClient;
}

export function getRangeClient(): RangeClient | null {
  return rangeClient;
}

export async function isDepositAllowed(address: string): Promise<ScreeningResult> {
  if (!rangeClient) {
    console.warn('[Range] Client not initialized - skipping compliance check');
    return { allowed: true, address, reason: 'Compliance not configured' };
  }
  return rangeClient.screenDeposit(address);
}

export async function isWithdrawalAllowed(address: string): Promise<ScreeningResult> {
  if (!rangeClient) {
    console.warn('[Range] Client not initialized - skipping compliance check');
    return { allowed: true, address, reason: 'Compliance not configured' };
  }
  return rangeClient.screenWithdrawal(address);
}
