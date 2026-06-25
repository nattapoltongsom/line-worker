/**
 * No Auth — ไม่ต้องใส่ auth header ใด ๆ
 * ใช้สำหรับ downstream ที่ไม่ต้องการ authentication
 */

import { AuthProvider } from './types.js';

export class NoAuthProvider implements AuthProvider {
  readonly name = 'none';

  async getHeaders(): Promise<Record<string, string>> {
    return {};
  }
}
