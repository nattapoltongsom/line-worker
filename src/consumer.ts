/**
 * Kafka Consumer Logic
 * - ใช้ KafkaJS กับ manual commit (autoCommit: false)
 * - eachMessage → forward ไป downstream
 * - success → commit offset+1
 * - fail (หลัง retry หมด) → seek กลับ offset เดิม → pause partition → setTimeout resume
 * - Retry subscribe ถ้า topic ยังไม่มี (10 ครั้ง, ทุก 3 วินาที)
 * - Graceful shutdown (SIGINT/SIGTERM → disconnect)
 * - ส่ง heartbeat หลัง retry เพื่อไม่ให้ Kafka คิดว่า consumer ตาย
 */

import { Kafka, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import { WorkerConfig } from './config.js';
import { forwardMessage, ForwarderOptions } from './forwarder.js';
import { createAuthProvider } from './auth/index.js';

/** จำนวนครั้งที่ retry subscribe ถ้า topic ยังไม่มี */
const SUBSCRIBE_RETRY_COUNT = 10;
/** ระยะเวลาระหว่าง retry subscribe (ms) */
const SUBSCRIBE_RETRY_DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * เริ่ม worker — สร้าง Kafka consumer แล้ว run
 * คืน cleanup function สำหรับ graceful shutdown
 */
export async function startWorker(config: WorkerConfig): Promise<() => Promise<void>> {
  const kafka = new Kafka({
    clientId: config.serviceName,
    brokers: [config.kafkaBroker],
    logLevel: logLevel.WARN,
  });

  const consumer: Consumer = kafka.consumer({
    groupId: config.kafkaGroupId,
    sessionTimeout: 60000, // 60 วินาที
    heartbeatInterval: 10000, // 10 วินาที
  });

  await consumer.connect();
  console.log(`[${config.serviceName}] ✅ Connected to Kafka broker: ${config.kafkaBroker}`);

  // Retry subscribe — topic อาจยังไม่ถูกสร้าง (subscribe ทุก topics)
  let subscribed = false;
  for (let i = 0; i < SUBSCRIBE_RETRY_COUNT; i++) {
    try {
      await consumer.subscribe({
        topics: config.kafkaTopics,
        fromBeginning: false,
      });
      subscribed = true;
      console.log(
        `[${config.serviceName}] ✅ Subscribed to topics: ${config.kafkaTopics.join(', ')}`,
      );
      break;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[${config.serviceName}] ⚠️ Subscribe failed (${i + 1}/${SUBSCRIBE_RETRY_COUNT}): ${msg}`,
      );
      if (i < SUBSCRIBE_RETRY_COUNT - 1) {
        await sleep(SUBSCRIBE_RETRY_DELAY_MS);
      }
    }
  }

  if (!subscribed) {
    throw new Error(
      `[${config.serviceName}] ❌ ไม่สามารถ subscribe topics [${config.kafkaTopics.join(', ')}] ได้หลัง ${SUBSCRIBE_RETRY_COUNT} ครั้ง`,
    );
  }

  // สร้าง auth provider ตาม config
  const authProvider = createAuthProvider(config.auth);
  console.log(`[${config.serviceName}] 🔑 Auth mode: ${authProvider.name}`);

  // Forwarder options — ใช้ซ้ำทุก message
  const forwarderOpts: ForwarderOptions = {
    downstreamUrl: config.downstreamUrl,
    retryCount: config.retryCount,
    retryBaseDelayMs: config.retryBaseDelayMs,
    fetchTimeoutMs: config.fetchTimeoutMs,
    serviceName: config.serviceName,
    authProvider,
  };

  // เริ่ม consume
  await consumer.run({
    autoCommit: false,
    eachMessage: async (payload: EachMessagePayload) => {
      const { topic, partition, message, heartbeat } = payload;
      const offset = message.offset;
      const value = message.value;

      if (!value) {
        // message ไม่มี value — skip แล้ว commit
        await consumer.commitOffsets([
          { topic, partition, offset: String(Number(offset) + 1) },
        ]);
        return;
      }

      console.log(
        `[${config.serviceName}] 📨 Received message: topic=${topic} partition=${partition} offset=${offset}`,
      );

      // ส่ง heartbeat ก่อน forward เพื่อบอก Kafka ว่ายังอยู่
      await heartbeat();

      // Forward message ไป downstream
      const success = await forwardMessage(value, forwarderOpts);

      // ส่ง heartbeat หลัง retry เสร็จ (อาจใช้เวลานาน)
      await heartbeat();

      if (success) {
        // สำเร็จ — commit offset+1
        await consumer.commitOffsets([
          { topic, partition, offset: String(Number(offset) + 1) },
        ]);
        console.log(
          `[${config.serviceName}] ✅ Committed offset ${Number(offset) + 1} (partition ${partition})`,
        );
      } else {
        // ล้มเหลว — seek กลับ offset เดิม → pause → resume หลัง PAUSE_DURATION_MS
        console.error(
          `[${config.serviceName}] ❌ Forward failed — pausing partition ${partition} for ${config.pauseDurationMs}ms`,
        );

        // Seek กลับไปที่ offset เดิมเพื่อ retry message นี้ตอน resume
        consumer.seek({ topic, partition, offset });

        // Pause partition นี้
        consumer.pause([{ topic, partitions: [partition] }]);

        // ตั้ง timer เพื่อ resume
        setTimeout(() => {
          consumer.resume([{ topic, partitions: [partition] }]);
          console.log(
            `[${config.serviceName}] ▶️ Resumed partition ${partition} after ${config.pauseDurationMs}ms`,
          );
        }, config.pauseDurationMs);
      }
    },
  });

  console.log(`[${config.serviceName}] 🚀 Worker is running...`);

  // Graceful shutdown function
  const shutdown = async () => {
    console.log(`[${config.serviceName}] 🛑 Shutting down...`);
    await consumer.disconnect();
    console.log(`[${config.serviceName}] 👋 Disconnected from Kafka`);
  };

  return shutdown;
}
