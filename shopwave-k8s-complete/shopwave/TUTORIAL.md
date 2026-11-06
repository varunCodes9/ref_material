# 🛍️ ShopWave — Complete Kubernetes Learning Guide
## Ek real E-Commerce platform ke through poora K8s seekho
### Hinglish mein — Zero se Production tak

---

## 🏗️ ShopWave Architecture

```
                        Internet
                           │
                    ┌──────▼──────┐
                    │   Ingress   │  (HTTPS, Rate Limit, TLS)
                    │  Controller │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ API Gateway │  Port 3000
                    │  (JWT Auth) │  (Rate Limit, Routing)
                    └──┬──┬──┬───┘
                       │  │  │  │
          ┌────────────┘  │  │  └──────────────────┐
          │               │  │                     │
   ┌──────▼──────┐ ┌──────▼──┐ ┌───────▼──────┐ ┌─▼──────────────────┐
   │User Service │ │Product  │ │Order Service │ │Notification Service│
   │  Port 3001  │ │Service  │ │  Port 3003   │ │     Port 3004      │
   │(JWT, bcrypt)│ │Port 3002│ │(Kafka events)│ │  (Kafka consumer)  │
   └──────┬──────┘ └────┬────┘ └──────┬───────┘ └─────────┬──────────┘
          │             │             │                     │
     ┌────▼────┐   ┌────▼────┐  ┌────▼────┐          ┌────▼────┐
     │Postgres │   │Postgres │  │Postgres │          │Postgres │
     │(users)  │   │(products│  │(orders) │          │(notifs) │
     └─────────┘   │+ Redis  │  └────┬────┘          └─────────┘
                   │cache)   │       │
                   └─────────┘  ┌────▼────┐
                                │  Kafka  │
                                │(events) │
                                └─────────┘
```

---

## 📂 Project Structure

```
shopwave/
├── services/
│   ├── api-gateway/          ← Main darwaza — JWT verify, route karo
│   │   ├── src/index.js      ← Express app with proxy middleware
│   │   ├── package.json
│   │   └── Dockerfile
│   ├── user-service/         ← Registration, Login, JWT tokens
│   │   ├── src/index.js      ← bcrypt, JWT, Redis sessions
│   │   ├── package.json
│   │   └── Dockerfile
│   ├── product-service/      ← Products, Categories, Redis cache
│   │   ├── src/index.js      ← PostgreSQL + Redis caching
│   │   ├── package.json
│   │   └── Dockerfile
│   ├── order-service/        ← Orders, Stock management, Kafka events
│   │   ├── src/index.js      ← Kafka producer, product-service call
│   │   ├── package.json
│   │   └── Dockerfile
│   └── notification-service/ ← Email notifications via Kafka
│       ├── src/index.js      ← Kafka consumer, nodemailer
│       ├── package.json
│       └── Dockerfile
│
├── k8s/
│   ├── phase-1-foundations/  ← Namespace, Deployments, Services
│   ├── phase-2-config/       ← ConfigMaps, Secrets, Resources
│   ├── phase-3-storage/      ← StatefulSets, PVC, StorageClass
│   ├── phase-4-networking/   ← Ingress, NetworkPolicy, DNS
│   ├── phase-5-security/     ← RBAC, ServiceAccounts, SecurityContext
│   └── phase-6-operations/   ← HPA, Monitoring, Release Strategies
│
├── helm/shopwave/            ← Helm chart — ek command deployment
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
│
├── infra/
│   └── postgres/             ← DB init scripts
│
├── docker-compose.yml        ← Local development
├── docs/
│   ├── incident-playbook.md  ← Production incident guide
│   └── interview-questions.md← Interview prep
└── TUTORIAL.md               ← Yeh file!
```

---

## 🚀 Setup — Pehle Local, Phir K8s

### Option A: Docker Compose (local development)
```bash
# Prerequisites: Docker Desktop installed ho
cd shopwave

# Sab kuch start karo
docker compose up -d

# Status check
docker compose ps

# Logs dekho
docker compose logs -f api-gateway

# Test karo
curl http://localhost:3000/health

# Register karo
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@shopwave.com","password":"Password123"}'

# Login karo
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@shopwave.com","password":"Password123"}'
# Response mein accessToken milega — baad ke requests mein use karo

# Products dekho (public route — token nahi chahiye)
curl http://localhost:3000/api/products

# Band karo
docker compose down
```

