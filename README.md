# Kafka Consumer Worker

รับ message จาก Kafka topic → ส่งต่อไป REST API ปลายทาง (downstream)  
1 ไฟล์ config JSON = 1 worker instance

---

## Concept

Project นี้สนใจแค่ **Worker** เท่านั้น:
- consume message จาก Kafka
- forward ไป downstream URL

สิ่งที่ worker ต้องต่อ (Kafka + Downstream) อยู่ใน `dependency/` folder แยก  
เปิด dependency ก่อน → แล้วค่อยรัน worker

---

## โครงสร้างโปรเจค

```
├── src/                        # Worker code
│   ├── index.ts                # Entry point
│   ├── config.ts               # อ่าน JSON config
│   ├── consumer.ts             # Kafka consumer logic
│   ├── forwarder.ts            # HTTP POST + retry ไป downstream
│   ├── auth/                   # Auth strategies (none, api-key, oauth2, custom-token)
│   └── workers/                # Config files (1 ไฟล์ = 1 worker)
│       ├── shared.json         # Config ที่ใช้ร่วม (broker, retry)
│       ├── worker-chat.json
│       ├── worker-analytics.json
│       └── worker-notification.json
├── Dockerfile                  # Build image สำหรับ deploy
├── helm/                       # Helm chart สำหรับ deploy K8s
├── k8s/                        # Kafka minikube manifest + ArgoCD
├── scripts/
│   └── generate-helm-values.ts # อ่าน workers/*.json → สร้าง Helm values
├── dependency/                 # ⚡ สิ่งที่ worker ต้องต่อ (ไม่เกี่ยวกับ worker code)
│   ├── docker-compose.yml      # Kafka + Kafka UI + Mock Downstream
│   └── mock-downstream/        # Mock REST API ปลายทาง
├── package.json
└── tsconfig.json
```

---

## Section 1: รัน Worker Local

### 1. เปิด Dependency (Kafka + Downstream)

```bash
# เปิด Kafka + Mock Downstream ทั้งหมด (ใช้ตัวเดียวทั้ง local และ deploy test)
cd dependency && docker compose up -d && cd ..
```

> รอ ~15 วินาที — ได้:
> | Service | URL |
> |---------|-----|
> | Kafka (worker connect ที่นี่) | `localhost:9094` |
> | Kafka UI | http://localhost:8080 |
> | mock-chat (downstream) | http://localhost:5001 |
> | mock-analytics (downstream) | http://localhost:5002 |
> | mock-notification (downstream) | http://localhost:5003 |

### 2. รัน Worker

```bash
# default: worker-chat
npm start

# หรือเลือก worker อื่น
WORKER_NAME=worker-analytics npm start
WORKER_NAME=worker-notification npm start
```

> Worker จะ connect Kafka (`localhost:9094`) → consume → POST ไป downstream (`localhost:500x`)

### 3. ทดสอบ — Produce message

```bash
# ส่ง message เข้า Kafka
echo '{"userId":"U001","text":"Hello!"}' | docker exec -i kafka \
  /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic line.messages
```

> ดูผลลัพธ์:
> - Worker terminal → log consume + forward
> - `curl http://localhost:5001/stats` → ดูจำนวน messages ที่ downstream ได้รับ
> - Kafka UI (http://localhost:8080) → ดู messages ใน topic

### 4. ปิด

```bash
# ปิด Worker — Ctrl+C
# ปิด Dependency
cd dependency && docker compose down && cd ..
```

---

## Section 2: Deploy Minikube

Worker ใน minikube จะ connect กลับมาที่ dependency/ บน host ผ่าน `host.minikube.internal`  
ไม่ต้อง deploy Kafka แยกใน cluster

### 1. เปิด Dependency (ถ้ายังไม่ได้เปิด)

```bash
cd dependency && docker compose up -d && cd ..
```

### 2. เปิด Minikube

```bash
minikube start --memory=4096 --cpus=2
```

### 3. Build image

```bash
eval $(minikube docker-env)
docker build -t kafka-worker:latest .
```

### 4. Deploy Workers

```bash
# generate values (แปลง localhost → host.minikube.internal อัตโนมัติ) + deploy
npm run deploy
```

### 5. ตรวจสอบ

```bash
kubectl get pods -l app=kafka-worker
kubectl logs -f deployment/worker-chat
```

> Worker จะ connect:
> - Kafka → `host.minikube.internal:9094` (dependency/ บน host)
> - Downstream → `host.minikube.internal:5001-5003` (dependency/ บน host)

### 6. Produce message ทดสอบ

```bash
# ส่งผ่าน kafka container ที่รันอยู่บน host (dependency/)
echo '{"test":"from-k8s"}' | docker exec -i kafka \
  /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic line.messages
```

### 7. ปิด

```bash
helm uninstall kafka-workers
minikube stop
```

---

## Section 3: ArgoCD (GitOps)

### Prerequisites

- Minikube รันอยู่ + dependency/ เปิดอยู่บน host
- Code push ขึ้น GitHub แล้ว

### ขั้นตอน

```bash
# 1. Generate helm values + push
npm run generate:helm
git add . && git commit -m "update helm values" && git push

# 2. ติดตั้ง ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl wait --for=condition=available deployment/argocd-server -n argocd --timeout=300s

# 3. เปิด UI
kubectl port-forward svc/argocd-server -n argocd 8443:443 &
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d && echo
# เปิด https://localhost:8443 → admin / password ด้านบน

# 4. สร้าง Application
kubectl apply -f k8s/argocd/application.yaml

# 5. ดู pods
kubectl get pods -l app=kafka-worker
```

### ปิด

```bash
kubectl delete -f k8s/argocd/application.yaml
kubectl delete namespace argocd
minikube stop
```

---

## เพิ่ม Worker ใหม่

สร้างไฟล์ `src/workers/worker-xxx.json`:

```json
{
  "name": "worker-xxx",
  "replicas": 1,
  "topics": ["your-topic"],
  "groupId": "worker-xxx",
  "downstreamUrl": "http://localhost:5001/incoming",
  "auth": { "mode": "none" }
}
```

| วิธี | คำสั่ง |
|------|--------|
| Local | `WORKER_NAME=worker-xxx npm start` |
| Minikube | `npm run deploy` |
| ArgoCD | `npm run generate:helm && git push` |

---

## คำสั่งทั้งหมด

| คำสั่ง | ทำอะไร |
|--------|--------|
| `npm start` | รัน worker (default: worker-chat) |
| `npm run build` | Compile TypeScript |
| `npm run generate:helm` | สร้าง Helm values จาก src/workers/*.json |
| `npm run deploy` | Generate + deploy ขึ้น K8s ด้วย Helm |

---

## Dependency (Kafka + Downstream)

ดู `dependency/README.md` สำหรับ:
- เปิด/ปิด Kafka + Downstream
- เพิ่ม/ลบ topics
- Produce message ทดสอบ
- ดู stats ของ downstream
