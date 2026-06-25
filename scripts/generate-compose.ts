#!/usr/bin/env npx tsx
/**
 * อ่าน src/workers/ directory แล้ว generate docker-compose.workers.yml อัตโนมัติ
 *
 * ใช้: npm run generate
 * Output: docker-compose.workers.yml
 *
 * Scan:
 *   src/workers/shared.json       → (ไม่สร้าง service)
 *   src/workers/worker-*.json     → สร้าง service ต่อไฟล์
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const workersDir = resolve(rootDir, 'src/workers');

// Scan worker files (ไม่รวม shared.json)
const workerFiles = readdirSync(workersDir)
  .filter((f) => f.endsWith('.json') && f !== 'shared.json')
  .sort();

interface WorkerEntry {
  name: string;
}

const workers: WorkerEntry[] = workerFiles.map((file) => {
  const content = readFileSync(join(workersDir, file), 'utf-8');
  return JSON.parse(content) as WorkerEntry;
});

// สร้าง YAML
let yaml = `# ─── AUTO-GENERATED — DO NOT EDIT ───
# Generated from src/workers/*.json by: npm run generate
# เพิ่ม worker ใหม่ = สร้างไฟล์ใน src/workers/ แล้วรัน npm run generate

services:
`;

for (const worker of workers) {
  yaml += `
  ${worker.name}:
    build: .
    container_name: ${worker.name}
    depends_on:
      kafka-init:
        condition: service_completed_successfully
    environment:
      WORKER_NAME: ${worker.name}
      WORKERS_CONFIG_DIR: /config
    volumes:
      - ./src/workers:/config:ro
    restart: unless-stopped
`;
}

// เขียนไฟล์
const outputPath = resolve(rootDir, 'docker-compose.workers.yml');
writeFileSync(outputPath, yaml);

console.log(`✅ Generated ${outputPath}`);
console.log(`   Workers: ${workers.map((w) => w.name).join(', ')}`);
console.log(`   (from ${workerFiles.length} files in src/workers/)`);
console.log('');
console.log('รันด้วย:');
console.log('  docker compose -f docker-compose.yml -f docker-compose.workers.yml up --build');
