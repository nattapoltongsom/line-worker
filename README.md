# Kafka Consumer Worker

รับ message จาก Kafka → ส่งต่อไป REST API ปลายทาง  
1 ไฟล์ config = 1 worker, เพิ่ม worker = เพิ่มไฟล์ JSON

---

## Commands ทั้งหมด

| Command | ทำอะไร |
|---------|--------|
| `npm run dev` | เปิดทั้งระบบ (Kafka + mocks + workers) |
| `npm run dev:down` | ปิดทั้งระบบ |
| `npm run dev:logs` | ดู log ทุก container |
| `npm run test:send` | ส่ง 1 message เข้า Kafka |
| `npm run test:stats` | ดูจำนวน messages ที่ downstream ได้รับ |
| `npm run test:reset` | ล้าง messages ใน mock downstream ทั้งหมด |
| `./scripts/test-all.sh` | ทดสอบทุก worker อัตโนมัติ (ส่ง + ตรวจผล) |
| `./scripts/test-worker.sh worker-chat` | ทดสอบ worker รายตัว |
| `npm run deploy` | Deploy ขึ้น Kubernetes (Helm) |

---

# ส่วนที่ 1: ทดสอบ Local

## เปิดระบบ

```bash
npm install    # ครั้งแรกครั้งเดียว
npm run dev
```

รอจนเห็น:
```
worker-chat         | [worker-chat] 🚀 Worker is running...
worker-analytics    | [worker-analytics] 🚀 Worker is running...
worker-notification | [worker-notification] 🚀 Worker is running...
```

## ทดสอบอัตโนมัติ (แนะนำ)

เปิด terminal ใหม่:

```bash
./scripts/test-all.sh
```

ผลลัพธ์:
```
🧪 ทดสอบ Workers ทั้งหมด
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣  Reset downstream ทั้งหมด...
2️⃣  ส่ง message ไป line.messages...
3️⃣  ส่ง message ไป line.events (เฉพาะ analytics)...
4️⃣  รอ workers process (3s)...
5️⃣  ผลลัพธ์:
   worker-chat         → 1 messages (คาดหวัง: 1)
   worker-analytics    → 2 messages (คาดหวัง: 2 เพราะ subscribe 2 topics)
   worker-notification → 1 messages (คาดหวัง: 1)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ ผ่านทั้งหมด!
```

## ทดสอบ worker รายตัว

```bash
./scripts/test-worker.sh worker-chat
./scripts/test-worker.sh worker-analytics
./scripts/test-worker.sh worker-notification
```

## ทดสอบ manual (ทีละ command)

```bash
# ส่ง message
npm run test:send

# ดู stats
npm run test:stats

# ล้าง แล้วลองใหม่
npm run test:reset
npm run test:send
npm run test:stats
```

## ทดสอบ downstream ล่ม

```bash
# หยุด downstream
docker stop mock-chat

# ส่ง message
npm run test:send

# ดู log (เห็น retry → pause)
docker logs worker-chat --tail=15

# เปิด downstream กลับ → รอ 10 วินาที → message ถูกส่งสำเร็จ
docker start mock-chat
sleep 12
npm run test:stats
```

## ดู log ของ worker ตัวใดตัวหนึ่ง

```bash
docker logs -f worker-chat
docker logs -f worker-analytics
docker logs -f worker-notification
```

## ดู Kafka UI

http://localhost:8080

## ปิดระบบ

```bash
npm run dev:down
```

---

# ส่วนที่ 2: Deploy Kubernetes + ArgoCD

> ส่วนนี้แนะนำให้เข้าใจ Part 1 ก่อน  
> ต้องติดตั้ง: `brew install minikube kubectl helm`

## Deploy คืออะไร — Data ไปไหนบ้าง

