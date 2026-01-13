
export enum LinkStatus {
  IDLE = 'IDLE',
  CHECKING = 'CHECKING',
  WORKING = 'WORKING',
  REDIRECT = 'REDIRECT',
  BLOCKED = 'BLOCKED',
  TIMEOUT = 'TIMEOUT',
  SLOW = 'SLOW',
  FAILED = 'FAILED'
}

export interface LinkItem {
  id: string;
  url: string;
  category: string;
  status: LinkStatus;
  latency?: number;
  statusCode?: number;
  lastChecked?: number;
  isFavorite: boolean;
}

export interface NetworkInfo {
  ssid: string;
  ip: string;
  type: 'Wi-Fi' | 'Mobile Data' | 'None';
  vpnActive: boolean;
}

export interface ScanResult {
  total: number;
  working: number;
  blocked: number;
  slow: number;
  failed: number;
}
