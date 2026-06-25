# Kubernetes Deployment

ย้ายไปใช้ Helm chart — ดู `helm/kafka-worker/`

## Deploy

```bash
# จาก root directory
npm run deploy
```

เท่ากับ:
```bash
npm run generate:helm
helm upgrade --install kafka-workers ./helm/kafka-worker -f helm/kafka-worker/values-generated.json
```

## เพิ่ม Worker

สร้างไฟล์ `src/workers/worker-xxx.json` → `npm run deploy`

ดูรายละเอียดที่ [README-DEVOPS.md](../README-DEVOPS.md)
