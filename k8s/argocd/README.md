# ArgoCD Setup

## Flow

```
Developer push code/config
        │
        ▼
   GitHub repo
        │
        ▼
   ArgoCD watches repo
        │
        ├── ตรวจ helm/kafka-worker/values-generated.json
        ├── Render Helm templates
        └── Apply to K8s cluster
```

## Prerequisites

- ArgoCD installed ใน cluster (namespace `argocd`)
- Repo accessible จาก ArgoCD

## Install ArgoCD (minikube)

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# รอ pods ready
kubectl wait --for=condition=available deployment/argocd-server -n argocd --timeout=300s

# เข้า UI
kubectl port-forward svc/argocd-server -n argocd 8443:443

# ดู initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

เข้า https://localhost:8443 (user: `admin`, password: จาก command ด้านบน)

## Deploy Application

```bash
kubectl apply -f k8s/argocd/application.yaml
```

## Workflow หลัง setup

1. สร้าง/แก้ไฟล์ใน `src/workers/`
2. รัน `npm run generate:helm` (สร้าง values-generated.json)
3. Commit + Push
4. ArgoCD detect changes → auto sync → Deployments อัปเดตอัตโนมัติ

## CI/CD Pipeline (แนะนำ)

เพิ่มใน GitHub Actions:

```yaml
- name: Generate Helm values
  run: npm run generate:helm

- name: Commit generated values
  run: |
    git add helm/kafka-worker/values-generated.json
    git commit -m "chore: update helm values" || true
    git push
```

ArgoCD จะ pickup commit นี้แล้ว sync ให้อัตโนมัติ