---

## 📖 Phase 1: K8s Foundations

### Prerequisites
```bash
# Minikube install karo (local K8s cluster)
# Mac:
brew install minikube
# Linux:
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube

# kubectl install
# Mac:
brew install kubectl
# Linux:
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install kubectl /usr/local/bin/kubectl

# Cluster start karo
minikube start --memory=4096 --cpus=4 --driver=docker

# Verify
kubectl cluster-info
kubectl get nodes
# Output: minikube   Ready   control-plane   1m   v1.28.x
```

### Step 1: Namespace banao
```bash
kubectl apply -f k8s/phase-1-foundations/01-namespace.yaml
kubectl get namespaces | grep shopwave
# shopwave   Active   10s
# shopwave-monitoring   Active   10s

# Ab saare commands mein -n shopwave lagana hoga
# Shortcut: context set karo
kubectl config set-context --current --namespace=shopwave
# Ab default namespace shopwave hai!
```

### Step 2: Images build karo (Minikube ke liye)
```bash
# Minikube ke docker environment use karo
eval $(minikube docker-env)
# Ab docker commands minikube ke andar build karenge

# Saari services build karo
for svc in api-gateway user-service product-service order-service notification-service; do
  echo "Building $svc..."
  docker build -t shopwave/$svc:1.0.0 ./services/$svc/
done

echo "✓ All images built"
docker images | grep shopwave
```

### Step 3: Phase 2 Config pehle apply karo (Deployments unpe depend karte hain)
```bash
# ConfigMap
kubectl apply -f k8s/phase-2-config/01-configmap.yaml
kubectl describe configmap shopwave-config

# Secrets (IMPORTANT: Pehle secrets, phir deployments)
kubectl apply -f k8s/phase-2-config/02-secrets.yaml
kubectl get secrets
# KABHI: kubectl get secret shopwave-secrets -o yaml  (value expose hogi)
```

### Step 4: Infrastructure deploy karo
```bash
# Storage (Phase 3)
kubectl apply -f k8s/phase-3-storage/01-statefulsets.yaml
kubectl apply -f k8s/phase-3-storage/02-redis-statefulset.yaml
kubectl apply -f k8s/phase-3-storage/03-kafka-statefulset.yaml

# Wait karo ready hone ka
kubectl wait --for=condition=ready pod/postgres-0 --timeout=120s
kubectl wait --for=condition=ready pod/redis-0 --timeout=60s
echo "Infrastructure ready!"
```

### Step 5: Application deploy karo
```bash
kubectl apply -f k8s/phase-1-foundations/03-deployments.yaml
kubectl apply -f k8s/phase-1-foundations/04-services.yaml

# Progress dekho
kubectl get pods -w
# NAME                              READY   STATUS    RESTARTS
# api-gateway-6d7f9b8c4-abc12       1/1     Running   0
# user-service-7c9d4f5b6-xyz34      1/1     Running   0
# product-service-8b5e3c2d1-mno56   1/1     Running   0
# order-service-9f4c7e1a8-pqr78     1/1     Running   0

# Sabka status ek saath
kubectl get all
```

### Step 6: Test karo (K8s ke andar)
```bash
# Port forward karo local access ke liye
kubectl port-forward svc/api-gateway 3000:80 &

# Test
curl http://localhost:3000/health
# {"status":"ok","service":"api-gateway","version":"1.0.0"}

# Register
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"name":"K8s User","email":"k8s@shopwave.com","password":"K8sRocks123"}'

# Products (category seed data aayega automatically)
curl http://localhost:3000/api/products

# Background port-forward band karo
kill %1
```

---

## 📖 Phase 2: Configuration

