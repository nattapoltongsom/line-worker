# Dependency — Kafka + Mock Downstream

สิ่งที่ worker ต้องต่อด้วย แต่ไม่ได้เป็นส่วนหนึ่งของ worker code  
เปิดทีเดียวแล้วใช้ได้ทั้ง local dev และ deploy test

---

## เปิดทุกอย่าง (Kafka + Downstream)

```bash
cd dependency
docker compose up -d
```

> เปิดแล้วได้:
> | Service | URL | หน้าที่ |
> |---------|-----|--------|
> | Kafka (external) | `localhost:9094` | Worker connect ที่นี่ |
> | Kafka UI | http://localhost:8080 | ดู topics/messages |
> | mock-chat | http://localhost:5001 | downstream ของ worker-chat |
> | mock-analytics | http://localhost:5002 | downstream ของ worker-analytics |
> | mock-notification | http://localhost:5003 | downstream ของ worker-notification |

---

## ปิดทุกอย่าง

```bash
cd dependency
docker compose down
```

---

## จัดการ Topics

### ดู topics ทั้งหมด

```bash
docker exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --list
```

### เพิ่ม topic ใหม่

```bash
docker exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create --if-not-exists \
  --topic your-new-topic --partitions 3 --replication-factor 1
```

### ลบ topic

```bash
docker exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --delete --topic your-topic
```

---

## Produce message (ส่ง message เข้า Kafka)

```bash
# ส่ง 1 message
echo '{"userId":"U001","text":"Hello!"}' | docker exec -i kafka \
  /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic line.messages

# ส่งหลาย messages
docker exec -i kafka /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic line.messages << 'EOF'
{"userId":"U001","text":"สวัสดี"}
{"userId":"U002","text":"ทดสอบ"}
EOF
```

---

## ดู stats ของ mock downstream

```bash
curl http://localhost:5001/stats   # mock-chat
curl http://localhost:5002/stats   # mock-analytics
curl http://localhost:5003/stats   # mock-notification
```

---

## โครงสร้าง

```
dependency/
├── docker-compose.yml      # Kafka + Kafka UI + Mock Downstream ทั้งหมด
├── mock-downstream/
│   ├── Dockerfile          # Build image สำหรับ mock server
│   ├── server.ts           # HTTP server รับ POST /incoming
│   └── package.json
└── README.md               # ไฟล์นี้
```
