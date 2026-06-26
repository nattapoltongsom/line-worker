/**
 * Config Module
 *
 * อ่าน config จาก directory (src/workers/):
 *   - shared.json        → shared settings (kafkaBroker, retry defaults)
 *   - {WORKER_NAME}.json → worker-specific config (topics, downstream, auth)
 *
 * Env vars ที่ต้องมี:
 *   WORKERS_CONFIG_DIR — path ไปที่ directory ที่มี shared.json + worker files
 *   WORKER_NAME       — ชื่อ worker (ต้อง match กับชื่อไฟล์ เช่น worker-chat → worker-chat.json)
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AuthConfig, AuthMode } from './auth/index.js';

export interface WorkerConfig {
  kafkaBroker: string;
  kafkaTopics: string[];
  kafkaGroupId: string;
  downstreamUrl: string;
  retryCount: number;
  retryBaseDelayMs: number;
  fetchTimeoutMs: number;
  pauseDurationMs: number;
  serviceName: string;
  auth: AuthConfig;
}

/** shared.json schema */
interface SharedConfig {
  kafkaBroker: string;
  image?: string;
  retryCount?: number;
  retryBaseDelayMs?: number;
  fetchTimeoutMs?: number;
  pauseDurationMs?: number;
}

/** worker file schema */
interface WorkerEntry {
  name: string;
  replicas?: number;
  topics: string[];
  groupId: string;
  downstreamUrl: string;
  auth: {
    mode: string;
    apiKeyHeader?: string;
    apiKeyValue?: string;
    oauth2TokenUrl?: string;
    oauth2ClientId?: string;
    oauth2ClientSecret?: string;
    oauth2Scope?: string;
    oauth2ExtraParams?: Record<string, string>;
    customTokenUrl?: string;
    customTokenBody?: Record<string, unknown>;
    customTokenField?: string;
    customTokenHeader?: string;
    customTokenPrefix?: string;
    customTokenExpiresIn?: number;
  };
  retryCount?: number;
  retryBaseDelayMs?: number;
  fetchTimeoutMs?: number;
  pauseDurationMs?: number;
}

/**
 * แทนที่ ${VAR_NAME} ด้วยค่าจาก environment variable
 * ถ้าไม่เจอ env var → throw error ชัดเจน
 * ถ้าไม่มี ${...} → คืนค่าเดิม
 */
function resolveEnvVars(value: string | undefined): string | undefined {
  if (!value) return value;

  return value.replace(/\$\{([^}]+)\}/g, (match, varName: string) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      throw new Error(`❌ Missing environment variable: ${varName} (referenced in config as \${${varName}})`);
    }
    return envValue;
  });
}

/**
 * อ่าน JSON file อย่างปลอดภัย — throw error ชัดเจนถ้าอ่านไม่ได้
 */
function readJson<T>(filePath: string): T {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`❌ Cannot read file "${filePath}": ${msg}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`❌ Invalid JSON in "${filePath}"`);
  }
}

/**
 * โหลด config จาก src/workers/ directory
 *
 * อ่าน:
 *   {WORKERS_CONFIG_DIR}/shared.json        → shared settings
 *   {WORKERS_CONFIG_DIR}/{WORKER_NAME}.json  → worker config
 */
export function loadConfig(): WorkerConfig {
  const configDir = process.env['WORKERS_CONFIG_DIR'] || './src/workers';
  const workerName = process.env['WORKER_NAME'] || 'worker-chat';

  console.log(`🔧 WORKER_NAME=${workerName}, WORKERS_CONFIG_DIR=${configDir}`);

  // อ่าน shared.json
  const sharedPath = join(configDir, 'shared.json');
  const shared = readJson<SharedConfig>(sharedPath);

  // อ่าน worker file
  const workerPath = join(configDir, `${workerName}.json`);
  let entry: WorkerEntry;
  try {
    entry = readJson<WorkerEntry>(workerPath);
  } catch {
    // ถ้าหาไฟล์ไม่เจอ — แสดง worker files ที่มีอยู่
    const available = readdirSync(configDir)
      .filter((f) => f.endsWith('.json') && f !== 'shared.json')
      .map((f) => f.replace('.json', ''));
    throw new Error(
      `❌ Worker config file not found: "${workerPath}"\n   Available workers: [${available.join(', ')}]`,
    );
  }

  console.log(`📄 Config loaded from: ${configDir}`);
  console.log(`   Shared: ${sharedPath}`);
  console.log(`   Worker: ${workerPath}`);

  // สร้าง config — worker override > shared > default
  // resolveEnvVars แทนที่ ${VAR} ด้วย environment variable
  return {
    kafkaBroker: resolveEnvVars(shared.kafkaBroker) || shared.kafkaBroker,
    kafkaTopics: entry.topics,
    kafkaGroupId: entry.groupId,
    downstreamUrl: resolveEnvVars(entry.downstreamUrl) || entry.downstreamUrl,
    retryCount: entry.retryCount ?? shared.retryCount ?? 3,
    retryBaseDelayMs: entry.retryBaseDelayMs ?? shared.retryBaseDelayMs ?? 1000,
    fetchTimeoutMs: entry.fetchTimeoutMs ?? shared.fetchTimeoutMs ?? 5000,
    pauseDurationMs: entry.pauseDurationMs ?? shared.pauseDurationMs ?? 10000,
    serviceName: entry.name,
    auth: {
      mode: entry.auth.mode as AuthMode,
      apiKeyHeader: resolveEnvVars(entry.auth.apiKeyHeader),
      apiKeyValue: resolveEnvVars(entry.auth.apiKeyValue),
      oauth2TokenUrl: resolveEnvVars(entry.auth.oauth2TokenUrl),
      oauth2ClientId: resolveEnvVars(entry.auth.oauth2ClientId),
      oauth2ClientSecret: resolveEnvVars(entry.auth.oauth2ClientSecret),
      oauth2Scope: resolveEnvVars(entry.auth.oauth2Scope),
      oauth2ExtraParams: entry.auth.oauth2ExtraParams,
      customTokenUrl: resolveEnvVars(entry.auth.customTokenUrl),
      customTokenBody: entry.auth.customTokenBody,
      customTokenField: resolveEnvVars(entry.auth.customTokenField),
      customTokenHeader: resolveEnvVars(entry.auth.customTokenHeader),
      customTokenPrefix: resolveEnvVars(entry.auth.customTokenPrefix),
      customTokenExpiresIn: entry.auth.customTokenExpiresIn,
    },
  };
}
