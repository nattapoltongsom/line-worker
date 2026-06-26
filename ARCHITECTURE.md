# สรุปภาพรวม — ทุกชิ้นทำอะไร

---

## ภาพรวมระบบ

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Mac ของคุณ                                     │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Docker Desktop (dependency/docker-compose.yml)                  │ │
│  │                                                                  │ │
│  │  ┌───────────┐  ┌───────────┐  ┌────────────────────────────┐  │ │
│  │  │   Kafka   │  │ Kafka UI  │  │    Mock Downstream         │  │ │
│  │  │           │  │           │  │  ┌─────────┐ ┌──────────┐  │  │ │
│  │  │ :9092 int │  │ :8080     │  │  │ :5001   │ │ :5002    │  │  │ │
│  │  │ :9094 ext │  │ (browser) │  │  │ chat    │ │analytics │  │  │ │
│  │  │ :9095 k8s │  │           │  │  └─────────┘ └──────────┘  │  │ │
│  │  └───────────┘  └───────────┘  │  ┌──────────┐              │  │ │
│  │                                  │  │ :5003    │              │  │ │
│  │                                  │  │ notif    │              │  │ │
│  │                                  │  └──────────┘              │  │ │
│  │                                  └────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌──────────────────────────────────┐                                │
│  │  Worker (npm start)              │  ← รัน local โดยตรง            │
│  │  connect kafka :9094             │                                │
│  │  POST ไป downstream :5001        │                                │
│  └──────────────────────────────────┘                                │
│                                                                       │
│  ┌──────────────────────────────────┐                                │
│  │  Minikube (VM)                   │  ← จำลอง Kubernetes            │
│  │  ┌────────────────────────────┐  │                                │
│  │  │  worker-chat pod           │  │                                │
│  │  │  connect kafka :9095       │──┼── ผ่าน host.minikube.internal  │
│  │  │  POST downstream :5001    │  │                                │
│  │  ├────────────────────────────┤  │                                │
│  │  │  worker-analytics pod      │  │                                │
│  │  │  worker-notification pod   │  │                                │
│  │  └────────────────────────────┘  │                                │
│  └──────────────────────────────────┘                                │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## แต่ละชิ้นคืออะไร

### 1. Kafka (อยู่ใน dependency/)

**คืออะไร:** ท่อส่งข้อมูล — ใครก็ได้ส่ง message เข้ามา, worker ดึงออกไป

**ทำอะไร:**
- เก็บ messages เรียงตาม "topic" (เช่น `line.messages`, `line.events`)
- หลาย consumer (worker) อ่านพร้อมกันได้โดยไม่ชนกัน

**Ports:**
| Port | ใครใช้ | ทำไม |
|------|--------|------|
| 9092 | container อื่นใน Docker (kafka-init, kafka-ui) | Docker network ภายใน |
| 9094 | worker ที่รันบน Mac โดยตรง (npm start) | เข้าจาก host machine |
| 9095 | worker pods ใน minikube | เข้าผ่าน host.minikube.internal |

**ทำไมต้อง 3 ports:** เพราะ Kafka ตอบ client ว่า "ไปหาฉันที่ address นี้" (advertised listener) — ต้องตอบ address ที่ถูกต้องสำหรับแต่ละ client

---

### 2. Mock Downstream (อยู่ใน dependency/)

**คืออะไร:** จำลอง REST API ปลายทาง (เช่น Chat Service, Analytics Service)

**ทำอะไร:**
- รับ POST request จาก worker
- Log ออกมาให้ดู
- นับจำนวน messages (GET /stats)

**ทำไมต้องมี:** ในชีวิตจริง downstream คือ service จริง (เช่น LINE Chat API) — ตอน dev ไม่มี service จริง เลยใช้ mock แทน

---

### 3. Worker (src/ — project หลัก)

**คืออะไร:** โปรแกรมที่ดึง message จาก Kafka แล้วส่งต่อไป downstream

**ทำอะไร:**
1. เปิดเครื่อง → อ่าน config (shared.json + worker-xxx.json)
2. Connect Kafka → subscribe topic
3. ดึง message ออกมา
4. POST ไป downstream URL
5. ถ้า downstream ล่ม → retry + pause → ลองใหม่

**Config:**
- `shared.json` — ค่าที่ทุก worker ใช้ร่วม (kafka broker, retry settings)
- `worker-xxx.json` — ค่าเฉพาะแต่ละ worker (topic, downstream URL, auth)

---

### 4. Helm (helm/)

**คืออะไร:** เครื่องมือ deploy worker ขึ้น Kubernetes