```
┌─────────────────────────────────────────────────────────────────────┐
│  ภาพรวม: Deploy ขึ้น Cloud/K8s จริง ๆ มีอะไรบ้าง                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────┐   push    ┌────────┐  detect   ┌────────┐              │
│  │  Dev   │─────────▶│  Git   │─────────▶│ ArgoCD │              │
│  │(คุณ)   │           │(GitHub)│           │        │              │
│  └────────┘           └────────┘           └───┬────┘              │
│                                                 │                    │
│                                                 │ deploy             │
│                                                 ▼                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │            Kubernetes Cluster (EKS / GKE / Minikube)          │   │
│  │                                                               │   │
│  │  ┌─────────────┐     ┌───────────────┐     ┌─────────────┐  │   │
│  │  │ Docker      │     │    Worker      │     │  Downstream │  │   │
│  │  │ Registry    │────▶│    Pods        │────▶│  Services   │  │   │
│  │  │(เก็บ image) │     │(รัน code ของคุณ)│     │(API ปลายทาง)│  │   │
│  │  └─────────────┘     └───────┬────────┘     └─────────────┘  │   │
│  │                              │                                │   │
│  │                              │ consume                        │   │
│  │                              ▼                                │   │
│  │                      ┌──────────────┐                         │   │
│  │                      │    Kafka     │                         │   │
│  │                      │  (messages)  │                         │   │
│  │                      └──────────────┘                         │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### แต่ละชิ้นคืออะไร

| ชิ้น | คืออะไร | เปรียบเทียบ |
|------|---------|-------------|
| **Git (GitHub)** | เก็บ code + config | เหมือนกล่องเก็บ blueprint |
| **Docker Registry** | เก็บ Docker image (app ที่ build แล้ว) | เหมือน App Store สำหรับ server |
| **Kubernetes (K8s)** | ระบบจัดการ containers | เหมือนคนคุม server ให้ — เปิด/ปิด/restart ให้อัตโนมัติ |
| **Pod** | container ที่กำลังรัน (1 pod = 1 worker) | เหมือน process 1 ตัว |
| **Helm** | เครื่องมือ deploy — เอา config ไป generate K8s resources | เหมือน template engine |
| **ArgoCD** | ดู Git → ถ้า config เปลี่ยน → deploy ใหม่อัตโนมัติ | เหมือนคนกด deploy ให้ทุกครั้งที่ push |
| **Kafka** | Queue ที่เก็บ messages | เหมือนท่อส่งข้อมูล |
| **Downstream** | REST API ปลายทางที่ worker ส่ง message ไปให้ | service จริงที่รับ data |

### Data flow (ข้อมูลไปไหน)

```
ใครก็ได้ส่ง message ───▶ Kafka topic "line.messages"
                              │
                              │ worker consume (ดึงออกมา)
                              ▼
                        Worker Pod
                              │
                              │ POST (ส่ง HTTP request)
                              ▼
                     Downstream Service
                   (เช่น Chat API, Analytics API)
```

**Worker ไม่ได้สร้าง data** — มันแค่ส่งต่อ message จาก Kafka ไป API ปลายทาง

### Deploy flow (code ไปถึง server ยังไง)

```
1. Dev สร้าง/แก้ src/workers/worker-xxx.json
2. Dev: npm run generate:helm
3. Dev: git push
4. ArgoCD เห็นว่า config เปลี่ยน
5. ArgoCD สั่ง Kubernetes: "สร้าง/อัปเดต Worker Pod"
6. Kubernetes ดึง Docker image จาก Registry
7. Pod เริ่มทำงาน → connect Kafka → consume → forward
```

---

## Minikube — ลอง Deploy ด้วยตัวเอง

Minikube = Kubernetes จำลองบนเครื่องคุณ (ไม่ต้องมี cloud)

### เปิด cluster

```bash
minikube start --memory=4096 --cpus=2
```

### Build image ใน Minikube

ปกติ image จะอยู่ใน Registry (Docker Hub, ECR)  
แต่ตอน dev เราให้ minikube ใช้ image ที่ build ในเครื่องได้เลย:

```bash
eval $(minikube docker-env)    # บอก docker ให้ build เข้า minikube
docker build -t kafka-worker:latest .
```

### Deploy Kafka (สำหรับ test)

Production จะใช้ Kafka ที่ DevOps เตรียมให้ (managed service)  
ตอน dev เราสร้างเองใน minikube:

```bash
kubectl apply -f k8s/kafka-minikube.yaml
kubectl wait --for=condition=ready pod/kafka --timeout=120s

# สร้าง topic
kubectl exec kafka -- /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create --if-not-exists \
  --topic line.messages --partitions 3 --replication-factor 1
