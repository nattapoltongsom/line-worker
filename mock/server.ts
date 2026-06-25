/**
 * Mock Downstream Server
 * - รับ POST /incoming แล้วเก็บ message ไว้ใน memory
 * - GET /stats — ดูจำนวน message ที่รับได้
 * - POST /reset — ล้าง messages ทั้งหมด
 * - ใช้สำหรับ dev/test กับ docker-compose
 */

import express from 'express';

const app = express();
const PORT = parseInt(process.env['PORT'] || '5001', 10);
const SERVICE_NAME = process.env['SERVICE_NAME'] || 'mock-downstream';

// เก็บ messages ที่รับมา
let messages: { receivedAt: string; size: number; body: string }[] = [];

// รับ raw body ทุก content type
app.use(express.raw({ type: '*/*', limit: '10mb' }));

/**
 * POST /incoming — รับ message จาก worker
 */
app.post('/incoming', (req, res) => {
  const body = req.body as Buffer;
  const message = {
    receivedAt: new Date().toISOString(),
    size: body.length,
    body: body.toString('utf-8'),
  };
  messages.push(message);

  console.log(
    `[${SERVICE_NAME}] 📨 Received message #${messages.length} (${body.length} bytes)`,
  );

  res.status(200).json({ status: 'ok', count: messages.length });
});

/**
 * GET /stats — ดูสถิติ messages ที่รับได้
 */
app.get('/stats', (_req, res) => {
  res.json({
    service: SERVICE_NAME,
    totalMessages: messages.length,
    messages: messages.slice(-20), // แสดงแค่ 20 ข้อความล่าสุด
  });
});

/**
 * POST /reset — ล้าง messages ทั้งหมด
 */
app.post('/reset', (_req, res) => {
  const count = messages.length;
  messages = [];
  console.log(`[${SERVICE_NAME}] 🗑️ Reset — cleared ${count} messages`);
  res.json({ status: 'reset', cleared: count });
});

/**
 * GET /health — health check
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: SERVICE_NAME });
});

app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] 🚀 Mock downstream running on port ${PORT}`);
});