### ConfigMap Live Update
```bash
# Feature flag update karo — bina deployment ke!
kubectl patch configmap shopwave-config --type=merge \
  -p '{"data":{"LOG_LEVEL":"debug"}}'

# Deployment restart karo (config changes ke liye zaroori)
kubectl rollout restart deployment/api-gateway

# Verify
kubectl logs deployment/api-gateway | head -5
# Debug logs dikhne chahiye ab

# BREAK IT: Wrong DB host
kubectl patch configmap shopwave-config --type=merge \
  -p '{"data":{"DB_HOST":"wrong-postgres"}}'
kubectl rollout restart deployment/user-service
kubectl logs deployment/user-service | grep -i "error"
# "Error: connect ECONNREFUSED wrong-postgres:5432"

# FIX IT:
kubectl patch configmap shopwave-config --type=merge \
  -p '{"data":{"DB_HOST":"postgres-service"}}'
kubectl rollout restart deployment/user-service
```

---

## 📖 Phase 3: Storage

### StatefulSet Magic — Pod delete karo, data safe rahega
```bash
# Postgres mein data daalo
kubectl exec -it postgres-0 -- psql -U shopwave -d shopwave_users \
  -c "INSERT INTO users (name, email, password) VALUES ('Test', 'test@test.com', 'hash');"

# Pod delete karo!
kubectl delete pod postgres-0
# Dekho — naya pod aa raha hai
kubectl get pods -w
# postgres-0 → Terminating → Pending → Running

# Data check karo — data safe hai!
kubectl exec -it postgres-0 -- psql -U shopwave -d shopwave_users \
  -c "SELECT name, email FROM users;"
# Test   test@test.com  ← Data survived pod deletion!
```

---

## 📖 Phase 4: Networking

### Ingress Setup
```bash
# Ingress controller enable karo
minikube addons enable ingress
kubectl get pods -n ingress-nginx  # Wait for it to be Running

# Ingress apply karo
kubectl apply -f k8s/phase-4-networking/01-ingress.yaml

# Minikube IP nikalo
minikube ip
# e.g., 192.168.49.2

# /etc/hosts update karo (sirf local testing ke liye)
echo "$(minikube ip) api.shopwave.com" | sudo tee -a /etc/hosts

# Test
curl http://api.shopwave.com/api/products
```

### NetworkPolicy Test
```bash
# Policies apply karo
kubectl apply -f k8s/phase-4-networking/02-networkpolicy.yaml

# BREAK IT: user-service se order-service access karo (nahi hona chahiye)
kubectl exec -it deployment/user-service -- wget -qO- --timeout=5 http://order-service:3003/health
# wget: download timed out ← BLOCKED! Yahi chahiye tha!

# product-service se postgres access karo (hona chahiye)
kubectl exec -it deployment/product-service -- wget -qO- http://postgres-service:5432
# Connection (port is open) ← ALLOWED! Sahi hai.
```

---

## 📖 Phase 5: Security

### RBAC Test
```bash
# Apply karo
kubectl apply -f k8s/phase-5-security/01-rbac.yaml

# Test: kya user-service-sa secrets dekh sakta hai?
kubectl auth can-i get secrets \
  --as=system:serviceaccount:shopwave:user-service-sa
# yes ← OK (zaroori hai JWT_SECRET ke liye)

# Test: kya user-service-sa pods delete kar sakta hai?
kubectl auth can-i delete pods \
  --as=system:serviceaccount:shopwave:user-service-sa
# no ← PERFECT! Least privilege!

# BREAK IT: Default SA ke saath kya hota hai?
kubectl auth can-i get secrets \
  --as=system:serviceaccount:shopwave:default
# Depends on cluster config — default SA ko restrict karo
```

---

## 📖 Phase 6: Production Operations

### HPA in Action
```bash
# Metrics server zaroori hai
minikube addons enable metrics-server

# HPA apply karo
kubectl apply -f k8s/phase-6-operations/hpa.yaml

# Wait for metrics (kuch minutes)
kubectl get hpa

# LOAD TEST — dekho HPA kaise scale karta hai!
kubectl run load-generator --image=busybox --rm -it -n shopwave -- \
  sh -c "while true; do wget -qO- http://api-gateway/api/products; done"

# Doosre terminal mein watch karo
watch -n 5 kubectl get hpa

# Product service pods badh jayenge 2 → 4 → 8
# Load band karo → 5 min mein wapas 2 pe aayenge
```

