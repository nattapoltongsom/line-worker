/**
 * HTTP Forwarder — ส่ง message ไป downstream URL
 * - ใช้ native fetch
 * - ขอ auth headers จาก AuthProvider ก่อนทุก request
 * - Retry N ครั้ง ด้วย exponential backoff (base * 2^attempt)
 * - AbortController สำหรับ timeout
 * - Return boolean (success/fail) ไม่ throw
 */

import { AuthProvider } from './auth/index.js';

export interface ForwarderOptions {
  downstreamUrl: string;
  retryCount: number;
  retryBaseDelayMs: number;
  fetchTimeoutMs: number;
  serviceName: string;
  authProvider: AuthProvider;
}

/**
 * หน่วงเวลา (sleep) — ใช้สำหรับ backoff ระหว่าง retry
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Forward message ไป downstream
 * คืน true ถ้าสำเร็จ (HTTP 2xx), false ถ้าล้มเหลวหลัง retry ทั้งหมด
 */
export async function forwardMessage(
  payload: Buffer,
  options: ForwarderOptions,
): Promise<boolean> {
  const { downstreamUrl, retryCount, retryBaseDelayMs, fetchTimeoutMs, serviceName, authProvider } =
    options;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      // ขอ auth headers จาก provider (อาจ refresh token ถ้าหมดอายุ)
      let authHeaders: Record<string, string> = {};
      try {
        authHeaders = await authProvider.getHeaders();
      } catch (authErr: unknown) {
        const authMsg = authErr instanceof Error ? authErr.message : String(authErr);
        console.error(
          `[${serviceName}] ❌ Auth error: ${authMsg} (attempt ${attempt + 1}/${retryCount + 1})`,
        );
        // Auth fail — ถือว่า request fail ไปเลย ลอง retry
        if (attempt < retryCount) {
          const delay = retryBaseDelayMs * Math.pow(2, attempt);
          console.log(`[${serviceName}] ⏳ Retry in ${delay}ms...`);
          await sleep(delay);
        }
        continue;
      }

      // สร้าง AbortController สำหรับ timeout แต่ละ request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), fetchTimeoutMs);

      const response = await fetch(downstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Service-Name': serviceName,
          ...authHeaders,
        },
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return true;
      }

      // HTTP error — log แล้ว retry
      console.warn(
        `[${serviceName}] ⚠️ Downstream ตอบ ${response.status} (attempt ${attempt + 1}/${retryCount + 1})`,
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (errorMsg.includes('abort')) {
        console.warn(
          `[${serviceName}] ⚠️ Timeout ${fetchTimeoutMs}ms (attempt ${attempt + 1}/${retryCount + 1})`,
        );
      } else {
        console.warn(
          `[${serviceName}] ⚠️ Fetch error: ${errorMsg} (attempt ${attempt + 1}/${retryCount + 1})`,
        );
      }
    }

    // ถ้ายังไม่ใช่ attempt สุดท้าย — รอด้วย exponential backoff
    if (attempt < retryCount) {
      const delay = retryBaseDelayMs * Math.pow(2, attempt);
      console.log(`[${serviceName}] ⏳ Retry in ${delay}ms...`);
      await sleep(delay);
    }
  }

  // retry หมดแล้ว — fail
  console.error(
    `[${serviceName}] ❌ Forward ล้มเหลวหลัง ${retryCount + 1} attempts`,
  );
  return false;
}
