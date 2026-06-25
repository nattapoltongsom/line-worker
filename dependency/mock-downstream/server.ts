/**
 * Mock Downstream Server
 * ─────────────────────────────────────────────────────────────────
 * จำลอง downstream service — รับ POST จาก worker แล้ว log ออกมา
 *
 * Endpoints:
 *   POST /incoming  → รับ message จาก worker
 *   GET  /stats     → ดูจำนวน messages ที่ได้รับ
 *   POST /reset     → ล้าง messages
 *   GET  /health    → health check
 *   GET  /          → ดู messages ล่าสุด
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';

const PORT = parseInt(process.env.PORT || '5001', 10);
const SERVICE_NAME = process.env.SERVICE_NAME || `mock-downstream:${PORT}`;

// เก็บ messages ที่ได้รับ
let messages: Array<{ receivedAt: string; headers: Record<string, string>; body: string }> = [];

function getBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf-8');
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const { method, url } = req;

  // ─── POST /incoming — รับ message จาก worker ───
  if (method === 'POST' && url === '/incoming') {
    const bodyStr = await getBody(req);

    messages.push({
      receivedAt: new Date().toISOString(),
      headers: {
        'content-type': req.headers['content-type'] || '',
        'x-service-name': (req.headers['x-service-name'] as string) || '',
      },
      body: bodyStr,
    });

    console.log(
      `[${SERVICE_NAME}] 📨 #${messages.length} from ${req.headers['x-service-name'] || 'unknown'}:`,
      bodyStr.length > 200 ? bodyStr.slice(0, 200) + '...' : bodyStr,
    );

    return json(res, 200, { status: 'ok', totalMessages: messages.length });
  }

  // ─── GET /stats ───
  if (method === 'GET' && url === '/stats') {
    return json(res, 200, {
      service: SERVICE_NAME,
      totalMessages: messages.length,
      lastMessage: messages.length > 0 ? messages[messages.length - 1] : null,
    });
  }

  // ─── POST /reset ───
  if (method === 'POST' && url === '/reset') {
    const count = messages.length;
    messages = [];
    console.log(`[${SERVICE_NAME}] 🗑️  Reset — ล้าง ${count} messages`);
    return json(res, 200, { status: 'reset', cleared: count });
  }

  // ─── GET /health ───
  if (method === 'GET' && url === '/health') {
    return json(res, 200, { status: 'healthy', service: SERVICE_NAME });
  }

  // ─── GET / ───
  if (method === 'GET' && url === '/') {
    return json(res, 200, {
      service: SERVICE_NAME,
      totalMessages: messages.length,
      messages: messages.slice(-20),
    });
  }

  json(res, 404, { error: 'Not Found', path: url });
});

// ─── Graceful shutdown ───
function shutdown() {
  console.log(`\n[${SERVICE_NAME}] 🛑 กำลังปิด...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ─── Handle port in use ───
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[${SERVICE_NAME}] ❌ Port ${PORT} ถูกใช้อยู่แล้ว — lsof -ti :${PORT} | xargs kill`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] 🚀 Mock downstream พร้อมที่ http://localhost:${PORT}`);
  console.log(`[${SERVICE_NAME}]    POST /incoming | GET /stats | POST /reset | GET /health`);
});