### Canary Deployment
```bash
# Current: 100% traffic → api-gateway:1.0.0
# Goal: 10% traffic → api-gateway:2.0.0 (canary)

# Canary deploy karo (1 pod = ~10% traffic agar 9 stable pods hain)
kubectl apply -f k8s/phase-6-operations/release-strategies.yaml

# Check karo kaun sa version serve kar raha hai
for i in $(seq 1 20); do
  curl -s http://localhost:3000/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('version','?'))"
done
# Mostly 1.0.0, kuch 2.0.0

# Canary OK hai? Full rollout
kubectl set image deployment/api-gateway api-gateway=shopwave/api-gateway:2.0.0
# Problem hai? Canary delete karo
kubectl delete deployment api-gateway-canary
```

### Monitoring Setup
```bash
# Helm setup
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Prometheus + Grafana install
helm install monitoring prometheus-community/kube-prometheus-stack \
  -n shopwave-monitoring --create-namespace

# Wait
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=grafana \
  -n shopwave-monitoring --timeout=120s

# Grafana access
kubectl port-forward svc/monitoring-grafana 3001:80 -n shopwave-monitoring &
# Browser: http://localhost:3001
# Username: admin, Password: prom-operator

# ServiceMonitor apply karo
kubectl apply -f k8s/phase-6-operations/monitoring.yaml

# Loki (logging) install
helm install loki grafana/loki-stack \
  -n shopwave-monitoring \
  --set promtail.enabled=true \
  --set grafana.enabled=false   # Grafana already hai
```

### Helm Deploy (Production Way)
```bash
# Full app ek command mein
helm install shopwave ./helm/shopwave \
  -n shopwave \
  --create-namespace \
  --set global.imageTag=1.0.0

# Dev environment ke liye
helm install shopwave-dev ./helm/shopwave \
  -n shopwave-dev \
  --create-namespace \
  --set global.imageTag=latest \
  --set apiGateway.replicas=1 \
  --set productService.replicas=1

# Upgrade (new version)
helm upgrade shopwave ./helm/shopwave \
  -n shopwave \
  --set global.imageTag=1.1.0

# Rollback
helm rollback shopwave 1 -n shopwave

# Status
helm list -n shopwave
helm history shopwave -n shopwave
```

---

## 🛡️ Production Checklist

### Deployment se Pehle
```
□ Images tag pinned hai (latest mat use karo production mein!)
□ Resource requests/limits set hain saari services ke liye
□ Liveness + Readiness + Startup probes configured
□ Secrets Git mein nahi hain (.gitignore check karo)
□ RBAC least privilege follow karta hai
□ NetworkPolicy default-deny-all lagayi hai
□ HPA configured hai for critical services
□ PVC storageClass sahi hai
□ Monitoring alerts set hain
□ Ingress TLS configured hai
```

### Post-Deployment Verify
```bash
kubectl get all -n shopwave              # Sab running?
kubectl get pvc -n shopwave             # Storage bound?
kubectl get ingress -n shopwave         # Ingress configured?
kubectl get hpa -n shopwave            # Autoscaling ready?
kubectl top pods -n shopwave           # Resources OK?
kubectl get events -n shopwave | grep Warning  # Koi warnings?
```

---

## 🔗 Quick Reference

| Kya karna hai | Command |
|---|---|
| Saare pods | `kubectl get pods -n shopwave` |
| Pod logs | `kubectl logs deployment/user-service -n shopwave` |
| Pod ke andar | `kubectl exec -it <pod> -n shopwave -- sh` |
| Pod describe | `kubectl describe pod <pod> -n shopwave` |
| Rollback | `kubectl rollout undo deployment/<name> -n shopwave` |
| Restart | `kubectl rollout restart deployment/<name> -n shopwave` |
| Scale | `kubectl scale deployment/<name> --replicas=5 -n shopwave` |
| Port forward | `kubectl port-forward svc/<name> 8080:80 -n shopwave` |
| Events | `kubectl get events -n shopwave --sort-by=.lastTimestamp` |
| Config update | `kubectl patch configmap shopwave-config --type=merge -p '{"data":{"KEY":"VALUE"}}' -n shopwave` |
| Secret value | `kubectl get secret shopwave-secrets -n shopwave -o jsonpath='{.data.JWT_SECRET}' \| base64 -d` |
| Resource usage | `kubectl top pods -n shopwave` |
| RBAC check | `kubectl auth can-i get secrets --as=system:serviceaccount:shopwave:user-service-sa -n shopwave` |