**ทำอะไร:**
1. อ่าน `values-generated.json` (สร้างจาก `npm run generate:helm`)
2. ใช้ template (`helm/kafka-worker/templates/`) สร้าง Kubernetes YAML
3. Apply ขึ้น K8s → สร้าง 1 Deployment (= 1 pod) ต่อ worker

**เปรียบเทียบ:**
- ไม่มี Helm = เขียน YAML เอง 50 บรรทัดต่อ worker → 3 workers = 150 บรรทัด
- มี Helm = เขียน template 1 ชุด + config JSON → generate ให้อัตโนมัติ

---

### 5. Minikube

**คืออะไร:** จำลอง Kubernetes cluster บนเครื่อง Mac

**ทำอะไร:**
- สร้าง VM เล็ก ๆ ที่มี Kubernetes ข้างใน
- ทำให้ทดสอบ deploy ได้โดยไม่ต้องมี cloud จริง

**สิ่งสำคัญ:** Minikube มี Docker daemon แยกจาก Docker Desktop

| Docker | ใช้ทำอะไร |
|--------|-----------|
| Docker Desktop | รัน dependency/ (Kafka, downstream) |
| Docker ใน Minikube | เก็บ worker image ที่ build ให้ pod ใช้ |

เลยต้อง `eval $(minikube docker-env)` เวลา build image สำหรับ minikube
แล้ว `eval $(minikube docker-env -u)` ตอนกลับมาใช้ Docker Desktop ปกติ

---

### 6. generate-helm-values.ts (scripts/)

**คืออะไร:** script ที่แปลง worker configs → Helm values

**ทำอะไร:**
1. อ่าน `src/workers/shared.json` + `worker-*.json`
2. แปลง `localhost` → `host.minikube.internal` (เพื่อให้ pod ใน minikube เข้าถึง host ได้)
3. แปลง port 9094 → 9095 สำหรับ Kafka (ใช้ MINIKUBE listener)
4. เขียนออกมาเป็น `helm/kafka-worker/values-generated.json`

---

### 7. ArgoCD (k8s/argocd/)

**คืออะไร:** ระบบ auto-deploy — ดู Git แล้ว deploy ให้อัตโนมัติ

**ทำอะไร:**
- Watch repo บน GitHub
- ถ้า `values-generated.json` เปลี่ยน → deploy workers ใหม่

---

## Data Flow — ข้อมูลไปยังไง

```
ใครก็ได้ (produce)
    │
    │  ส่ง message
    ▼
┌─────────┐
│  Kafka  │  เก็บ message ไว้ใน topic
└────┬────┘
     │
     │  worker ดึงออกมา (consume)
     ▼
┌──────────┐
│  Worker  │  อ่าน message + เพิ่ม auth header (ถ้ามี)
└────┬─────┘
     │
     │  POST request
     ▼
┌──────────────┐
│  Downstream  │  REST API ปลายทาง (mock หรือ service จริง)
└──────────────┘
```

---

## สรุป: ต้องเปิดอะไรบ้าง

### รัน Local (ทดสอบ worker บนเครื่อง)

```
เปิด:  dependency/ (docker compose up -d)  → Kafka + Downstream พร้อม
รัน:   npm start                            → Worker connect Kafka + POST downstream
ส่ง:   docker exec -i kafka ... produce     → message เข้า Kafka → worker ดึง → POST downstream
```

### Deploy Minikube (ทดสอบ K8s deploy)

```
เปิด:  dependency/ (docker compose up -d)  → Kafka + Downstream พร้อม (บน host)
เปิด:  minikube start                       → K8s cluster พร้อม
build: eval $(minikube docker-env) && docker build  → image พร้อมใน minikube
deploy: eval $(minikube docker-env -u) && npm run deploy  → workers ทำงานใน K8s
        pods connect kafka :9095 + downstream :500x ผ่าน host.minikube.internal
```

---

## ไฟล์สำคัญ — ดูตรงไหนเมื่อต้องการแก้

| ต้องการทำอะไร | แก้ที่ไหน |
|--------------|-----------|
| เพิ่ม/แก้ worker | สร้าง `src/workers/worker-xxx.json` |
| แก้ Kafka broker | `src/workers/shared.json` → kafkaBroker |
| แก้ retry/timeout | `src/workers/shared.json` หรือ worker-xxx.json |
| แก้ downstream URL | `src/workers/worker-xxx.json` → downstreamUrl |
| แก้ worker logic | `src/consumer.ts`, `src/forwarder.ts` |
| แก้ auth | `src/auth/` |
| แก้ K8s deploy template | `helm/kafka-worker/templates/` |
| แก้ Kafka setup | `dependency/docker-compose.yml` |
| แก้ mock downstream | `dependency/mock-downstream/server.ts` |
