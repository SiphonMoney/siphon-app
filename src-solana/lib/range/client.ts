import {
  RangeConfig,
  RangeScreeningRequest,
  AddressRiskResponse,
  SanctionsResponse,
  ScreeningResult,
  RiskLevel,
} from './types';

const RANGE_API_BASE_URL = 'https://api.range.org/v1';
const RISK_THRESHOLD = 70; // risk score > 70 -> block

export class RangeClient {
  private config: RangeConfig;
  private baseUrl: string;
  private riskThreshold: number;

  constructor(config: RangeConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || RANGE_API_BASE_URL;
    this.riskThreshold = config.riskThreshold || RISK_THRESHOLD;
  }

  async screenAddress(address: string, chain: 'solana' | 'ethereum' = 'solana'): Promise<ScreeningResult> {
    try {
      const [riskResponse, sanctionsResponse] = await Promise.all([
        this.callAddressRiskAPI({ address, chain }),
        this.callSanctionsAPI({ address, chain })
      ]);

      const riskAllowed = riskResponse.riskScore <= this.riskThreshold;
      const sanctionsAllowed = !sanctionsResponse.is_ofac_sanctioned;

      const allowed = riskAllowed && sanctionsAllowed;

      return {
        allowed,
        address,
        riskScore: riskResponse.riskScore,
        // riskLevel: riskResponse.riskLevel, // riskLevel is a string now, but ScreeningResult expects an enum
        reason: allowed
          ? undefined
          : this.buildRejectionReason(riskResponse, sanctionsResponse),
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

  private async callAddressRiskAPI(request: RangeScreeningRequest): Promise<AddressRiskResponse> {
    const url = new URL(`${this.baseUrl}/risk/address`);
    url.searchParams.append('address', request.address);
    url.searchParams.append('network', request.chain);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Range Address Risk API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  private async callSanctionsAPI(request: RangeScreeningRequest): Promise<SanctionsResponse> {
    const url = new URL(`${this.baseUrl}/risk/sanctions/${request.address}`);
    url.searchParams.append('include_details', 'true');
    url.searchParams.append('network', request.chain); // Assuming network is a query param here as well

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Range Sanctions API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  private buildRejectionReason(riskResponse: AddressRiskResponse, sanctionsResponse: SanctionsResponse): string {
    const reasons: string[] = [];
    if (riskResponse.riskScore > this.riskThreshold) {
      reasons.push(`Risk score (${riskResponse.riskScore}) exceeds threshold (${this.riskThreshold})`);
    }
    if (sanctionsResponse.is_ofac_sanctioned) {
      reasons.push('Address is on OFAC sanctions list');
    }
    return reasons.join('. ') || 'Address blocked by compliance policy';
  }

  getRiskLevelDescription(level: RiskLevel): string {
    // This function might be obsolete now since riskLevel is a string
    return level.toString();
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