```

### Deploy Workers (Helm)

command นี้จะ:
1. อ่าน `src/workers/*.json`
2. Generate Helm values
3. สั่ง Kubernetes สร้าง 1 Deployment ต่อ worker

```bash
npm run deploy
```

### ดูว่า deploy สำเร็จ

```bash
kubectl get pods -l app=kafka-worker
```

ผลลัพธ์ที่คาดหวัง:
```
NAME                              READY   STATUS    AGE
worker-chat-xxxxx                 1/1     Running   30s
worker-analytics-xxxxx            1/1     Running   30s
worker-notification-xxxxx         1/1     Running   30s
```

### ดู log

```bash
kubectl logs -f deployment/worker-chat
```

### ส่ง message ทดสอบ

```bash
echo '{"test":"from-k8s"}' | kubectl exec -i kafka -- \
  /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic line.messages
```

> Note: ใน minikube ไม่มี downstream service จริง ดังนั้น worker จะ retry แล้ว pause — ซึ่งถูกต้อง (ถ้า deploy จริงจะมี downstream อยู่ใน cluster)

### ปิด

```bash
helm uninstall kafka-workers
kubectl delete -f k8s/kafka-minikube.yaml
minikube stop
```

---

## ArgoCD — GitOps (push แล้ว deploy อัตโนมัติ)

ArgoCD = ระบบที่ดู Git repo ของคุณ → ถ้า config เปลี่ยนจะ deploy ให้อัตโนมัติ

```
คุณ push code ──▶ GitHub ──▶ ArgoCD เห็น ──▶ Deploy ไป K8s ──▶ Workers ทำงาน
```

### Step A: Push code ขึ้น GitHub ก่อน

ArgoCD อ่าน config จาก Git — ถ้ายังไม่ push จะเจอ error "revision main must be resolved"

```bash
# Generate Helm values (ต้อง commit ไฟล์นี้ด้วย)
npm run generate:helm

# Commit + push
git add .
git commit -m "update helm values"
git push
```

> repo: https://github.com/nattapoltongsom/line-worker.git (ต้อง push สำเร็จก่อน)

### Step B: เปิด Minikube + Deploy Kafka

ArgoCD deploy เฉพาะ **Workers** — แต่ Kafka ต้องมีอยู่ใน cluster ก่อน:

```bash
minikube start --memory=4096 --cpus=2

# Build image ให้ minikube ใช้ได้
eval $(minikube docker-env)
docker build -t kafka-worker:latest .

# Deploy Kafka
kubectl apply -f k8s/kafka-minikube.yaml
kubectl wait --for=condition=ready pod/kafka --timeout=120s

# สร้าง topic
kubectl exec kafka -- /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create --if-not-exists \
  --topic line.messages --partitions 3 --replication-factor 1
```

### Step C: ติดตั้ง ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# รอ ready (~2 นาที)
kubectl wait --for=condition=available deployment/argocd-server -n argocd --timeout=300s
```

### Step D: เปิด ArgoCD UI

```bash
# Port forward (เปิด terminal ทิ้งไว้)
kubectl port-forward svc/argocd-server -n argocd 8443:443 &

# ดู password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d && echo
```

เปิด https://localhost:8443 → login: `admin` / password จาก command ด้านบน

### Step E: สร้าง ArgoCD Application

```bash
kubectl apply -f k8s/argocd/application.yaml
```

ArgoCD จะ:
1. อ่าน repo `https://github.com/nattapoltongsom/line-worker.git` branch `main`
2. อ่าน Helm chart จาก `helm/kafka-worker/` + `values-generated.json`
3. Generate Deployments → apply ไป K8s
4. Workers connect Kafka → ทำงาน!

### Step F: ตรวจว่าทำงาน

```bash
# ดู pods
kubectl get pods -l app=kafka-worker

# ดู log
kubectl logs -f deployment/worker-chat
```

ถ้ายังมีปัญหา:
```bash
kubectl get pod kafka       # Kafka ต้อง Running
kubectl describe pod -l app=kafka-worker   # ดู events
```

### Step G: ทดลอง push แล้วดู ArgoCD auto deploy

```bash
# สร้าง worker ใหม่
cat > src/workers/worker-test-argo.json << 'EOF'
{
  "name": "worker-test-argo",
  "replicas": 1,
  "topics": ["line.messages"],
  "groupId": "worker-test-argo",
  "downstreamUrl": "http://test:3000/incoming",
  "auth": { "mode": "none" }
}
EOF

# Generate + push
npm run generate:helm
git add .
git commit -m "feat: add worker-test-argo"
git push
```

กลับไปดู ArgoCD UI → "OutOfSync" → auto sync → Pod ใหม่ขึ้นมา!

```bash
kubectl get pods -l app=kafka-worker
# จะเห็น worker-test-argo เพิ่มมา
```

### Flow ที่ใช้จริงหลังจากนี้

```
1. แก้ src/workers/*.json (เพิ่ม/ลบ worker)
2. npm run generate:helm
3. git add . && git commit -m "update" && git push
4. ArgoCD auto sync → Deploy อัปเดต!
```

### ปิดทุกอย่าง

```bash
kubectl delete -f k8s/argocd/application.yaml
kubectl delete namespace argocd
kubectl delete -f k8s/kafka-minikube.yaml
minikube stop
```

---

# เพิ่ม Worker ใหม่

สร้างไฟล์ `src/workers/worker-xxx.json`:

```json
{
  "name": "worker-xxx",
  "replicas": 1,
  "topics": ["your-topic"],
  "groupId": "worker-xxx",
  "downstreamUrl": "http://your-service:3000/incoming",
  "auth": { "mode": "none" }
}
```

- Local: `npm run dev:down && npm run dev`
- K8s: `npm run deploy`
- ArgoCD: `npm run generate:helm && git push`

---

# Code อยู่ที่ไหน

| ไฟล์ | ทำอะไร |
|------|--------|
| `src/workers/shared.json` | Config ที่ใช้ร่วม (Kafka broker, retry) |
| `src/workers/worker-*.json` | Config ต่อ worker (topic, downstream, auth) |
| `src/index.ts` | Entry point |
| `src/config.ts` | อ่าน JSON config |
| `src/consumer.ts` | Kafka consumer logic |
| `src/forwarder.ts` | HTTP POST + retry |
| `src/auth/` | Auth strategies (none, api-key, oauth2, custom-token) |
| `scripts/` | Generate scripts + test scripts |
