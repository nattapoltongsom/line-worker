#!/usr/bin/env npx tsx
/**
 * อ่าน src/workers/ directory แล้ว merge เป็น Helm values format
 * สำหรับ deploy ขึ้น K8s — แปลง localhost → host.minikube.internal
 * เพื่อให้ pod ใน cluster connect กลับมาที่ dependency/ บน host ได้
 *
 * Output: helm/kafka-worker/values-generated.json
 *
 * ใช้: npm run generate:helm
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const workersDir = resolve(rootDir, 'src/workers');

/**
 * แปลง localhost → host.minikube.internal + port 9094 → 9095 สำหรับ Kafka
 * เพื่อให้ K8s pod connect กลับมาที่ host machine ผ่าน MINIKUBE listener
 */
function toK8sHost(value: string): string {
  return value
    .replace(/localhost:9094/g, 'host.minikube.internal:9095')
    .replace(/localhost/g, 'host.minikube.internal');
}

// อ่าน shared.json — แปลง kafkaBroker
const shared = JSON.parse(readFileSync(join(workersDir, 'shared.json'), 'utf-8'));
shared.kafkaBroker = toK8sHost(shared.kafkaBroker);

// Scan worker files — แปลง downstreamUrl
const workerFiles = readdirSync(workersDir)
  .filter((f) => f.endsWith('.json') && f !== 'shared.json')
  .sort();

const workers = workerFiles.map((file) => {
  const worker = JSON.parse(readFileSync(join(workersDir, file), 'utf-8'));
  worker.downstreamUrl = toK8sHost(worker.downstreamUrl);

  // แปลง auth URLs ที่มี localhost ด้วย (เช่น oauth2TokenUrl)
  if (worker.auth) {
    if (worker.auth.oauth2TokenUrl) {
      worker.auth.oauth2TokenUrl = toK8sHost(worker.auth.oauth2TokenUrl);
    }
    if (worker.auth.customTokenUrl) {
      worker.auth.customTokenUrl = toK8sHost(worker.auth.customTokenUrl);
    }
  }

  return worker;
});

// สร้าง merged config
const merged: Record<string, unknown> = { shared, workers };

// รวม secrets จาก .env (ถ้ามี) — สำหรับ deploy ขึ้น K8s
// อ่าน .env file แล้วใส่เป็น secrets section ใน values
const envPath = resolve(rootDir, '.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  const secrets: Record<string, string> = {};
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    secrets[key] = value;
  }
  if (Object.keys(secrets).length > 0) {
    merged.secrets = secrets;
    console.log(`   Secrets: ${Object.keys(secrets).join(', ')} (from .env)`);
  }
} catch {
  // ไม่มี .env file — ไม่เป็นไร, deploy โดยไม่มี secrets
  console.log('   Secrets: ไม่มี .env file — secrets จะไม่ถูก inject');
}

// Output
const outputPath = resolve(rootDir, 'helm/kafka-worker/values-generated.json');
writeFileSync(outputPath, JSON.stringify(merged, null, 2));

console.log(`✅ Generated ${outputPath}`);
console.log(`   Shared: kafkaBroker → ${shared.kafkaBroker}`);
console.log(`   Workers: ${workers.map((w: { name: string; downstreamUrl: string }) => `${w.name} → ${w.downstreamUrl}`).join('\n             ')}`);
console.log('');
console.log('   ℹ️  localhost ถูกแปลงเป็น host.minikube.internal สำหรับ K8s');
console.log('');
console.log('Deploy:');
console.log('  helm upgrade --install kafka-workers ./helm/kafka-worker -f helm/kafka-worker/values-generated.json');
