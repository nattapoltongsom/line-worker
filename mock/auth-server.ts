/**
 * Mock Auth Server — จำลอง OAuth2 token endpoint และ custom token endpoint
 * ใช้สำหรับ dev/test กับ docker-compose
 *
 * Endpoints:
 *   POST /oauth2/token    — จำลอง OAuth2 Client Credentials (return access_token)
 *   POST /custom/login    — จำลอง custom login (return token ใน nested field)
 *   GET  /health          — health check
 */

import express from 'express';

const app = express();
const PORT = parseInt(process.env['PORT'] || '4000', 10);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * POST /oauth2/token — จำลอง OAuth2 Client Credentials
 * รับ: grant_type, client_id, client_secret, scope
 * คืน: access_token, token_type, expires_in
 */
app.post('/oauth2/token', (req, res) => {
  const { client_id, client_secret, grant_type } = req.body;

  // Validate พื้นฐาน
  if (grant_type !== 'client_credentials') {
    res.status(400).json({ error: 'unsupported_grant_type' });
    return;
  }

  if (!client_id || !client_secret) {
    res.status(401).json({ error: 'invalid_client' });
    return;
  }

  // ออก token (mock — ไม่ได้ verify จริง)
  const token = `mock-oauth2-token-${Date.now()}`;
  console.log(`[auth-server] ✅ Issued OAuth2 token for client: ${client_id}`);

  res.json({
    access_token: token,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: req.body.scope || '',
  });
});

/**
 * POST /custom/login — จำลอง custom auth endpoint
 * รับ: JSON body ใด ๆ (เช่น {username, password})
 * คืน: nested field data.access_token
 */
app.post('/custom/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(401).json({ error: 'missing credentials' });
    return;
  }

  const token = `mock-custom-token-${Date.now()}`;
  console.log(`[auth-server] ✅ Issued custom token for user: ${username}`);

  // คืนแบบ nested field — ให้ worker ใช้ "data.access_token" ดึง
  res.json({
    status: 'ok',
    data: {
      access_token: token,
      expires_in: 1800,
    },
  });
});

/**
 * GET /health
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'mock-auth-server' });
});

app.listen(PORT, () => {
  console.log(`[auth-server] 🚀 Mock auth server running on port ${PORT}`);
});
