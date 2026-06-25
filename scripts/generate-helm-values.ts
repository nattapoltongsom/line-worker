#!/usr/bin/env npx tsx
/**
 * อ่าน src/workers/ directory แล้ว merge เป็น Helm values format
 * Output: helm/kafka-worker/values-generated.yaml
 *
 * ใช้: npm run generate:helm
 *
 * Helm deploy:
 *   helm upgrade kafka-workers ./helm/kafka-worker -f helm/kafka-worker/values-generated.yaml
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const workersDir = resolve(rootDir, 'src/workers');

// อ่าน shared.json
const shared = JSON.parse(readFileSync(join(workersDir, 'shared.json'), 'utf-8'));

// Scan worker files
const workerFiles = readdirSync(workersDir)
  .filter((f) => f.endsWith('.json') && f !== 'shared.json')
  .sort();

const workers = workerFiles.map((file) => {
  return JSON.parse(readFileSync(join(workersDir, file), 'utf-8'));
});

// สร้าง merged config (เหมือน format เดิมที่ Helm ต้องการ)
const merged = { shared, workers };

// Output เป็น JSON (Helm รองรับ -f *.json ได้)
const outputPath = resolve(rootDir, 'helm/kafka-worker/values-generated.json');
writeFileSync(outputPath, JSON.stringify(merged, null, 2));

console.log(`✅ Generated ${outputPath}`);
console.log(`   Shared: src/workers/shared.json`);
console.log(`   Workers: ${workers.map((w: { name: string }) => w.name).join(', ')}`);
console.log('');
console.log('Deploy:');
console.log('  helm upgrade --install kafka-workers ./helm/kafka-worker -f helm/kafka-worker/values-generated.json');
