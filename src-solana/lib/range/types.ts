// once check if executed as stated
export interface RangeScreeningRequest {
  address: string;
  chain: 'solana' | 'ethereum';
}

export interface RangeScreeningResponse {
  address: string;
  isAllowed: boolean;
  riskScore: number;
  riskLevel: RiskLevel;
  flags: RiskFlag[];
  screenedAt: string;
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  SEVERE = 'SEVERE',
}

export interface RiskFlag {
  category: string;
  description: string;
  severity: RiskLevel;
}

export interface RangeConfig {
  apiKey: string;
  baseUrl?: string;
  riskThreshold?: number;
}

export interface ScreeningResult {
  allowed: boolean;
  address: string;
  reason?: string;
  riskScore?: number;
  riskLevel?: RiskLevel;
}
