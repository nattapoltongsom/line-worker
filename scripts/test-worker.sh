#!/bin/bash
# ทดสอบ worker รายตัว — ส่ง message แล้วดูว่า downstream ได้รับ
#
# ใช้: ./scripts/test-worker.sh <worker-name>
# ตัวอย่าง:
#   ./scripts/test-worker.sh worker-chat
#   ./scripts/test-worker.sh worker-analytics
#   ./scripts/test-worker.sh worker-notification
#
# prerequisite: npm run dev ต้องรันอยู่

set -e

WORKER_NAME=${1:-"worker-chat"}

# อ่าน config ของ worker
CONFIG_FILE="src/workers/${WORKER_NAME}.json"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "❌ ไม่พบ config: $CONFIG_FILE"
  echo "   workers ที่มี:"
  ls src/workers/worker-*.json | sed 's|src/workers/||' | sed 's|.json||' | sed 's|^|   - |'
  exit 1
fi

# ดึง topics จาก config
TOPICS=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8'));console.log(c.topics.join(' '))")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 ทดสอบ: $WORKER_NAME"
echo "   topics: $TOPICS"
echo "   config: $CONFIG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ตรวจว่า docker compose รันอยู่
if ! docker ps --format '{{.Names}}' | grep -q "^kafka$"; then
  echo "❌ Docker compose ไม่ได้รัน"
  echo "   รันก่อน: npm run dev"
  exit 1
fi

# ตรวจว่า worker container รันอยู่
if ! docker ps --format '{{.Names}}' | grep -q "^${WORKER_NAME}$"; then
  echo "❌ Container ${WORKER_NAME} ไม่ได้รัน"
  echo "   ตรวจดู: docker ps"
  exit 1
fi

# Reset downstream ก่อนเทส
echo "1️⃣  Reset downstream..."
# ดึง downstream port จาก container
PORT=$(docker inspect "$WORKER_NAME" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep WORKER_NAME || true)

# ใช้วิธี reset ทุก mock downstream
curl -s -X POST http://localhost:5001/reset > /dev/null 2>&1 || true
curl -s -X POST http://localhost:5002/reset > /dev/null 2>&1 || true
curl -s -X POST http://localhost:5003/reset > /dev/null 2>&1 || true
echo "   ✅ Reset done"
echo ""

# ส่ง message ไปทุก topic ของ worker
echo "2️⃣  ส่ง message ไป topics: $TOPICS"
for TOPIC in $TOPICS; do
  MSG="{\"test\":\"${WORKER_NAME}\",\"topic\":\"${TOPIC}\",\"time\":\"$(date +%H:%M:%S)\"}"
  echo "$MSG" | docker exec -i kafka /opt/kafka/bin/kafka-console-producer.sh \
    --bootstrap-server localhost:9092 \
    --topic "$TOPIC" 2>/dev/null
  echo "   ✅ ส่งไป $TOPIC: $MSG"
done
echo ""

# รอ worker process
echo "3️⃣  รอ worker process (3s)..."
sleep 3
echo ""

# ดู log ของ worker
echo "4️⃣  Log ล่าสุดของ $WORKER_NAME:"
echo "   ─────────────────────────────────"
docker logs "$WORKER_NAME" --tail=10 2>&1 | sed 's/^/   /'
echo "   ─────────────────────────────────"
echo ""

# ดู stats downstream
echo "5️⃣  Stats downstream:"
echo "   chat:         $(curl -s http://localhost:5001/stats 2>/dev/null | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.totalMessages+' messages')}catch{console.log('N/A')}" 2>/dev/null)"
echo "   analytics:    $(curl -s http://localhost:5002/stats 2>/dev/null | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.totalMessages+' messages')}catch{console.log('N/A')}" 2>/dev/null)"
echo "   notification: $(curl -s http://localhost:5003/stats 2>/dev/null | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.totalMessages+' messages')}catch{console.log('N/A')}" 2>/dev/null)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ทดสอบ $WORKER_NAME เสร็จ"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
