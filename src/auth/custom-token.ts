/**
 * Custom Token Endpoint — ขอ token จาก endpoint แบบ custom
 * รองรับ auth flow ที่ไม่ใช่ standard OAuth2
 *
 * Flow:
 * 1. POST ไปที่ token URL พร้อม body (JSON)
 * 2. Response เป็น JSON — ดึง token จาก field ที่กำหนด
 * 3. ใส่ token ใน header ที่กำหนด
 *
 * Config:
 *   AUTH_CUSTOM_TOKEN_URL        = URL สำหรับขอ token
 *   AUTH_CUSTOM_TOKEN_BODY       = JSON body ที่จะส่งไป (เช่น {"username":"x","password":"y"})
 *   AUTH_CUSTOM_TOKEN_FIELD      = field ใน response ที่เป็น token (default: "token")
 *   AUTH_CUSTOM_TOKEN_HEADER     = header ที่จะใส่ token (default: "Authorization")
 *   AUTH_CUSTOM_TOKEN_PREFIX     = prefix ก่อน token (default: "Bearer ")
 *   AUTH_CUSTOM_TOKEN_EXPIRES_IN = อายุ token เป็นวินาที (default: 3600)
 */

import { AuthProvider } from './types.js';

export interface CustomTokenConfig {
  tokenUrl: string;
  body: Record<string, unknown>; // JSON body สำหรับขอ token
  tokenField: string; // field ที่เป็น token ใน response
  headerName: string; // header ที่จะแนบ token
  tokenPrefix: string; // prefix เช่น "Bearer "
  expiresInSeconds: number; // อายุ token (สำหรับ cache)
}

export class CustomTokenProvider implements AuthProvider {
  readonly name = 'custom-token';
  private readonly config: CustomTokenConfig;

  // Token cache
  private token: string | null = null;
  private expiresAt: number = 0;

  constructor(config: CustomTokenConfig) {
    this.config = config;
  }

  async getHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return {
      [this.config.headerName]: `${this.config.tokenPrefix}${token}`,
    };
  }

  /**
   * ขอ token ใหม่ถ้าหมดอายุ หรือใช้ cached token
   */
  private async getToken(): Promise<string> {
    // ถ้า token ยังไม่หมดอายุ (เผื่อ 30 วินาที)
    if (this.token && Date.now() < this.expiresAt - 30_000) {
      return this.token;
    }

    // ขอ token ใหม่
    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.config.body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Custom token request failed (${response.status}): ${text}`,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;

    // ดึง token จาก field ที่กำหนด (รองรับ nested field ด้วย dot notation)
    const token = this.extractField(data, this.config.tokenField);
    if (!token || typeof token !== 'string') {
      throw new Error(
        `Token field "${this.config.tokenField}" not found or not a string in response`,
      );
    }

    this.token = token;
    this.expiresAt = Date.now() + this.config.expiresInSeconds * 1000;

    console.log(
      `[custom-token] ✅ Token refreshed, cache for ${this.config.expiresInSeconds}s`,
    );

    return this.token;
  }

  /**
   * ดึงค่าจาก object ด้วย dot notation เช่น "data.access_token"
   */
  private extractField(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}
