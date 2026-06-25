/**
 * API Key Auth — ใส่ static key ใน header
 * เหมาะกับ downstream ที่ใช้ API key ไม่หมดอายุ
 *
 * Config:
 *   AUTH_API_KEY_HEADER = ชื่อ header (default: X-API-Key)
 *   AUTH_API_KEY_VALUE  = ค่า API key
 */

import { AuthProvider } from './types.js';

export interface ApiKeyConfig {
  headerName: string; // ชื่อ header เช่น X-API-Key, Authorization
  apiKey: string; // ค่า key
}

export class ApiKeyProvider implements AuthProvider {
  readonly name = 'api-key';
  private readonly headerName: string;
  private readonly apiKey: string;

  constructor(config: ApiKeyConfig) {
    this.headerName = config.headerName;
    this.apiKey = config.apiKey;
  }

  async getHeaders(): Promise<Record<string, string>> {
    return {
      [this.headerName]: this.apiKey,
    };
  }
}
