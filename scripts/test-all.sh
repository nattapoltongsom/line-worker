#!/bin/bash
# ทดสอบ workers ทั้งหมด
#
# ใช้: ./scripts/test-all.sh
# prerequisite: npm run dev ต้องรันอยู่

set -e

echo ""
echo "🧪 ทดสอบ Workers ทั้งหมด"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ตรวจว่า docker compose รันอยู่
if ! docker ps --format '{{.Names}}' | grep -q "^kafka$"; then
  echo "❌ Docker compose ไม่ได้รัน"
  echo "   รันก่อน: npm run dev"
  exit 1
fi

# Reset ทั้งหมด
echo "1️⃣  Reset downstream ทั้งหมด..."
curl -s -X POST http://localhost:5001/reset > /dev/null
curl -s -X POST http://localhost:5002/reset > /dev/null
curl -s -X POST http://localhost:5003/reset > /dev/null
echo "   ✅ Done"
echo ""

# ส่ง message ไป line.messages (ทุก worker subscribe)
echo "2️⃣  ส่ง message ไป line.messages..."
echo '{"test":"all-workers","topic":"line.messages"}' | docker exec -i kafka \
  /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic line.messages 2>/dev/null
echo "   ✅ Sent"
echo ""

# ส่ง message ไป line.events (เฉพาะ analytics subscribe)
echo "3️⃣  ส่ง message ไป line.events (เฉพาะ analytics)..."
echo '{"test":"analytics-only","topic":"line.events"}' | docker exec -i kafka \
  /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic line.events 2>/dev/null
echo "   ✅ Sent"
echo ""

# รอ
echo "4️⃣  รอ workers process (3s)..."
sleep 3
echo ""

# ดูผลลัพธ์
echo "5️⃣  ผลลัพธ์:"
echo ""

CHAT=$(curl -s http://localhost:5001/stats | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.totalMessages)")
ANALYTICS=$(curl -s http://localhost:5002/stats | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.totalMessages)")
NOTIF=$(curl -s http://localhost:5003/stats | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.totalMessages)")

echo "   worker-chat         → $CHAT messages (คาดหวัง: 1)"
echo "   worker-analytics    → $ANALYTICS messages (คาดหวัง: 2 เพราะ subscribe 2 topics)"
echo "   worker-notification → $NOTIF messages (คาดหวัง: 1)"
echo ""

# ตรวจผล
PASS=true
if [ "$CHAT" != "1" ]; then echo "   ❌ worker-chat ผิด (ได้ $CHAT คาดหวัง 1)"; PASS=false; fi
if [ "$ANALYTICS" != "2" ]; then echo "   ❌ worker-analytics ผิด (ได้ $ANALYTICS คาดหวัง 2)"; PASS=false; fi
if [ "$NOTIF" != "1" ]; then echo "   ❌ worker-notification ผิด (ได้ $NOTIF คาดหวัง 1)"; PASS=false; fi

echo ""
if [ "$PASS" = true ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ ผ่านทั้งหมด!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ มีบางตัวไม่ผ่าน — ดู log:"
  echo "   docker logs worker-chat --tail=10"
  echo "   docker logs worker-analytics --tail=10"
  echo "   docker logs worker-notification --tail=10"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
