/**
 * Entry point — อ่าน config แล้วเรียก startWorker
 * จัดการ SIGINT/SIGTERM สำหรับ graceful shutdown
 */

import { loadConfig } from './config.js';
import { startWorker } from './consumer.js';

async function main() {
  // โหลด config จาก environment variables
  const config = loadConfig();

  console.log(`[${config.serviceName}] 🔧 Config loaded:`);
  console.log(`  KAFKA_BROKER:       ${config.kafkaBroker}`);
  console.log(`  KAFKA_TOPICS:       ${config.kafkaTopics.join(', ')}`);
  console.log(`  KAFKA_GROUP_ID:     ${config.kafkaGroupId}`);
  console.log(`  DOWNSTREAM_URL:     ${config.downstreamUrl}`);
  console.log(`  AUTH_MODE:          ${config.auth.mode}`);
  console.log(`  RETRY_COUNT:        ${config.retryCount}`);
  console.log(`  RETRY_BASE_DELAY:   ${config.retryBaseDelayMs}ms`);
  console.log(`  FETCH_TIMEOUT:      ${config.fetchTimeoutMs}ms`);
  console.log(`  PAUSE_DURATION:     ${config.pauseDurationMs}ms`);

  // เริ่ม worker — ได้ shutdown function กลับมา
  const shutdown = await startWorker(config);

  // Graceful shutdown — รับ signal แล้ว disconnect
  const handleSignal = async (signal: string) => {
    console.log(`[${config.serviceName}] 📡 Received ${signal}`);
    await shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
