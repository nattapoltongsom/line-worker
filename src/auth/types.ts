/**
 * Auth Provider Interface
 * ทุก auth strategy ต้อง implement interface นี้
 * - getHeaders() คืน headers ที่ต้องแนบไปกับ request
 * - token cache + auto refresh จัดการภายใน provider เอง
 */

export interface AuthProvider {
  /** ชื่อ strategy สำหรับ logging */
  readonly name: string;

  /**
   * คืน headers สำหรับแนบไปกับ request
   * ถ้า token หมดอายุ จะ refresh ให้อัตโนมัติ
   */
  getHeaders(): Promise<Record<string, string>>;
}

/** Auth mode ที่รองรับ — กำหนดผ่าน env AUTH_MODE */
export type AuthMode = 'none' | 'api-key' | 'oauth2' | 'custom-token';
